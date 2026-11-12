// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {KeelMarket} from "../../src/KeelMarket.sol";

/// @dev Mezo trove contracts all zero: moving a trove is off and no reward
///      swap pool is set, as in tests that don't use either.
function noMezo() pure returns (KeelMarket.Mezo memory z) {}
