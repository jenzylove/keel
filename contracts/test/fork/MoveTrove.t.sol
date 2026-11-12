// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "../utils/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {KeelStrategy} from "../../src/KeelStrategy.sol";
import {KeelMarket} from "../../src/KeelMarket.sol";
import {
    IVeBTC,
    IVoter,
    IPriceFeed,
    IBorrowerOperationsSignatures,
    ITroveManager,
    IBorrowerOperations
} from "../../src/interfaces/IMezo.sol";
import {IPegOracle} from "../../src/oracles/PegOracles.sol";
import {MockPegOracle} from "../mocks/MezoMocks.sol";
import {MockNativeBTC} from "../mocks/TroveMocks.sol";

interface IBO {
    function openTrove(uint256 debtAmount, address upperHint, address lowerHint) external payable;
    function troveManager() external view returns (address);
    function borrowerOperationsSignaturesAddress() external view returns (address);
    function minNetDebt() external view returns (uint256);
    function MUSD_GAS_COMPENSATION() external view returns (uint256);
    function priceFeed() external view returns (address);
    function activePool() external view returns (address);
    function musd() external view returns (address);
    function stabilityPoolAddress() external view returns (address);
}

interface ITroveStatus {
    function getTroveStatus(address borrower) external view returns (uint256);
    function getTroveDebt(address borrower) external view returns (uint256);
    function getTroveColl(address borrower) external view returns (uint256);
}

interface ISMUSD {
    function owner() external view returns (address);
    function setStrategy(address) external;
}

/// @notice "Move my Mezo loan into Keel" on Mezo mainnet and testnet forks,
///         through a freshly deployed KeelMarket and KeelStrategy: one
///         CloseTrove signature, then Keel draws the payoff from savings, pays
///         the trove off, takes its BTC and books the same debt.
///
///         Fork stand ins: Mezo's price feed reads an oracle precompile forks
///         can't run, so fetchPrice is mocked at the live mainnet value; and
///         the BTC token (0x7b7C…) calls a native precompile that reverts on
///         forks, so it is replaced by a mock with the same behaviour on
///         Mezo: an ERC20 view over the native balance.
///
///         Blocks are pinned so forge caches the fork state on disk. Run with
///         one job so the public RPCs don't rate limit:
///         forge test --match-path 'test/fork/*' -j 1
contract MoveTroveForkTest is Test {
    bytes32 constant CLOSE_TROVE_TYPEHASH =
        keccak256("CloseTrove(address borrower,address recipient,uint256 nonce,uint256 deadline)");
    bytes32 constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    uint256 constant PK = 0xA11CE;
    uint256 constant BTC_PRICE = 72_969e18; // PriceFeed.fetchPrice() on mainnet, 2026-11-12

    uint256 constant MAINNET_BLOCK = 13_176_742;
    uint256 constant TESTNET_BLOCK = 16_733_439;

    address constant BTC = 0x7b7C000000000000000000000000000000000000;
    address constant MAINNET_BO = 0x44b1bac67dDA612a41a58AAf779143B181dEe031;
    address constant TESTNET_BO = 0xCdF7028ceAB81fA0C6971208e83fa7872994beE5;
    ISMUSD constant MAINNET_SMUSD = ISMUSD(0xb4D498029af77680cD1eF828b967f010d06C51CC);
    // BTC/MUSD basic pools, also in script/deploy.mjs.
    address constant MAINNET_BTC_POOL = 0x52e604c44417233b6CcEDDDc0d640A405Caacefb;
    address constant TESTNET_BTC_POOL = 0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9;

    IBO bo;
    IBorrowerOperationsSignatures bos;
    ITroveStatus tm;
    IERC20 musd;
    address borrower;
    KeelStrategy strat;
    KeelMarket market;

    /// @dev On the testnet fork the test contract plays the savings vault.
    address public owner = address(this);

    function _setUp(string memory rpc, uint256 blockNumber, address _bo, bool realVault, address btcPool) internal {
        vm.createSelectFork(rpc, blockNumber);
        bo = IBO(_bo);
        bos = IBorrowerOperationsSignatures(bo.borrowerOperationsSignaturesAddress());
        tm = ITroveStatus(bo.troveManager());
        musd = IERC20(bo.musd());
        vm.mockCall(bo.priceFeed(), abi.encodeWithSelector(IPriceFeed.fetchPrice.selector), abi.encode(BTC_PRICE));
        vm.etch(BTC, address(new MockNativeBTC()).code);
        vm.allowCheatcodes(BTC); // it moves native balances with deal
        borrower = vm.addr(PK);

        if (realVault) {
            // Mezo's real sMUSD vault and its savings, as in SmusdMigration.
            strat = new KeelStrategy(musd, address(MAINNET_SMUSD), 2_000, 1_000);
        } else {
            strat = new KeelStrategy(musd, address(this), 2_000, 1_000);
        }
        MockPegOracle peg = new MockPegOracle();
        KeelMarket.Config memory c;
        c.risks[0] = KeelMarket.Risk(5_000, 6_500, 500);
        c.risks[1] = KeelMarket.Risk(4_500, 6_000, 800);
        c.risks[2] = KeelMarket.Risk(4_000, 5_500, 1_000);
        c.rates = KeelMarket.RateParams(0.03e18, 0.04e18, 0.75e18, 0.8e18);
        c.peg = KeelMarket.PegParams(0.995e18, 0.985e18, 0.04e18, 0.01e18, 7 days);
        c.pegOracle = IPegOracle(address(peg));
        c.minLoan = 5e18;
        market = new KeelMarket(
            KeelMarket.Deps(
                musd, IERC20(BTC), IVeBTC(address(1)), IVoter(address(1)), IPriceFeed(bo.priceFeed()),
                IPegOracle(address(peg)), strat
            ),
            c,
            2 days,
            KeelMarket.Mezo(
                bos,
                ITroveManager(address(tm)),
                IBorrowerOperations(address(bo)),
                bo.activePool(),
                btcPool
            )
        );

        if (realVault) {
            vm.startPrank(MAINNET_SMUSD.owner());
            strat.setMarket(address(market));
            MAINNET_SMUSD.setStrategy(address(strat));
            vm.stopPrank();
        } else {
            strat.setMarket(address(market));
            _fund(address(this), 100_000e18);
            musd.approve(address(strat), type(uint256).max);
            strat.allocate(100_000e18);
        }
        emit log_named_uint("Keel savings (MUSD)", strat.principal() / 1e18);
    }

    function _openTrove(uint256 btcIn, uint256 debtAmount) internal {
        vm.deal(borrower, btcIn);
        vm.prank(borrower);
        bo.openTrove{value: btcIn}(debtAmount, address(0), address(0));
        assertEq(tm.getTroveStatus(borrower), 1, "trove active");
    }

    function _fund(address to, uint256 amount) internal {
        vm.prank(bo.stabilityPoolAddress()); // the Stability Pool holds the protocol's MUSD float
        musd.transfer(to, amount);
    }

    function _sign(address recipient, uint256 deadline) internal returns (bytes memory) {
        bytes32 domain = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH, keccak256("BorrowerOperationsSignatures"), keccak256("1"), block.chainid, address(bos)
            )
        );
        bytes32 structHash =
            keccak256(abi.encode(CLOSE_TROVE_TYPEHASH, borrower, recipient, bos.getNonce(borrower), deadline));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(PK, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(r, s, v);
    }

    function _moveEndToEnd() internal {
        uint256 minDebt = bo.minNetDebt();
        emit log_named_uint("minNetDebt (MUSD)", minDebt / 1e18);
        _openTrove(0.05e18, minDebt); // 0.05 BTC (~$3.6k) against the minimum loan
        uint256 coll = tm.getTroveColl(borrower);
        uint256 troveDebt = tm.getTroveDebt(borrower);
        emit log_named_uint("trove BTC (1e-8)", coll / 1e10);
        emit log_named_uint("trove debt incl. fee + gas comp (1e-2 MUSD)", troveDebt / 1e16);

        // The borrower holds no MUSD after opening: nothing is paid up front.
        uint256 borrowed = musd.balanceOf(borrower);
        vm.prank(borrower);
        musd.transfer(address(0xdead), borrowed);

        uint256 lentBefore = strat.lent();
        uint256 nonceBefore = bos.getNonce(borrower);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(address(market), deadline);

        // Another caller can't use the signature: Keel acts on the caller's own trove.
        vm.prank(address(0xBEEF));
        vm.expectRevert(KeelMarket.NoDebt.selector);
        market.openFromTrove(0, deadline, sig);

        vm.prank(borrower);
        uint256 id = market.openFromTrove(0, deadline, sig);

        uint256 debt = troveDebt - bo.MUSD_GAS_COMPENSATION();
        (address loanOwner,,, uint256 loanBtc,,,) = market.loans(id);
        assertEq(loanOwner, borrower, "loan owner");
        assertEq(tm.getTroveStatus(borrower), 2, "trove closed by owner");
        assertEq(loanBtc, coll, "all collateral moved");
        assertEq(address(market).balance, coll, "BTC arrived at the market");
        assertEq(market.debtOf(id), debt, "debt carried over");
        assertEq(strat.lent() - lentBefore, debt, "drawn from Keel savings");
        assertEq(musd.balanceOf(address(market)), 0, "no MUSD left in the market");
        assertEq(bos.getNonce(borrower), nonceBefore + 1, "nonce used");
        emit log_named_uint("BTC moved (1e-8)", loanBtc / 1e10);
        emit log_named_uint("debt moved (1e-2 MUSD)", debt / 1e16);
        (,, uint256 health,) = market.positionAt(id, BTC_PRICE);
        emit log_named_uint("health in Keel (1e-4)", health / 1e14);

        // The signature can't be replayed: the nonce moved.
        _fund(address(this), troveDebt);
        vm.expectRevert(bytes("BorrowerOperationsSignatures: Invalid signature"));
        bos.closeTroveWithSignature(borrower, address(market), sig, deadline);

        // The moved loan works like any Keel loan: repay, close, BTC home.
        vm.warp(block.timestamp + 1 days);
        uint256 owed = market.debtOf(id);
        _fund(borrower, owed);
        vm.startPrank(borrower);
        musd.approve(address(market), owed);
        market.repay(id, owed);
        market.close(id);
        vm.stopPrank();
        assertEq(borrower.balance, coll, "BTC back to the borrower");
        emit log_named_uint("interest paid to savers over a day (1e-4 MUSD)", (owed - debt) / 1e14);
    }

    function test_mainnet_move_trove_into_keel() external {
        _setUp("mezo", MAINNET_BLOCK, MAINNET_BO, true, MAINNET_BTC_POOL);
        assertEq(block.chainid, 31612, "mainnet");
        _moveEndToEnd();
    }

    function test_testnet_move_trove_into_keel() external {
        _setUp("mezo_testnet", TESTNET_BLOCK, TESTNET_BO, false, TESTNET_BTC_POOL);
        assertEq(block.chainid, 31611, "testnet");
        _moveEndToEnd();
    }

    /// The signature binds borrower and recipient but not the caller: any
    /// account holding the payoff can submit it to Mezo. Keel's receive guard
    /// only takes BTC mid move, so a front run reverts.
    function test_mainnet_frontrun_with_signature_reverts_at_keel() external {
        _setUp("mezo", MAINNET_BLOCK, MAINNET_BO, true, MAINNET_BTC_POOL);
        _openTrove(0.05e18, bo.minNetDebt());
        _fund(address(this), tm.getTroveDebt(borrower));
        bytes memory sig = _sign(address(market), block.timestamp + 1 hours);
        vm.expectRevert(bytes("Sending BTC failed"));
        bos.closeTroveWithSignature(borrower, address(market), sig, block.timestamp + 1 hours);
        assertEq(tm.getTroveStatus(borrower), 1, "trove still open");
    }

    /// The live KeelMarket has no receive(), so Mezo's ActivePool can't pay
    /// it: the move needs the upgraded market, not a periphery contract.
    function test_mainnet_current_keelMarket_cannot_receive_trove_btc() external {
        _setUp("mezo", MAINNET_BLOCK, MAINNET_BO, true, MAINNET_BTC_POOL);
        address liveMarket = 0x3D6e71dfC30fdF24b8d2a9f9D564C3dc7c29d0d9;
        _openTrove(0.05e18, bo.minNetDebt());
        _fund(address(this), tm.getTroveDebt(borrower));
        bytes memory sig = _sign(liveMarket, block.timestamp + 1 hours);
        vm.expectRevert(bytes("Sending BTC failed"));
        bos.closeTroveWithSignature(borrower, liveMarket, sig, block.timestamp + 1 hours);
    }

    /// A BTC reward swapped to MUSD on Mezo's real BTC/MUSD pool, through
    /// the market's own swap call, filled within 2% of the PriceFeed value.
    function test_mainnet_btc_reward_swaps_on_the_real_pool() external {
        _setUp("mezo", MAINNET_BLOCK, MAINNET_BO, true, MAINNET_BTC_POOL);
        vm.deal(address(market), 0.001e18);
        vm.prank(address(market));
        uint256 out = market.swapForMusd(MAINNET_BTC_POOL, 0.001e18);
        emit log_named_uint("0.001 BTC swapped to (1e-4 MUSD)", out / 1e14);
        assertGe(out, (0.001e18 * BTC_PRICE / 1e18) * 9_800 / 10_000, "within 2% of the PriceFeed");
        assertEq(musd.balanceOf(address(market)), out, "MUSD arrived");
    }
}
