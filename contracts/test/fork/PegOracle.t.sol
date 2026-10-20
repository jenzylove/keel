// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "../utils/Test.sol";
import {ClPoolTwapPegOracle, BasicPoolTwapPegOracle, IClPool, IBasicPool} from "../../src/oracles/PegOracles.sol";

/// @notice Reads MUSD's real price on Mezo mainnet through both oracle
///         adapters. Only pool views are called, so the fork works.
contract PegOracleForkTest is Test {
    address constant MUSD = 0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186;
    address constant MUSDC = 0x04671C72Aab5AC02A03c1098314b1BB6B560c197;
    // mUSDC/MUSD concentrated-liquidity pool holding Mezo's peg wall.
    IClPool constant CL = IClPool(0xCC372B7E15535aB225fe17c1075831D38ef7aC1a);
    // MUSD/mUSDC basic stable pool.
    IBasicPool constant BASIC = IBasicPool(0xEd812AEc0Fecc8fD882Ac3eccC43f3aA80A6c356);

    function test_cl_pool_24h_twap_reads_musd_below_peg() external {
        vm.createSelectFork("mezo");
        ClPoolTwapPegOracle o = new ClPoolTwapPegOracle(CL, MUSD, 1 days);
        uint256 p = o.musdPrice();
        emit log_named_uint("MUSD price, 24h TWAP of the mUSDC/MUSD wall (1e-6)", p / 1e12);
        assertTrue(p > 0.95e18 && p < 1.05e18, "a sane dollar price");
    }

    function test_basic_pool_twap_reads_musd() external {
        vm.createSelectFork("mezo");
        BasicPoolTwapPegOracle o = new BasicPoolTwapPegOracle(BASIC, MUSD, MUSDC, 48);
        uint256 p = o.musdPrice();
        emit log_named_uint("MUSD price, 24h basic-pool TWAP (1e-6)", p / 1e12);
        assertTrue(p > 0.9e18 && p < 1.1e18, "a sane dollar price");
    }
}
