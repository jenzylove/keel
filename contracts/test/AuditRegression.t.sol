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
import {IVaultStrategy} from "../src/interfaces/IVaultStrategy.sol";

/// @dev A reduction of MUSDSavingsRate: 1:1 sMUSD, the yield index, and a
///      yield claim inside every deposit, withdrawal and setStrategy.
contract MiniVault {
    IERC20 public musd;
    IVaultStrategy public strategy;
    address public owner;
    mapping(address => uint256) public balanceOf;
    uint256 public totalSupply;
    uint256 public yieldIndex;
    mapping(address => uint256) public supplyYieldIndex;
    mapping(address => uint256) public claimableYield;

    constructor(IERC20 m) { musd = m; owner = msg.sender; }
    function setInitialStrategy(address s) external { strategy = IVaultStrategy(s); }
    function _upd(address r) internal {
        uint256 b = balanceOf[r];
        if (b > 0) claimableYield[r] += (b * (yieldIndex - supplyYieldIndex[r])) / 1e18;
        supplyYieldIndex[r] = yieldIndex;
    }
    function receiveYieldFromStrategy() public {
        uint256 a = strategy.claimYield();
        if (a > 0 && totalSupply > 0) yieldIndex += (a * 1e18) / totalSupply;
    }
    function deposit(uint256 a) external {
        receiveYieldFromStrategy();
        musd.transferFrom(msg.sender, address(this), a);
        _upd(msg.sender);
        balanceOf[msg.sender] += a; totalSupply += a;
        musd.approve(address(strategy), a);
        strategy.allocate(a);
    }
    function withdraw(uint256 a) external {
        receiveYieldFromStrategy();
        _upd(msg.sender);
        uint256 c = claimableYield[msg.sender]; claimableYield[msg.sender] = 0;
        if (c > 0) musd.transfer(msg.sender, c);
        strategy.deallocate(a);
        balanceOf[msg.sender] -= a; totalSupply -= a;
        musd.transfer(msg.sender, a);
    }
    function setStrategy(address n) external {
        require(msg.sender == owner);
        receiveYieldFromStrategy();
        IVaultStrategy old = strategy; strategy = IVaultStrategy(n);
        uint256 amt = old.migrate(n);
        strategy.onMigrated(amt);
    }
}

/// @dev Regression tests for the release-readiness audit's findings. Each
///      one was first written as an exploit against the earlier contracts.
contract AuditRegression is Test {
    MockERC20 musd; MockERC20 btc; MockVeBTC ve; MockVoter voter; MockPriceFeed feed; MockPegOracle peg;
    KeelStrategy strat; KeelMarket m; MiniVault vault;
    address alice = address(0xA11CE); address saver = address(0x5A); address saver2 = address(0x5B);
    address liq = address(0x1100); address whale = address(0x3A1E);

    function setUp() external {
        vm.warp(1_800_000_000);
        musd = new MockERC20("MUSD", "MUSD"); btc = new MockERC20("BTC", "BTC");
        ve = new MockVeBTC(); voter = new MockVoter(ve, new MockERC20("R", "R"));
        feed = new MockPriceFeed(); feed.set(80_000e18); peg = new MockPegOracle();
        vault = new MiniVault(IERC20(address(musd)));
        strat = new KeelStrategy(IERC20(address(musd)), address(vault), 2_000, 1_000);
        vault.setInitialStrategy(address(strat));
        KeelMarket.Config memory c;
        c.risks[0] = KeelMarket.Risk(5_000, 6_500, 500);
        c.risks[1] = KeelMarket.Risk(4_500, 6_000, 800);
        c.risks[2] = KeelMarket.Risk(4_000, 5_500, 1_000);
        c.rates = KeelMarket.RateParams(0.03e18, 0.04e18, 0.75e18, 0.8e18);
        c.peg = KeelMarket.PegParams(0.995e18, 0.985e18, 0.04e18, 0.01e18, 7 days);
        c.pegOracle = IPegOracle(address(peg)); c.minLoan = 100e18;
        m = new KeelMarket(KeelMarket.Deps(IERC20(address(musd)), IERC20(address(btc)), IVeBTC(address(ve)),
            IVoter(address(voter)), IPriceFeed(address(feed)), IPegOracle(address(peg)), strat), c, 2 days);
        strat.setMarket(address(m)); // admin = vault.owner() = this

        address[4] memory us = [saver, saver2, alice, whale];
        for (uint i; i < 4; i++) {
            musd.mint(us[i], 20_000_000e18);
            vm.startPrank(us[i]);
            musd.approve(address(vault), type(uint256).max);
            musd.approve(address(m), type(uint256).max);
            vm.stopPrank();
        }
        vm.prank(saver); vault.deposit(500_000e18);
        vm.prank(saver2); vault.deposit(500_000e18);
        btc.mint(alice, 100e18); vm.prank(alice); btc.approve(address(m), type(uint256).max);
        musd.mint(liq, 10_000_000e18); vm.prank(liq); musd.approve(address(m), type(uint256).max);
    }

    function _open() internal returns (uint256 id) {
        vm.prank(alice);
        id = m.openWithBtc(10e18, 100_000e18); // utilisation 100k / 200k = 50%, so 5% a year
        vm.warp(block.timestamp + 365 days);
    }

    function _repayAll(uint256 id) internal returns (uint256 cost) {
        uint256 b0 = musd.balanceOf(alice);
        vm.prank(alice);
        m.repay(id, type(uint256).max);
        cost = b0 - musd.balanceOf(alice);
    }

    /// Was: deposit 19M, repay, withdraw in one go, cutting interest by 91%.
    function test_flash_deposit_no_longer_dodges_interest() external {
        uint256 id = _open();
        uint256 b0 = musd.balanceOf(alice);
        vm.startPrank(alice);
        vault.deposit(19_000_000e18);
        m.repay(id, type(uint256).max);
        vault.withdraw(19_000_000e18);
        vm.stopPrank();
        assertEq(b0 - musd.balanceOf(alice), 105_000e18, "the full year at 5%, none of it recaptured");
    }

    /// Was: a whale withdrawal priced the whole past year at the spiked rate.
    function test_withdrawal_no_longer_reprices_the_past() external {
        uint256 id = _open();
        vm.prank(saver2);
        vault.withdraw(500_000e18);
        vm.prank(saver2);
        vault.deposit(500_000e18);
        assertApproxEq(m.debtOf(id), 105_000e18, 1e18, "the past year stays at 5%");
    }

    /// Was: setParams(0) took effect at once and repriced the past year.
    function test_cap_change_waits_and_does_not_reprice_the_past() external {
        uint256 id = _open();
        strat.proposeParams(0, 1_000);
        vm.expectRevert();
        strat.applyParams();
        vm.warp(block.timestamp + 2 days);
        uint256 before = m.debtOf(id);
        strat.applyParams();
        assertEq(m.debtOf(id), before, "applying it doesn't change debt already owed");
    }

    /// Was: after a loss beyond the reserve, setStrategy reverted for good.
    function test_migration_still_works_after_a_loss() external {
        vm.prank(alice);
        uint256 id = m.openWithBtc(5e18, 200_000e18);
        vm.warp(block.timestamp + 30 days);
        feed.set(30_000e18);
        vm.prank(liq);
        m.liquidate(id, 143_000e18);
        assertTrue(strat.uncovered() > 0, "a loss beyond the reserve");
        uint256 liquidNow = strat.liquid();
        KeelStrategy s2 = new KeelStrategy(IERC20(address(musd)), address(vault), 2_000, 1_000);
        vault.setStrategy(address(s2));
        assertEq(s2.principal(), liquidNow, "everything that's there moved");
    }

    /// Was: a repayment's interest reached the vault in one lump, so a deposit
    /// made just before it took a full share.
    function test_deposit_before_a_repayment_earns_only_its_time() external {
        uint256 id = _open();
        vm.prank(whale);
        vault.deposit(1_000_000e18); // half the vault, just before the repayment
        _repayAll(id);
        vm.warp(block.timestamp + 1 hours);
        uint256 b0 = musd.balanceOf(whale);
        vm.prank(whale);
        vault.withdraw(1_000_000e18);
        uint256 got = musd.balanceOf(whale) - b0 - 1_000_000e18;
        // 4,500 to savers over 7 days; half the vault for one hour is ~13.4.
        assertLe(got, 14e18, "only an hour's share of the drip");
    }
}
