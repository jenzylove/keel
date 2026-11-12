// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "./utils/Test.sol";
import {MockERC20, MockBurnableERC20} from "./mocks/MockERC20.sol";
import {MockVeBTC, MockVoter, MockPriceFeed, MockPegOracle} from "./mocks/MezoMocks.sol";
import {MockNativeBTC, MockActivePool, MockMezoTroves} from "./mocks/TroveMocks.sol";
import {KeelStrategy} from "../src/KeelStrategy.sol";
import {KeelMarket} from "../src/KeelMarket.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {
    IVeBTC,
    IVoter,
    IPriceFeed,
    IBorrowerOperationsSignatures,
    ITroveManager,
    IBorrowerOperations
} from "../src/interfaces/IMezo.sol";
import {IPegOracle} from "../src/oracles/PegOracles.sol";

/// @dev Moving a Mezo trove into Keel against mocks of Mezo's trove
///      contracts. BTC is a native balance with an ERC20 view, as on Mezo.
///      The test contract plays the savings vault and the admin.
contract MoveTroveUnitTest is Test {
    MockBurnableERC20 musd;
    MockNativeBTC btc;
    MockPriceFeed feed;
    MockPegOracle peg;
    MockActivePool ap;
    MockMezoTroves troves;
    KeelStrategy strat;
    KeelMarket m;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    uint256 constant PRICE = 80_000e18;
    uint256 constant GAS_COMP = 200e18;

    address public owner = address(this);

    function setUp() external {
        vm.warp(1_800_000_000);
        musd = new MockBurnableERC20("Mezo USD", "MUSD");
        btc = new MockNativeBTC();
        MockVeBTC ve = new MockVeBTC();
        MockVoter voter = new MockVoter(ve, new MockERC20("R", "R"));
        feed = new MockPriceFeed();
        feed.set(PRICE);
        peg = new MockPegOracle();
        ap = new MockActivePool();
        troves = new MockMezoTroves(musd, ap);
        ap.setTroves(address(troves));

        KeelMarket.Config memory c;
        c.risks[0] = KeelMarket.Risk(5_000, 6_500, 500);
        c.risks[1] = KeelMarket.Risk(4_500, 6_000, 800);
        c.risks[2] = KeelMarket.Risk(4_000, 5_500, 1_000);
        c.rates = KeelMarket.RateParams(0.03e18, 0.04e18, 0.75e18, 0.8e18);
        c.peg = KeelMarket.PegParams(0.995e18, 0.985e18, 0.04e18, 0.01e18, 7 days);
        c.pegOracle = IPegOracle(address(peg));
        c.minLoan = 100e18;

        strat = new KeelStrategy(IERC20(address(musd)), address(this), 2_000, 1_000);
        m = new KeelMarket(
            KeelMarket.Deps(
                IERC20(address(musd)), IERC20(address(btc)), IVeBTC(address(ve)), IVoter(address(voter)),
                IPriceFeed(address(feed)), IPegOracle(address(peg)), strat
            ),
            c,
            2 days,
            KeelMarket.Mezo(
                IBorrowerOperationsSignatures(address(troves)),
                ITroveManager(address(troves)),
                IBorrowerOperations(address(troves)),
                address(ap),
                address(0)
            )
        );
        strat.setMarket(address(m));

        musd.mint(address(this), 1_000_000e18);
        musd.approve(address(strat), type(uint256).max);
        strat.allocate(1_000_000e18); // lend cap 200k, liquidity buffer 100k

        btc.mint(alice, 1e18);
        vm.prank(alice);
        btc.approve(address(m), type(uint256).max);
        musd.mint(alice, 100_000e18);
        vm.prank(alice);
        musd.approve(address(m), type(uint256).max);
    }

    /// @dev Opens a trove for `who`: Mezo's ActivePool holds its BTC.
    function _trove(address who, uint256 coll, uint256 netDebt) internal {
        troves.open(who, coll, netDebt + GAS_COMP);
        vm.deal(address(ap), address(ap).balance + coll);
    }

    function _sig(address who) internal view returns (bytes memory) {
        return troves.sigFor(who, address(m), block.timestamp + 1 hours);
    }

    function _move(uint256 extra) internal returns (uint256 id) {
        bytes memory sig = _sig(alice);
        vm.prank(alice);
        id = m.openFromTrove(extra, block.timestamp + 1 hours, sig);
    }

    function test_move_trove_books_the_same_loan_in_keel() external {
        _trove(alice, 1e18, 20_000e18);
        troves.addInterest(alice, 5e18); // Mezo interest not yet applied: read after the update
        uint256 aliceMusd = musd.balanceOf(alice);
        uint256 aliceBtc = btc.balanceOf(alice);

        vm.expectEmit();
        emit KeelMarket.TroveMoved(1, alice, 1e18, 20_005e18);
        uint256 id = _move(0);

        (address owner_, KeelMarket.Kind kind,, uint256 coll,,,) = m.loans(id);
        assertEq(owner_, alice, "owner");
        assertTrue(kind == KeelMarket.Kind.Btc, "btc loan");
        assertEq(coll, 1e18, "collateral");
        assertEq(m.debtOf(id), 20_005e18, "debt carried over");
        assertEq(strat.lent(), 20_005e18, "drawn from savings");
        assertEq(troves.getTroveStatus(alice), 2, "trove closed");
        assertEq(address(m).balance, 1e18, "native BTC arrived");
        assertEq(btc.balanceOf(address(m)), 1e18, "ERC20 view agrees");
        assertEq(musd.balanceOf(address(m)), 0, "no MUSD left in the market");
        assertEq(musd.balanceOf(alice), aliceMusd, "borrower paid nothing up front");
        assertEq(btc.balanceOf(alice), aliceBtc, "borrower BTC untouched");

        // The moved loan behaves like any other: repay and take the BTC home.
        vm.startPrank(alice);
        m.repay(id, m.debtOf(id));
        m.close(id);
        vm.stopPrank();
        assertEq(btc.balanceOf(alice), aliceBtc + 1e18, "BTC back to the borrower");
    }

    function test_move_trove_with_extra_btc() external {
        _trove(alice, 1e18, 20_000e18);
        uint256 id = _move(0.5e18);
        (,,, uint256 coll,,,) = m.loans(id);
        assertEq(coll, 1.5e18, "trove BTC plus the top up");
        assertEq(btc.balanceOf(alice), 0.5e18, "top up pulled");
        assertEq(address(m).balance, 1.5e18, "all BTC held");
    }

    function test_move_reverts_when_health_too_low_and_top_up_fixes_it() external {
        _trove(alice, 0.5e18, 25_000e18); // limit 20k at 50% of $40k
        bytes memory sig = _sig(alice);
        uint256 dl = block.timestamp + 1 hours;
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(KeelMarket.OverBorrowLimit.selector, 25_000e18, 20_000e18));
        m.openFromTrove(0, dl, sig);
        assertEq(troves.getTroveStatus(alice), 1, "trove untouched");

        vm.prank(alice);
        uint256 id = m.openFromTrove(0.2e18, dl, sig); // limit 28k
        assertEq(m.debtOf(id), 25_000e18, "moved with the top up");
    }

    function test_move_reverts_over_lend_cap() external {
        _trove(alice, 10e18, 250_000e18);
        bytes memory sig = _sig(alice);
        uint256 dl = block.timestamp + 1 hours;
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(KeelStrategy.LendCapExceeded.selector, 250_000e18, 200_000e18));
        m.openFromTrove(0, dl, sig);
    }

    function test_move_reverts_while_borrowing_paused() external {
        _trove(alice, 1e18, 20_000e18);
        m.setThrottle(address(0xBEEF), IERC20(address(musd)), 1); // the watched pool is empty
        assertTrue(!m.borrowingOpen(), "paused");
        bytes memory sig = _sig(alice);
        uint256 dl = block.timestamp + 1 hours;
        vm.prank(alice);
        vm.expectRevert(KeelMarket.BorrowingPaused.selector);
        m.openFromTrove(0, dl, sig);
    }

    function test_move_is_off_without_mezo_contracts() external {
        KeelMarket off = new KeelMarket(
            KeelMarket.Deps(
                IERC20(address(musd)), IERC20(address(btc)), IVeBTC(address(1)), IVoter(address(1)),
                IPriceFeed(address(feed)), IPegOracle(address(peg)), strat
            ),
            _cfg(),
            2 days,
            KeelMarket.Mezo(
                IBorrowerOperationsSignatures(address(0)),
                ITroveManager(address(0)),
                IBorrowerOperations(address(0)),
                address(0),
                address(0)
            )
        );
        vm.prank(alice);
        vm.expectRevert(KeelMarket.NotAllowed.selector);
        off.openFromTrove(0, block.timestamp, "");
    }

    function _cfg() internal view returns (KeelMarket.Config memory c) {
        c.risks[0] = KeelMarket.Risk(5_000, 6_500, 500);
        c.risks[1] = KeelMarket.Risk(4_500, 6_000, 800);
        c.risks[2] = KeelMarket.Risk(4_000, 5_500, 1_000);
        c.rates = KeelMarket.RateParams(0.03e18, 0.04e18, 0.75e18, 0.8e18);
        c.peg = KeelMarket.PegParams(0.995e18, 0.985e18, 0.04e18, 0.01e18, 7 days);
        c.pegOracle = IPegOracle(address(peg));
        c.minLoan = 100e18;
    }

    /// The signature names borrower and recipient but not the caller. Sent
    /// straight to Mezo with Keel as recipient, the close reverts because
    /// Keel only takes BTC mid move; sent to Keel by someone else, Keel acts
    /// on the caller's own (missing) trove.
    function test_front_run_with_leaked_signature_is_blocked() external {
        _trove(alice, 1e18, 20_000e18);
        bytes memory sig = _sig(alice);
        uint256 dl = block.timestamp + 1 hours;

        musd.mint(bob, 20_000e18);
        vm.prank(bob);
        vm.expectRevert(bytes("Sending BTC failed"));
        troves.closeTroveWithSignature(alice, address(m), sig, dl);

        vm.prank(bob);
        vm.expectRevert(KeelMarket.NoDebt.selector);
        m.openFromTrove(0, dl, sig);

        // Bob with his own trove still can't use Alice's signature.
        _trove(bob, 1e18, 20_000e18);
        vm.prank(bob);
        vm.expectRevert(bytes("Invalid signature"));
        m.openFromTrove(0, dl, sig);

        assertEq(troves.getTroveStatus(alice), 1, "alice's trove untouched");
        uint256 id = _move(0);
        (address owner_,,,,,,) = m.loans(id);
        assertEq(owner_, alice, "alice can still move it");
    }

    function test_stray_btc_is_refused() external {
        vm.deal(address(this), 1e18);
        (bool ok,) = address(m).call{value: 1}("");
        assertTrue(!ok, "plain send refused");

        // Even the ActivePool can't pay outside a move.
        vm.deal(address(ap), 1e18);
        vm.prank(address(ap));
        (ok,) = address(m).call{value: 1}("");
        assertTrue(!ok, "ActivePool refused outside a move");
    }

    function test_reentry_during_move_reverts() external {
        _trove(alice, 1e18, 20_000e18);
        troves.setHook(address(m), abi.encodeCall(KeelMarket.accrue, ()));
        bytes memory sig = _sig(alice);
        uint256 dl = block.timestamp + 1 hours;
        vm.prank(alice);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        m.openFromTrove(0, dl, sig);
    }

    function test_move_reverts_if_btc_short() external {
        _trove(alice, 1e18, 20_000e18);
        troves.setShort(0.1e18, 0);
        bytes memory sig = _sig(alice);
        uint256 dl = block.timestamp + 1 hours;
        vm.prank(alice);
        vm.expectRevert(KeelMarket.BadTroveMove.selector);
        m.openFromTrove(0, dl, sig);
    }

    function test_move_reverts_if_musd_left_over() external {
        _trove(alice, 1e18, 20_000e18);
        troves.setShort(0, 1e18); // Mezo burns 1 MUSD less than drawn
        bytes memory sig = _sig(alice);
        uint256 dl = block.timestamp + 1 hours;
        vm.prank(alice);
        vm.expectRevert(KeelMarket.BadTroveMove.selector);
        m.openFromTrove(0, dl, sig);
    }

    function test_move_reverts_after_deadline() external {
        _trove(alice, 1e18, 20_000e18);
        bytes memory sig = _sig(alice);
        uint256 dl = block.timestamp + 1 hours;
        vm.warp(dl + 1);
        vm.prank(alice);
        vm.expectRevert(bytes("expired"));
        m.openFromTrove(0, dl, sig);
    }
}
