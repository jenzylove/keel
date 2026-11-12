// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(string memory n, string memory s) ERC20(n, s) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev MUSD stand in that Mezo's mock trove contracts can burn from, as
///      BorrowerOperations burns MUSD from the caller with no approval.
contract MockBurnableERC20 is MockERC20 {
    constructor(string memory n, string memory s) MockERC20(n, s) {}

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }
}
