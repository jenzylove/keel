// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "./utils/Test.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {KeelStrategy} from "../src/KeelStrategy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev The test contract plays the vault; `market` is a separate address.
contract KeelStrategyTest is Test {
    MockERC20 musd;
    KeelStrategy s;
    address market = address(0xA11CE);
    address borrower = address(0xB0B);

    function setUp() external {
        musd = new MockERC20("Mezo USD", "MUSD");
        s = new KeelStrategy(IERC20(address(musd)), address(this), 2_000, 1_000);
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
        uint256 before = musd.balanceOf(address(this));
        assertEq(s.claimYield(), 4_500e18, "claimed");
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
        s.setParams(1_000, 1_000);
        vm.prank(address(0xD00D));
        s.setParams(1_000, 1_000);
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
        s.setParams(5_001, 1_000);
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
