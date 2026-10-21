// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "../utils/Test.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockVeBTC, MockVoter, MockPriceFeed, MockPegOracle} from "../mocks/MezoMocks.sol";
import {KeelStrategy} from "../../src/KeelStrategy.sol";
import {KeelMarket} from "../../src/KeelMarket.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IVeBTC, IVoter, IPriceFeed} from "../../src/interfaces/IMezo.sol";
import {IPegOracle} from "../../src/oracles/PegOracles.sol";

/// @dev The eval: runs fixed scenarios through the real contracts and logs
///      every number, so eval/answer_key.py can check them against an answer
///      key computed separately. Only checks that a scenario ran happen here;
///      right or wrong is decided by the answer key.
contract KeelEval is Test {
    MockERC20 musd;
    MockERC20 btc;
    MockVeBTC ve;
    MockPriceFeed feed;
    MockPegOracle peg;
    KeelStrategy strat;
    KeelMarket m;

    address public owner = address(this);
    address alice = address(0xA11CE);
    address liq = address(0x1100);
    uint256 constant T0 = 1_800_000_000;

    /// MUSD's weekly closing price from CoinGecko, 2026-04-25 to 2026-10-21
    /// (eval/data/musd-daily-coingecko.json), in 1e-4 dollars.
    uint16[26] WEEKLY = [
        10038, 10074, 10058, 10050, 10028, 10041, 10039, 10036, 9978, 9889, 9923, 9944, 9905,
        9919, 9915, 9906, 9912, 9905, 9906, 9895, 9896, 9905, 9896, 9909, 9891, 9882
    ];

    function _deploy(uint256 maxPremium) internal {
        vm.warp(T0);
        musd = new MockERC20("Mezo USD", "MUSD");
        btc = new MockERC20("Bitcoin", "BTC");
        ve = new MockVeBTC();
        MockVoter voter = new MockVoter(ve, new MockERC20("R", "R"));
        feed = new MockPriceFeed();
        feed.set(80_000e18);
        peg = new MockPegOracle();

        KeelMarket.Config memory c;
        c.risks[0] = KeelMarket.Risk(5_000, 6_500, 500);
        c.risks[1] = KeelMarket.Risk(4_500, 6_000, 800);
        c.risks[2] = KeelMarket.Risk(4_000, 5_500, 1_000);
        c.rates = KeelMarket.RateParams(0.03e18, 0.04e18, 0.75e18, 0.8e18);
        c.peg = KeelMarket.PegParams(0.995e18, 0.985e18, maxPremium, 0.01e18, 7 days);
        c.pegOracle = IPegOracle(address(peg));
        c.minLoan = 100e18;

        strat = new KeelStrategy(IERC20(address(musd)), address(this), 2_000, 1_000);
        m = new KeelMarket(
            KeelMarket.Deps(
                IERC20(address(musd)), IERC20(address(btc)), IVeBTC(address(ve)), IVoter(address(voter)),
                IPriceFeed(address(feed)), IPegOracle(address(peg)), strat
            ),
            c,
            2 days
        );
        strat.setMarket(address(m));
        musd.mint(address(this), 1_000_000e18);
        musd.approve(address(strat), type(uint256).max);
        strat.allocate(1_000_000e18);

        btc.mint(alice, 100e18);
        musd.mint(alice, 10_000_000e18);
        musd.mint(liq, 10_000_000e18);
        vm.startPrank(alice);
        btc.approve(address(m), type(uint256).max);
        musd.approve(address(m), type(uint256).max);
        vm.stopPrank();
        vm.prank(liq);
        musd.approve(address(m), type(uint256).max);
    }

    function _log(string memory k, uint256 v) internal {
        emit log_named_uint(k, v);
    }

    function _two(uint256 i) internal pure returns (string memory) {
        bytes memory b = new bytes(2);
        b[0] = bytes1(uint8(48 + i / 10));
        b[1] = bytes1(uint8(48 + i % 10));
        return string(b);
    }

    /// 100,000 MUSD lent from a 1,000,000 MUSD vault for 26 weeks, while the
    /// peg oracle replays MUSD's real weekly price. The keeper steps the peg
    /// once a week; interest compounds at each step.
    function _replay(string memory tag, uint256 maxPremium) internal {
        _deploy(maxPremium);
        vm.prank(alice);
        uint256 id = m.openWithBtc(5e18, 100_000e18);
        for (uint256 i = 0; i < 26; i++) {
            vm.warp(T0 + (i + 1) * 7 days);
            peg.set(uint256(WEEKLY[i]) * 1e14);
            m.stepPeg();
            string memory p = string.concat(tag, ".w", _two(i + 1), ".");
            _log(string.concat(p, "premium"), m.pegPremium());
            _log(string.concat(p, "rate"), m.currentRate());
            _log(string.concat(p, "saverRate"), m.saverRate());
            _log(string.concat(p, "debt"), m.debtOf(id));
        }
        uint256 debt = m.debtOf(id);
        vm.prank(alice);
        m.repay(id, debt);
        _log(string.concat(tag, ".end.paid"), debt);
        _log(string.concat(tag, ".end.reserve"), strat.reserve());
        _log(string.concat(tag, ".end.yieldOwed"), strat.yieldOwed());
        assertEq(strat.lent(), 0, "repaid");
    }

    function test_eval_peg_on() external {
        _replay("pegOn", 0.04e18);
    }

    function test_eval_peg_off() external {
        _replay("pegOff", 0);
    }

    /// BTC loan: a year of interest, health after a price drop, liquidation.
    function test_eval_btc_lifecycle() external {
        _deploy(0.04e18);
        vm.prank(alice);
        uint256 id = m.openWithBtc(1e18, 40_000e18);
        vm.warp(T0 + 365 days);
        _log("btc.year.debt", m.debtOf(id));
        feed.set(60_000e18);
        (,, uint256 h,) = m.positionAt(id, 60_000e18);
        _log("btc.p60k.health", h);
        feed.set(55_000e18);
        (,, h,) = m.positionAt(id, 55_000e18);
        _log("btc.p55k.health", h);
        uint256 btcBefore = btc.balanceOf(liq);
        vm.prank(liq);
        m.liquidate(id, 20_000e18);
        _log("btc.liq.seized", btc.balanceOf(liq) - btcBefore);
        _log("btc.liq.debtAfter", m.debtOf(id));
        _log("btc.liq.reserve", strat.reserve());
        _log("btc.liq.yieldOwed", strat.yieldOwed());
        _log("btc.liq.lent", strat.lent());
    }

    /// Permanent veBTC: sold at a discount, surplus to the borrower.
    function test_eval_ve_surplus() external {
        _deploy(0.04e18);
        uint256 nft = ve.mint(alice, 1e18, T0 + 21 days, true);
        vm.startPrank(alice);
        ve.approve(address(m), nft);
        uint256 id = m.openWithVeBTC(nft, 30_000e18);
        vm.stopPrank();
        vm.warp(T0 + 30 days);
        feed.set(50_000e18);
        _log("veSurplus.debt", m.debtOf(id));
        uint256 aliceBefore = musd.balanceOf(alice);
        uint256 liqBefore = musd.balanceOf(liq);
        vm.prank(liq);
        m.liquidate(id, type(uint256).max);
        _log("veSurplus.liqPaid", liqBefore - musd.balanceOf(liq));
        _log("veSurplus.surplus", musd.balanceOf(alice) - aliceBefore);
        _log("veSurplus.badDebt", strat.badDebt());
        _log("veSurplus.lent", strat.lent());
    }

    /// Permanent veBTC sold below its debt: the reserve takes the loss first.
    function test_eval_ve_underwater() external {
        _deploy(0.04e18);
        // A BTC loan pays a year of interest first, building a reserve.
        vm.prank(alice);
        uint256 a = m.openWithBtc(10e18, 100_000e18);
        uint256 nft = ve.mint(alice, 1e18, T0 + 21 days, true);
        vm.startPrank(alice);
        ve.approve(address(m), nft);
        uint256 id = m.openWithVeBTC(nft, 30_000e18);
        vm.stopPrank();
        vm.warp(T0 + 365 days);
        uint256 da = m.debtOf(a);
        vm.prank(alice);
        m.repay(a, da);
        _log("veUnder.btcPaid", da);
        _log("veUnder.reserveBefore", strat.reserve());
        feed.set(30_000e18);
        _log("veUnder.debt", m.debtOf(id));
        uint256 liqBefore = musd.balanceOf(liq);
        vm.prank(liq);
        m.liquidate(id, type(uint256).max);
        _log("veUnder.liqPaid", liqBefore - musd.balanceOf(liq));
        _log("veUnder.reserveAfter", strat.reserve());
        _log("veUnder.badDebt", strat.badDebt());
        _log("veUnder.yieldOwed", strat.yieldOwed());
        _log("veUnder.lent", strat.lent());
    }
}
