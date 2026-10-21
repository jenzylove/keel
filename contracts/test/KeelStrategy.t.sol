// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "./utils/Test.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {KeelStrategy} from "../src/KeelStrategy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Stands in for KeelMarket: counts accruals, reports a config delay.
contract MockMarket {
    uint256 public accruals;
    uint256 public configDelay = 2 days;

    function accrue() external {
        accruals++;
    }
}

/// @dev The test contract plays the vault; `market` is a separate contract.
contract KeelStrategyTest is Test {
    MockERC20 musd;
    KeelStrategy s;
    MockMarket mm;
    address market;
    address borrower = address(0xB0B);
    /// @dev The vault's sMUSD supply, read by claimYield.
    uint256 public totalSupply;

    function setUp() external {
        vm.warp(1_800_000_000);
        musd = new MockERC20("Mezo USD", "MUSD");
        s = new KeelStrategy(IERC20(address(musd)), address(this), 2_000, 1_000);
        mm = new MockMarket();
        market = address(mm);
        s.setMarket(market);
        musd.mint(address(this), 1_000_000e18);
        musd.approve(address(s), type(uint256).max);
        s.allocate(1_000_000e18);
    }

    function test_allocate_tracks_principal() external view {
        assertEq(s.principal(), 1_000_000e18, "principal");
        assertEq(s.liquid(), 1_000_000e18, "all liquid");
        assertEq(s.lendable(), 200_000e18, "20% lendable");
    }

    function test_principal_cap_stops_new_deposits_only() external {
        vm.prank(address(0xBAD));
        vm.expectRevert(KeelStrategy.OnlyAdmin.selector);
        s.setPrincipalCap(1);

        s.setPrincipalCap(1_000_500e18);
        musd.mint(address(this), 1_000e18);
        s.allocate(500e18); // up to the cap is fine
        vm.expectRevert(abi.encodeWithSelector(KeelStrategy.PrincipalCapReached.selector, 1_000_501e18, 1_000_500e18));
        s.allocate(1e18);
        s.deallocate(100e18); // withdrawals are never capped
        s.setPrincipalCap(0); // 0 lifts the limit
        s.allocate(500e18);
        assertEq(s.principal(), 1_000_900e18, "principal");
    }

    function test_draw_respects_cap() external {
        vm.prank(market);
        s.draw(borrower, 200_000e18);
        assertEq(s.lent(), 200_000e18, "lent");
        vm.prank(market);
        vm.expectRevert(abi.encodeWithSelector(KeelStrategy.LendCapExceeded.selector, 1, 0));
        s.draw(borrower, 1);
    }

    function test_savers_can_withdraw_everything_liquid_at_max_lending() external {
        vm.prank(market);
        s.draw(borrower, 200_000e18);
        s.deallocate(800_000e18);
        assertEq(s.principal(), 200_000e18, "principal left equals lent");
        vm.expectRevert(abi.encodeWithSelector(KeelStrategy.InsufficientLiquidity.selector, 1, 0));
        s.deallocate(1);
    }

    function test_cap_shrinks_after_withdrawals_without_underflow() external {
        vm.prank(market);
        s.draw(borrower, 200_000e18);
        s.deallocate(500_000e18);
        vm.prank(market);
        vm.expectRevert(abi.encodeWithSelector(KeelStrategy.LendCapExceeded.selector, 1, 0));
        s.draw(borrower, 1);
    }

    function test_interest_splits_between_reserve_and_savers() external {
        vm.prank(market);
        s.draw(borrower, 100_000e18);
        musd.mint(market, 105_000e18);
        vm.prank(market);
        musd.transfer(address(s), 105_000e18);
        vm.prank(market);
        s.repaid(100_000e18, 5_000e18);
        assertEq(s.reserve(), 500e18, "10% to reserve");
        assertEq(s.yieldOwed(), 4_500e18, "90% to savers");
        assertEq(s.claimYield(), 0, "nothing released yet");
        vm.warp(block.timestamp + 7 days);
        uint256 before = musd.balanceOf(address(this));
        assertEq(s.claimYield(), 4_500e18, "claimed after the drip");
        assertEq(musd.balanceOf(address(this)) - before, 4_500e18, "vault received yield");
        assertEq(s.liquid(), 1_000_000e18, "principal whole again");
    }

    function test_bad_debt_hits_reserve_first() external {
        vm.prank(market);
        s.draw(borrower, 100_000e18);
        musd.mint(market, 10_000e18);
        vm.prank(market);
        musd.transfer(address(s), 10_000e18);
        vm.prank(market);
        s.repaid(0, 10_000e18); // 1,000 to reserve
        vm.prank(market);
        s.writeOff(1_500e18);
        assertEq(s.reserve(), 0, "reserve used up");
        assertEq(s.badDebt(), 500e18, "loss beyond reserve recorded");
        assertEq(s.lent(), 98_500e18, "lent reduced");
    }

    function test_migrate_blocked_while_lent_then_moves_principal() external {
        vm.prank(market);
        s.draw(borrower, 1e18);
        vm.expectRevert(abi.encodeWithSelector(KeelStrategy.LoansOutstanding.selector, 1e18));
        s.migrate(address(0xDEAD));
        musd.mint(market, 1e18);
        vm.startPrank(market);
        musd.transfer(address(s), 1e18);
        s.repaid(1e18, 0);
        vm.stopPrank();
        assertEq(s.migrate(address(0xDEAD)), 1_000_000e18, "migrated");
        assertEq(musd.balanceOf(address(0xDEAD)), 1_000_000e18, "new strategy got it");
    }

    function test_only_vault_and_market() external {
        vm.prank(borrower);
        vm.expectRevert(KeelStrategy.OnlyVault.selector);
        s.claimYield();
        vm.expectRevert(KeelStrategy.OnlyMarket.selector);
        s.draw(borrower, 1);
    }

    /// @dev The test contract is the vault; Keel's admin is the vault's owner.
    address public owner = address(this);

    function test_admin_is_the_vault_owner_read_live() external {
        assertEq(s.admin(), address(this), "admin = vault owner");
        owner = address(0xD00D);
        assertEq(s.admin(), address(0xD00D), "follows a change of vault owner");
        vm.expectRevert(KeelStrategy.OnlyAdmin.selector);
        s.proposeParams(1_000, 1_000);
        vm.prank(address(0xD00D));
        s.proposeParams(1_000, 1_000);
        vm.warp(block.timestamp + 2 days);
        s.applyParams();
        assertEq(s.maxLentBps(), 1_000, "new owner governs");
    }

    function test_market_can_only_be_replaced_with_nothing_lent() external {
        vm.prank(market);
        s.draw(borrower, 1e18);
        vm.expectRevert(KeelStrategy.MarketAlreadySet.selector);
        s.setMarket(address(0xBAD));
    }

    function test_params_have_a_ceiling() external {
        vm.expectRevert(KeelStrategy.BadParams.selector);
        s.proposeParams(5_001, 1_000);
    }

    function test_params_wait_the_market_delay_and_accrue_first() external {
        s.proposeParams(1_000, 1_000);
        vm.expectRevert(abi.encodeWithSelector(KeelStrategy.TooEarly.selector, block.timestamp + 2 days));
        s.applyParams();
        vm.warp(block.timestamp + 2 days);
        uint256 a = mm.accruals();
        s.applyParams();
        assertEq(mm.accruals(), a + 1, "market accrued before the cap changed");
        assertEq(s.maxLentBps(), 1_000, "applied");
        vm.expectRevert(KeelStrategy.NothingPending.selector);
        s.applyParams();
    }

    function test_principal_changes_accrue_the_market_first() external {
        uint256 a = mm.accruals();
        musd.mint(address(this), 1e18);
        s.allocate(1e18);
        s.deallocate(1e18);
        assertEq(mm.accruals(), a + 2, "accrued on allocate and deallocate");
    }

    function _repayInterest(uint256 interest) internal {
        musd.mint(market, interest);
        vm.startPrank(market);
        musd.transfer(address(s), interest);
        s.repaid(0, interest);
        vm.stopPrank();
    }

    function test_yield_is_released_evenly_over_the_drip() external {
        _repayInterest(1_000e18); // 900 to savers
        vm.warp(block.timestamp + 3.5 days);
        assertEq(s.claimYield(), 450e18, "half after half the period");
        _repayInterest(1_000e18); // 450 left + 900 new, restarts the period
        vm.warp(block.timestamp + 7 days);
        assertEq(s.claimYield(), 1_350e18, "the rest after a full period");
    }

    function test_dust_yield_is_held_back_so_vault_calls_never_revert() external {
        totalSupply = 1_000_000e18;
        _repayInterest(10); // 9 wei to savers: too small for the vault's index
        vm.warp(block.timestamp + 7 days);
        assertEq(s.claimYield(), 0, "held back");
        assertEq(s.yieldOwed(), 9, "still owed");
        _repayInterest(10e18);
        vm.warp(block.timestamp + 7 days);
        assertEq(s.claimYield(), 9e18 + 9, "paid once large enough");
    }

    function test_interest_makes_good_a_loss_before_paying_savers() external {
        vm.prank(market);
        s.draw(borrower, 10_000e18);
        vm.prank(market);
        s.writeOff(1_000e18); // no reserve yet: all uncovered
        assertEq(s.uncovered(), 1_000e18, "uncovered");
        assertEq(s.liquid() + s.lent(), 999_000e18, "principal short by the loss");
        _repayInterest(1_500e18);
        assertEq(s.uncovered(), 0, "covered first");
        assertEq(s.reserve(), 50e18, "10% of the rest");
        assertEq(s.yieldOwed(), 450e18, "savers get the rest");
        assertEq(s.liquid() + s.lent(), s.principal(), "principal whole again");
    }

    function test_migration_after_a_loss_moves_what_is_there() external {
        vm.prank(market);
        s.draw(borrower, 10_000e18);
        vm.prank(market);
        s.writeOff(10_000e18);
        assertEq(s.migrate(address(0xDEAD)), 990_000e18, "does not revert; moves the liquid principal");
        assertEq(s.principal(), 0, "emptied");
    }

    function test_anyone_can_cover_a_loss() external {
        vm.prank(market);
        s.draw(borrower, 10_000e18);
        vm.prank(market);
        s.writeOff(1_000e18);
        musd.mint(borrower, 2_000e18);
        vm.startPrank(borrower);
        musd.approve(address(s), type(uint256).max);
        s.coverLoss(2_000e18);
        vm.stopPrank();
        assertEq(s.uncovered(), 0, "covered");
        assertEq(musd.balanceOf(borrower), 11_000e18, "only the loss was taken (10k drawn + 2k - 1k)");
    }

    function test_sweep_after_migration_only() external {
        _repayInterest(1_000e18);
        vm.expectRevert(KeelStrategy.StillActive.selector);
        s.sweep();
        s.migrate(address(0xDEAD));
        s.sweep();
        assertEq(musd.balanceOf(address(s)), 0, "leftover reserve and yield swept to governance");
    }

    function testFuzz_liquid_never_counts_reserve_or_yield(uint256 drawn, uint256 interest) external {
        drawn = bound(drawn, 0, 200_000e18);
        interest = bound(interest, 0, 1_000_000e18);
        vm.prank(market);
        s.draw(borrower, drawn);
        musd.mint(market, drawn + interest);
        vm.startPrank(market);
        musd.transfer(address(s), drawn + interest);
        s.repaid(drawn, interest);
        vm.stopPrank();
        assertEq(s.liquid(), 1_000_000e18, "liquid is exactly principal");
        assertEq(s.reserve() + s.yieldOwed(), interest, "interest fully accounted");
    }
}
