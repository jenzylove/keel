// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "./utils/Test.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockVeBTC, MockVoter, MockPriceFeed, MockPegOracle} from "./mocks/MezoMocks.sol";
import {KeelStrategy} from "../src/KeelStrategy.sol";
import {KeelMarket} from "../src/KeelMarket.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IVeBTC, IVoter, IPriceFeed} from "../src/interfaces/IMezo.sol";
import {IPegOracle} from "../src/oracles/PegOracles.sol";
import {MiniVault} from "./AuditRegression.t.sol";

/// @dev Withdrawals through a reduction of the real vault while loans are
///      out: the vault pays the saver straight after `deallocate`, so any
///      withdrawal up to `withdrawable()` must go through and anything above
///      it must fail with the amount available.
contract GracefulWithdraw is Test {
    MockERC20 musd;
    MockERC20 btc;
    MockPriceFeed feed;
    MockPegOracle peg;
    KeelStrategy strat;
    KeelMarket m;
    MiniVault vault;
    address alice = address(0xA11CE);
    address saver = address(0x5A);
    address saver2 = address(0x5B);

    function setUp() external {
        vm.warp(1_800_000_000);
        musd = new MockERC20("MUSD", "MUSD");
        btc = new MockERC20("BTC", "BTC");
        MockVeBTC ve = new MockVeBTC();
        MockVoter voter = new MockVoter(ve, new MockERC20("R", "R"));
        feed = new MockPriceFeed();
        feed.set(80_000e18);
        peg = new MockPegOracle();
        vault = new MiniVault(IERC20(address(musd)));
        strat = new KeelStrategy(IERC20(address(musd)), address(vault), 2_000, 1_000);
        vault.setInitialStrategy(address(strat));
        KeelMarket.Config memory c;
        c.risks[0] = KeelMarket.Risk(5_000, 6_500, 500);
        c.risks[1] = KeelMarket.Risk(4_500, 6_000, 800);
        c.risks[2] = KeelMarket.Risk(4_000, 5_500, 1_000);
        c.rates = KeelMarket.RateParams(0.03e18, 0.04e18, 0.75e18, 0.8e18);
        c.peg = KeelMarket.PegParams(0.995e18, 0.985e18, 0.04e18, 0.01e18, 7 days);
        c.pegOracle = IPegOracle(address(peg));
        c.minLoan = 100e18;
        m = new KeelMarket(
            KeelMarket.Deps(
                IERC20(address(musd)), IERC20(address(btc)), IVeBTC(address(ve)), IVoter(address(voter)),
                IPriceFeed(address(feed)), IPegOracle(address(peg)), strat
            ),
            c,
            2 days
        );
        strat.setMarket(address(m));

        address[3] memory us = [saver, saver2, alice];
        for (uint256 i; i < 3; i++) {
            musd.mint(us[i], 1_000_000e18);
            vm.startPrank(us[i]);
            musd.approve(address(vault), type(uint256).max);
            musd.approve(address(m), type(uint256).max);
            vm.stopPrank();
        }
        vm.prank(saver);
        vault.deposit(500_000e18);
        vm.prank(saver2);
        vault.deposit(500_000e18);
        btc.mint(alice, 100e18);
        vm.prank(alice);
        btc.approve(address(m), type(uint256).max);
    }

    function test_withdrawal_above_withdrawable_gets_a_clear_error() external {
        vm.prank(alice);
        m.openWithBtc(10e18, 200_000e18);
        assertEq(strat.withdrawable(), 800_000e18, "what the vault can pull");
        vm.prank(saver);
        vault.withdraw(500_000e18);
        assertEq(strat.withdrawable(), 300_000e18, "exact after a withdrawal");
        vm.prank(saver2);
        vm.expectRevert(abi.encodeWithSelector(KeelStrategy.InsufficientLiquidity.selector, 300_000e18 + 1, 300_000e18));
        vault.withdraw(300_000e18 + 1);
        vm.prank(saver2);
        vault.withdraw(300_000e18);
        assertEq(strat.withdrawable(), 0, "drained until repayments");
    }

    function test_borrowing_pauses_under_the_buffer_and_reopens_after_repayment() external {
        vm.prank(alice);
        uint256 a = m.openWithBtc(10e18, 200_000e18);
        vm.prank(alice);
        uint256 b = m.openWithBtc(10e18, 0);
        assertTrue(m.borrowingOpen(), "open while liquid");
        vm.prank(saver);
        vault.withdraw(500_000e18);
        vm.prank(saver2);
        vault.withdraw(290_000e18);
        // Principal 210,000, liquid 10,000, buffer 21,000.
        assertTrue(!strat.liquidityHealthy(), "under the buffer");
        assertTrue(!m.borrowingOpen(), "paused");
        vm.prank(alice);
        vm.expectRevert(KeelMarket.BorrowingPaused.selector);
        m.borrow(b, 100e18);

        vm.prank(alice);
        m.repay(a, 100_000e18); // repaying stays open
        assertTrue(m.borrowingOpen(), "reopened once liquid again");
        vm.prank(alice);
        m.repay(a, type(uint256).max);
        vm.prank(alice);
        m.borrow(b, 1_000e18);
        assertEq(strat.lent(), 1_000e18, "borrowing works again");
    }

    function testFuzz_vault_withdraw_up_to_withdrawable_always_succeeds(
        uint256 borrowed,
        uint256 elapsed,
        bool payInterest,
        uint256 first,
        uint256 second
    ) external {
        borrowed = bound(borrowed, 100e18, 200_000e18);
        elapsed = bound(elapsed, 0, 365 days);
        vm.prank(alice);
        uint256 id = m.openWithBtc(10e18, borrowed);
        vm.warp(block.timestamp + elapsed);
        uint256 debt = m.debtOf(id);
        // Paying only the interest books a reserve the vault can then draw on.
        if (payInterest && debt > borrowed) {
            vm.prank(alice);
            m.repay(id, debt - borrowed);
        }

        first = bound(first, 1, _min(strat.withdrawable(), 500_000e18));
        vm.prank(saver);
        vault.withdraw(first);

        uint256 avail = strat.withdrawable();
        if (avail > 0) {
            second = bound(second, 1, _min(avail, 500_000e18));
            vm.prank(saver2);
            vault.withdraw(second);
        }
        avail = strat.withdrawable();
        vm.prank(saver2);
        vm.expectRevert(abi.encodeWithSelector(KeelStrategy.InsufficientLiquidity.selector, avail + 1, avail));
        vault.withdraw(avail + 1);

        // Yield owed was never touched, so the vault's claims keep working.
        vm.warp(block.timestamp + 7 days);
        vault.receiveYieldFromStrategy();

        // Once repaid, everything is liquid and whole again.
        vm.prank(alice);
        m.repay(id, type(uint256).max);
        assertEq(strat.liquid(), strat.principal(), "principal whole");
        assertEq(strat.withdrawable(), strat.principal(), "all withdrawable");
        assertEq(strat.reserveHeld(), strat.reserve(), "reserve held again");
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
