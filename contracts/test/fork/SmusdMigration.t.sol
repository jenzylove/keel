// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "../utils/Test.sol";
import {KeelStrategy} from "../../src/KeelStrategy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISMUSD {
    function owner() external view returns (address);
    function strategy() external view returns (address);
    function setStrategy(address) external;
    function deposit(uint256) external;
    function withdraw(uint256) external;
    function receiveYieldFromStrategy() external;
    function balanceOf(address) external view returns (uint256);
}

/// @notice Runs on a fork of Mezo mainnet (`mezo` rpc alias in foundry.toml).
///         Only MUSD moves, so the fork works. BTC calls revert on forks
///         because BTC is a native precompile on Mezo.
contract SmusdMigrationForkTest is Test {
    ISMUSD constant SMUSD = ISMUSD(0xb4D498029af77680cD1eF828b967f010d06C51CC);
    IERC20 constant MUSD = IERC20(0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186);
    address constant IDLE = 0x0C0944713c185ea3e64F5609ECee3fB3C054a295;
    // The protocol's Stability Pool holds 14M MUSD; used only to fund test accounts.
    address constant FUNDER = 0x73245Eff485aB3AAc1158B3c4d8f4b23797B0e32;

    KeelStrategy keel;
    address market = address(0x4D4B);
    address saver = address(0x5A7E);
    address borrower = address(0xB0B);

    function setUp() external {
        vm.createSelectFork("mezo");
    }

    function _migrate() internal returns (uint256 idle) {
        idle = MUSD.balanceOf(IDLE);
        keel = new KeelStrategy(MUSD, address(SMUSD), 2_000, 1_000);
        vm.startPrank(SMUSD.owner()); // Mezo's multisig governs Keel too
        keel.setMarket(market);
        SMUSD.setStrategy(address(keel));
        vm.stopPrank();
    }

    function test_one_governance_call_moves_the_idle_savings() external {
        uint256 idle = _migrate();
        emit log_named_address("sMUSD owner (Mezo multisig)", SMUSD.owner());
        emit log_named_uint("MUSD moved out of IdleStrategy", idle / 1e18);
        assertEq(SMUSD.strategy(), address(keel), "strategy switched");
        assertEq(keel.principal(), idle, "principal recorded");
        assertEq(MUSD.balanceOf(address(keel)), idle, "MUSD arrived");
        assertEq(MUSD.balanceOf(IDLE), 0, "IdleStrategy emptied");
        assertEq(keel.admin(), SMUSD.owner(), "Keel is governed by the vault owner");
        emit log_named_uint("lendable at 20% cap", keel.lendable() / 1e18);
    }

    function test_borrower_interest_reaches_savers() external {
        _migrate();

        vm.prank(FUNDER);
        MUSD.transfer(saver, 10_000e18);
        vm.startPrank(saver);
        MUSD.approve(address(SMUSD), 10_000e18);
        SMUSD.deposit(10_000e18);
        vm.stopPrank();

        // A borrower takes 1M from the strategy and repays it with 50k interest.
        vm.prank(market);
        keel.draw(borrower, 1_000_000e18);
        vm.prank(FUNDER);
        MUSD.transfer(market, 1_050_000e18);
        vm.startPrank(market);
        MUSD.transfer(address(keel), 1_050_000e18);
        keel.repaid(1_000_000e18, 50_000e18);
        vm.stopPrank();

        SMUSD.receiveYieldFromStrategy();
        assertEq(keel.yieldOwed(), 0, "yield handed to the vault");
        assertEq(keel.reserve(), 5_000e18, "10% kept as reserve");

        uint256 before = MUSD.balanceOf(saver);
        vm.prank(saver);
        SMUSD.withdraw(10_000e18);
        uint256 got = MUSD.balanceOf(saver) - before;
        emit log_named_uint("saver got back (wei)", got);
        assertTrue(got > 10_000e18, "saver earned borrower interest");
    }

    function test_withdrawals_stay_open_at_max_lending() external {
        uint256 idle = _migrate();
        uint256 cap = keel.lendable();
        vm.prank(market);
        keel.draw(borrower, cap);

        vm.prank(FUNDER);
        MUSD.transfer(saver, 1_000_000e18);
        vm.startPrank(saver);
        MUSD.approve(address(SMUSD), 1_000_000e18);
        SMUSD.deposit(1_000_000e18);
        SMUSD.withdraw(1_000_000e18);
        vm.stopPrank();
        emit log_named_uint("liquid left for other savers", keel.liquid() / 1e18);
        assertEq(keel.liquid(), idle - cap, "the rest stays liquid");
    }
}
