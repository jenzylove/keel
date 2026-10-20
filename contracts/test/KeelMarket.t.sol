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

/// @dev The test contract plays the savings vault and the admin.
contract KeelMarketTest is Test {
    MockERC20 musd;
    MockERC20 btc;
    MockERC20 reward;
    MockVeBTC ve;
    MockVoter voter;
    MockPriceFeed feed;
    MockPegOracle peg;
    KeelStrategy strat;
    KeelMarket m;

    address alice = address(0xA11CE);
    address liq = address(0x1100);
    uint256 constant PRICE = 80_000e18;
    uint256 constant DELAY = 2 days;

    /// @dev The test contract plays the savings vault, so it owns Keel.
    address public owner = address(this);

    function _config(uint16 btcMax, uint16 btcLiq, uint16 permMax, uint16 permLiq) internal view returns (KeelMarket.Config memory c) {
        c.risks[0] = KeelMarket.Risk(btcMax, btcLiq, 500);
        c.risks[1] = KeelMarket.Risk(4_500, 6_000, 800);
        c.risks[2] = KeelMarket.Risk(permMax, permLiq, 1_000);
        c.rates = KeelMarket.RateParams(0.03e18, 0.04e18, 0.75e18, 0.8e18);
        c.peg = KeelMarket.PegParams(0.995e18, 0.985e18, 0.04e18, 0.01e18, 7 days);
        c.pegOracle = IPegOracle(address(peg));
        c.minLoan = 100e18;
    }

    function setUp() external {
        vm.warp(1_800_000_000);
        musd = new MockERC20("Mezo USD", "MUSD");
        btc = new MockERC20("Bitcoin", "BTC");
        reward = new MockERC20("Reward", "RWD");
        ve = new MockVeBTC();
        voter = new MockVoter(ve, reward);
        feed = new MockPriceFeed();
        feed.set(PRICE);
        peg = new MockPegOracle();

        strat = new KeelStrategy(IERC20(address(musd)), address(this), 2_000, 1_000);
        m = new KeelMarket(
            KeelMarket.Deps(
                IERC20(address(musd)), IERC20(address(btc)), IVeBTC(address(ve)), IVoter(address(voter)),
                IPriceFeed(address(feed)), IPegOracle(address(peg)), strat
            ),
            _config(5_000, 6_500, 4_000, 5_500),
            DELAY
        );
        strat.setMarket(address(m));

        musd.mint(address(this), 1_000_000e18);
        musd.approve(address(strat), type(uint256).max);
        strat.allocate(1_000_000e18);

        btc.mint(alice, 10e18);
        vm.prank(alice);
        btc.approve(address(m), type(uint256).max);
        musd.mint(alice, 100_000e18);
        vm.prank(alice);
        musd.approve(address(m), type(uint256).max);
        musd.mint(liq, 1_000_000e18);
        vm.prank(liq);
        musd.approve(address(m), type(uint256).max);
    }

    // ----- BTC loans -----

    function _openBtc(uint256 coll, uint256 amt) internal returns (uint256 id) {
        vm.prank(alice);
        id = m.openWithBtc(coll, amt);
    }

    function test_borrow_against_btc_up_to_limit() external {
        uint256 id = _openBtc(1e18, 40_000e18); // 50% of 80k
        assertEq(m.debtOf(id), 40_000e18, "debt");
        assertEq(strat.lent(), 40_000e18, "strategy lent");
        vm.prank(alice);
        vm.expectRevert();
        m.borrow(id, 1e18);
    }

    function test_min_loan_enforced() external {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(KeelMarket.BelowMinLoan.selector, 99e18, 100e18));
        m.openWithBtc(1e18, 99e18);
    }

    function test_interest_paid_first_and_reaches_savers() external {
        uint256 id = _openBtc(1e18, 10_000e18);
        vm.warp(block.timestamp + 365 days);
        uint256 debt = m.debtOf(id);
        assertTrue(debt > 10_000e18, "interest accrued");
        vm.prank(alice);
        m.repay(id, debt);
        assertEq(strat.lent(), 0, "principal back");
        uint256 interest = debt - 10_000e18;
        assertEq(strat.yieldOwed() + strat.reserve(), interest, "interest booked");
        assertEq(strat.reserve(), (interest * 1_000) / 10_000, "10% reserve");
        uint256 owed = strat.yieldOwed();
        assertEq(strat.claimYield(), owed, "savers paid the rest");
        vm.prank(alice);
        m.close(id);
        assertEq(btc.balanceOf(alice), 10e18, "collateral back");
    }

    function test_cannot_close_with_debt() external {
        uint256 id = _openBtc(1e18, 1_000e18);
        vm.prank(alice);
        vm.expectRevert();
        m.close(id);
    }

    function test_remove_btc_checks_limit() external {
        uint256 id = _openBtc(2e18, 40_000e18);
        vm.prank(alice);
        m.removeBtc(id, 1e18); // now exactly 50%
        vm.prank(alice);
        vm.expectRevert();
        m.removeBtc(id, 1);
    }

    function test_liquidate_btc_pays_bonus() external {
        uint256 id = _openBtc(1e18, 40_000e18);
        vm.prank(liq);
        vm.expectRevert(KeelMarket.StillHealthy.selector);
        m.liquidate(id, 10_000e18);

        feed.set(60_000e18); // 40k / 60k = 66.7% > 65%
        vm.prank(liq);
        m.liquidate(id, 10_000e18);
        // 10,000 MUSD * 1.05 / 60,000 = 0.175 BTC
        assertEq(btc.balanceOf(liq), 0.175e18, "seized with 5% bonus");
        assertEq(strat.lent(), 30_000e18, "principal repaid");
    }

    function test_btc_bad_debt_is_written_off() external {
        uint256 id = _openBtc(1e18, 40_000e18);
        feed.set(30_000e18); // collateral now worth less than debt
        vm.prank(liq);
        m.liquidate(id, 28_572e18); // just enough to take all collateral at a 5% bonus
        assertEq(btc.balanceOf(liq), 1e18, "all collateral taken");
        (, , , , , uint256 principal, uint256 scaled) = m.loans(id);
        assertEq(principal + scaled, 0, "loan cleared");
        assertTrue(strat.badDebt() > 0, "loss recorded");
        assertEq(strat.lent(), 0, "nothing left lent");
    }

    // ----- veBTC loans -----

    function _openVe(uint256 amount, bool permanent, uint256 borrowAmt) internal returns (uint256 id, uint256 nft) {
        nft = ve.mint(alice, amount, block.timestamp + 21 days, permanent);
        vm.prank(alice);
        ve.approve(address(m), nft);
        vm.prank(alice);
        id = m.openWithVeBTC(nft, borrowAmt);
    }

    function test_borrow_against_vebtc_with_timed_and_permanent_limits() external {
        (uint256 a, ) = _openVe(1e18, false, 36_000e18); // 45%
        (uint256 b, ) = _openVe(1e18, true, 32_000e18); // 40%
        vm.prank(alice);
        vm.expectRevert();
        m.borrow(a, 1e18);
        vm.prank(alice);
        vm.expectRevert();
        m.borrow(b, 1e18);
    }

    function test_rejects_managed_locks() external {
        uint256 nft = ve.mint(alice, 1e18, block.timestamp + 21 days, false);
        ve.setEscrowType(nft, 1);
        vm.prank(alice);
        vm.expectRevert(KeelMarket.NotNormalLock.selector);
        m.openWithVeBTC(nft, 0);
    }

    function test_vote_blocked_in_deposit_block_then_works() external {
        (uint256 id, uint256 nft) = _openVe(1e18, false, 0);
        address[] memory pools = new address[](1);
        uint256[] memory w = new uint256[](1);
        pools[0] = address(1);
        w[0] = 1;
        vm.prank(alice);
        vm.expectRevert(KeelMarket.SameBlockAsDeposit.selector);
        m.vote(id, pools, w);
        vm.roll(block.number + 1);
        vm.prank(alice);
        m.vote(id, pools, w);
        assertTrue(voter.voted(nft), "voted through the market");
    }

    function test_rewards_forwarded_to_borrower() external {
        (uint256 id, ) = _openVe(1e18, false, 0);
        address[] memory rw = new address[](1);
        address[][] memory toks = new address[][](1);
        toks[0] = new address[](2);
        toks[0][0] = address(reward);
        toks[0][1] = address(reward); // duplicates must not be paid twice
        vm.prank(alice);
        m.claimRewards(id, rw, toks, true);
        assertEq(reward.balanceOf(alice), 5e18, "bribes forwarded once");
        assertEq(reward.balanceOf(address(m)), 0, "nothing left behind");
    }

    function test_close_returns_nft() external {
        (uint256 id, uint256 nft) = _openVe(1e18, false, 1_000e18);
        uint256 debt = m.debtOf(id);
        vm.prank(alice);
        m.repay(id, debt);
        vm.prank(alice);
        m.close(id);
        assertEq(ve.ownerOf(nft), alice, "nft back");
    }

    function test_liquidate_vebtc_sells_at_discount_and_pays_surplus() external {
        (uint256 id, uint256 nft) = _openVe(1e18, false, 36_000e18);
        feed.set(59_000e18); // 36k / 59k = 61% > 60%
        uint256 aliceBefore = musd.balanceOf(alice);
        vm.prank(liq);
        vm.expectRevert(abi.encodeWithSelector(KeelMarket.PriceAboveMax.selector, 54_280e18, 54_000e18));
        m.liquidate(id, 54_000e18);
        vm.prank(liq);
        m.liquidate(id, 54_280e18);
        // sale = 59k * 0.92 = 54,280; debt 36k; surplus 18,280 to alice
        assertEq(ve.ownerOf(nft), liq, "liquidator owns nft");
        assertEq(musd.balanceOf(alice) - aliceBefore, 18_280e18, "surplus to borrower");
        assertEq(strat.lent(), 0, "debt cleared");
        assertEq(strat.badDebt(), 0, "no loss");
    }

    function test_redemption_of_musd_cannot_touch_keel_loans() external {
        // Keel loans are held in this market, not in Mezo's TroveManager. The
        // only ways a loan's collateral leaves are close (owner, no debt) and
        // liquidate (unhealthy). A healthy loan can't be taken.
        (uint256 id, uint256 nft) = _openVe(1e18, false, 10_000e18);
        vm.prank(liq);
        vm.expectRevert(KeelMarket.StillHealthy.selector);
        m.liquidate(id, type(uint256).max);
        vm.prank(liq);
        vm.expectRevert(KeelMarket.NotLoanOwner.selector);
        m.close(id);
        assertEq(ve.ownerOf(nft), address(m), "collateral untouched");
    }

    // ----- throttle and peg -----

    function test_throttle_pauses_new_borrowing_only() external {
        uint256 id = _openBtc(1e18, 1_000e18);
        MockERC20 usdc = new MockERC20("USDC", "USDC");
        address pool = address(0x9001);
        usdc.mint(pool, 50_000e18);
        m.setThrottle(pool, IERC20(address(usdc)), 58_000e18);
        assertTrue(!m.borrowingOpen(), "paused");
        vm.prank(alice);
        vm.expectRevert(KeelMarket.BorrowingPaused.selector);
        m.borrow(id, 1_000e18);
        vm.prank(alice);
        m.repay(id, 500e18); // repaying stays open
        usdc.mint(pool, 10_000e18);
        vm.prank(alice);
        m.borrow(id, 1_000e18);
    }

    function test_peg_steps_toward_target_in_bounded_steps() external {
        peg.set(0.99e18); // target premium 2%
        m.stepPeg();
        assertEq(m.pegPremium(), 0.01e18, "one step of 1%");
        vm.expectRevert();
        m.stepPeg();
        vm.warp(block.timestamp + 7 days);
        m.stepPeg();
        assertEq(m.pegPremium(), 0.02e18, "reached target");
        vm.warp(block.timestamp + 7 days);
        peg.set(1e18);
        m.stepPeg();
        assertEq(m.pegPremium(), 0.01e18, "steps back down at par");
    }

    function test_missing_price_never_moves_the_rate() external {
        peg.set(0.97e18);
        peg.breakIt(true);
        vm.expectRevert(MockPegOracle.NoPrice.selector);
        m.stepPeg();
        assertEq(m.pegPremium(), 0, "unchanged");
    }

    function test_rate_rises_with_peg_premium() external {
        _openBtc(1e18, 20_000e18);
        uint256 before = m.currentRate();
        peg.set(0.97e18);
        m.stepPeg();
        assertEq(m.currentRate(), before + 0.01e18, "premium added");
    }

    // ----- hardening -----

    function test_config_changes_wait_for_the_delay() external {
        uint256 id = _openBtc(1e18, 40_000e18); // 50% LTV, healthy at 65%
        m.proposeConfig(_config(3_000, 4_000, 4_000, 5_500));
        vm.prank(liq);
        vm.expectRevert(KeelMarket.StillHealthy.selector);
        m.liquidate(id, 1e18); // the tighter setting is not live yet
        vm.expectRevert(abi.encodeWithSelector(KeelMarket.TooEarly.selector, block.timestamp + DELAY));
        m.applyConfig();
        // The borrower uses the delay to repay.
        uint256 debt = m.debtOf(id);
        vm.prank(alice);
        m.repay(id, debt);
        vm.warp(block.timestamp + DELAY);
        m.applyConfig();
        (uint16 maxLtv, , ) = m.btcRisk();
        assertEq(maxLtv, 3_000, "applied after the delay");
    }

    function test_only_the_vault_owner_can_propose_and_cancel() external {
        vm.prank(alice);
        vm.expectRevert(KeelMarket.OnlyAdmin.selector);
        m.proposeConfig(_config(3_000, 4_000, 4_000, 5_500));
        m.proposeConfig(_config(3_000, 4_000, 4_000, 5_500));
        vm.prank(alice);
        vm.expectRevert(KeelMarket.OnlyAdmin.selector);
        m.cancelConfig();
        m.cancelConfig();
        vm.warp(block.timestamp + DELAY);
        vm.expectRevert(KeelMarket.NothingPending.selector);
        m.applyConfig();
    }

    function test_rates_have_a_ceiling() external {
        KeelMarket.Config memory c = _config(5_000, 6_500, 4_000, 5_500);
        c.rates.slope2 = 2e18;
        vm.expectRevert(KeelMarket.RateTooHigh.selector);
        m.proposeConfig(c);
    }

    function test_repay_with_no_debt_reverts() external {
        uint256 id = _openBtc(1e18, 0);
        vm.prank(alice);
        vm.expectRevert(KeelMarket.NoDebt.selector);
        m.repay(id, 1e18);
        vm.prank(alice);
        vm.expectRevert(KeelMarket.NoDebt.selector);
        m.repay(999, 1e18); // a loan that doesn't exist
    }

    function test_position_at_a_fresh_price() external {
        uint256 id = _openBtc(1e18, 40_000e18);
        (, , uint256 hNow, ) = m.position(id);
        (, , uint256 hLow, ) = m.positionAt(id, 60_000e18);
        assertTrue(hNow > 1e18 && hLow < 1e18, "health judged at the given price");
    }

    receive() external payable {}
}
