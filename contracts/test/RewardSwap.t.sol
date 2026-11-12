// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "./utils/Test.sol";
import {MockERC20, MockBurnableERC20} from "./mocks/MockERC20.sol";
import {MockVeBTC, MockVoter, MockPriceFeed, MockPegOracle} from "./mocks/MezoMocks.sol";
import {MockSwapPool} from "./mocks/TroveMocks.sol";
import {KeelStrategy} from "../src/KeelStrategy.sol";
import {KeelMarket} from "../src/KeelMarket.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    IVeBTC,
    IVoter,
    IPriceFeed,
    IBorrowerOperationsSignatures,
    ITroveManager,
    IBorrowerOperations
} from "../src/interfaces/IMezo.sol";
import {IPegOracle} from "../src/oracles/PegOracles.sol";

/// @dev Every reward pays the loan: BTC rewards are swapped to MUSD on a Mezo
///      pool and applied to the debt, with a fallback to forwarding the BTC.
///      The test contract plays the savings vault and the admin.
contract RewardSwapTest is Test {
    MockBurnableERC20 musd;
    MockERC20 btc;
    MockERC20 reward;
    MockVeBTC ve;
    MockVoter voter;
    MockPriceFeed feed;
    MockPegOracle peg;
    MockSwapPool pool;
    KeelStrategy strat;
    KeelMarket m;

    address alice = address(0xA11CE);
    uint256 constant PRICE = 80_000e18;
    uint256 id;

    address public owner = address(this);

    function setUp() external {
        vm.warp(1_800_000_000);
        musd = new MockBurnableERC20("Mezo USD", "MUSD");
        btc = new MockERC20("Bitcoin", "BTC");
        reward = new MockERC20("Reward", "RWD");
        ve = new MockVeBTC();
        voter = new MockVoter(ve, reward);
        feed = new MockPriceFeed();
        feed.set(PRICE);
        peg = new MockPegOracle();
        pool = new MockSwapPool(address(btc), musd, PRICE);

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
                IBorrowerOperationsSignatures(address(0)),
                ITroveManager(address(0)),
                IBorrowerOperations(address(0)),
                address(0),
                address(pool) // set from the start, as deploy.mjs does
            )
        );
        strat.setMarket(address(m));
        musd.mint(address(this), 1_000_000e18);
        musd.approve(address(strat), type(uint256).max);
        strat.allocate(1_000_000e18);

        uint256 nft = ve.mint(alice, 10e18, 0, true);
        vm.startPrank(alice);
        ve.approve(address(m), nft);
        id = m.openWithVeBTC(nft, 1_000e18);
        vm.stopPrank();
        musd.burn(alice, musd.balanceOf(alice)); // start from zero MUSD
    }

    function _claimToDebt() internal {
        address[] memory rewards = new address[](1);
        rewards[0] = address(0xFEE);
        address[][] memory tokens = new address[][](1);
        tokens[0] = new address[](2);
        tokens[0][0] = address(btc);
        tokens[0][1] = address(reward);
        vm.prank(alice);
        m.claimRewardsToDebt(id, rewards, tokens, false);
    }

    function test_btc_reward_is_swapped_and_pays_the_debt() external {
        assertEq(m.swapPool(address(btc)), address(pool), "pool set at deploy");
        voter.setExtra(btc, 0.01e18); // 800 MUSD of BTC
        uint256 out = (0.01e18 * PRICE / 1e18) * 9_970 / 10_000;

        vm.expectEmit();
        emit KeelMarket.RewardsSwapped(id, address(btc), 0.01e18, out);
        _claimToDebt();

        assertEq(m.debtOf(id), 1_000e18 - out, "debt paid by the swapped MUSD");
        assertEq(btc.balanceOf(alice), 0, "no BTC forwarded");
        assertEq(btc.balanceOf(address(pool)), 0.01e18, "BTC went to the pool");
        assertEq(reward.balanceOf(alice), 3e18, "unpriced token still forwarded");
        assertEq(musd.balanceOf(address(m)), 0, "no MUSD left in the market");
    }

    function test_swapped_musd_beyond_debt_goes_to_borrower() external {
        voter.setExtra(btc, 0.02e18); // about 1,595 MUSD against 1,000 of debt
        uint256 out = (0.02e18 * PRICE / 1e18) * 9_970 / 10_000;
        _claimToDebt();
        assertEq(m.debtOf(id), 0, "debt cleared");
        assertEq(musd.balanceOf(alice), out - 1_000e18, "rest to the borrower");
        assertEq(btc.balanceOf(alice), 0, "no BTC forwarded");
    }

    function test_pool_revert_falls_back_to_forwarding() external {
        voter.setExtra(btc, 0.01e18);
        pool.set(PRICE, true, 10_000);
        _claimToDebt();
        assertEq(btc.balanceOf(alice), 0.01e18, "BTC forwarded");
        assertEq(btc.balanceOf(address(pool)), 0, "transfer to the pool undone");
        assertEq(m.debtOf(id), 1_000e18, "debt unchanged");
    }

    function test_slippage_guard_refuses_a_bad_price() external {
        voter.setExtra(btc, 0.01e18);
        pool.set(78_000e18, false, 10_000); // 2.8% under the PriceFeed after fee
        _claimToDebt();
        assertEq(btc.balanceOf(alice), 0.01e18, "BTC forwarded at a bad price");
        assertEq(m.debtOf(id), 1_000e18, "debt unchanged");

        // Governance may widen the band up to 5%; then the same pool fills.
        m.setMaxSlippage(500);
        _claimToDebt();
        assertEq(btc.balanceOf(alice), 0.01e18, "second reward swapped");
        assertTrue(m.debtOf(id) < 1_000e18, "debt paid");
    }

    function test_slippage_guard_measures_what_the_pool_pays() external {
        voter.setExtra(btc, 0.01e18);
        pool.set(PRICE, false, 9_000); // quotes fair, pays 10% less
        _claimToDebt();
        assertEq(btc.balanceOf(alice), 0.01e18, "BTC forwarded");
        assertEq(musd.balanceOf(address(m)), 0, "short payment undone");
        assertEq(m.debtOf(id), 1_000e18, "debt unchanged");
    }

    function test_zero_price_never_swaps() external {
        voter.setExtra(btc, 0.01e18);
        feed.set(0);
        _claimToDebt();
        assertEq(btc.balanceOf(alice), 0.01e18, "BTC forwarded without a price");
    }

    function test_no_pool_forwards_as_before() external {
        m.setSwapPool(address(btc), address(0));
        voter.setExtra(btc, 0.01e18);
        _claimToDebt();
        assertEq(btc.balanceOf(alice), 0.01e18, "BTC forwarded");
        assertEq(m.debtOf(id), 1_000e18, "debt unchanged");
    }

    function test_token_without_reference_price_is_not_swapped() external {
        m.setSwapPool(address(reward), address(pool));
        _claimToDebt();
        assertEq(reward.balanceOf(alice), 3e18, "forwarded, not swapped");
    }

    function test_plain_claim_never_swaps() external {
        voter.setExtra(btc, 0.01e18);
        address[] memory rewards = new address[](1);
        address[][] memory tokens = new address[][](1);
        tokens[0] = new address[](1);
        tokens[0][0] = address(btc);
        vm.prank(alice);
        m.claimRewards(id, rewards, tokens, false);
        assertEq(btc.balanceOf(alice), 0.01e18, "BTC forwarded");
    }

    function test_swap_settings_are_admin_only_and_bounded() external {
        vm.prank(alice);
        vm.expectRevert(KeelMarket.OnlyAdmin.selector);
        m.setSwapPool(address(btc), address(0));
        vm.prank(alice);
        vm.expectRevert(KeelMarket.OnlyAdmin.selector);
        m.setMaxSlippage(100);
        vm.expectRevert(KeelMarket.BadParams.selector);
        m.setMaxSlippage(501);
        assertEq(m.maxSlippageBps(), 200, "default 2%");
    }

    function test_only_the_market_may_call_its_swap() external {
        btc.mint(address(m), 1e18);
        vm.prank(alice);
        vm.expectRevert(KeelMarket.NotAllowed.selector);
        m.swapForMusd(address(pool), 1e18);
    }
}
