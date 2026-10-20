// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "../utils/Test.sol";
import {IVeBTC} from "../../src/interfaces/IMezo.sol";

/// @notice Mainnet veBTC returns four fields from locked(); Keel declares three
///         so the same interface works on testnet. This proves mainnet decodes.
contract VeBTCDecodeForkTest is Test {
    IVeBTC constant VE = IVeBTC(0x3D4b1b884A7a1E59fE8589a3296EC8f8cBB6f279);

    function test_mainnet_locked_decodes_with_three_fields() external {
        vm.createSelectFork("mezo");
        IVeBTC.LockedBalance memory l = VE.locked(6114); // an Enclave's 500 BTC lock
        emit log_named_uint("BTC locked in #6114", uint256(int256(l.amount)) / 1e18);
        assertGe(uint256(int256(l.amount)), 500e18, "amount decoded");
        assertEq(VE.escrowType(6114), 0, "normal lock");
    }
}
