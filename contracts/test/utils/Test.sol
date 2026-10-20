// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev Small stand-in for forge-std, which can't be fetched in this build
///      environment. Only the cheatcodes and assertions Keel's tests use.
interface Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function warp(uint256) external;
    function roll(uint256) external;
    function deal(address, uint256) external;
    function expectRevert(bytes calldata) external;
    function expectRevert(bytes4) external;
    function expectRevert() external;
    function assume(bool) external;
    function label(address, string calldata) external;
    function createSelectFork(string calldata) external returns (uint256);
    function addr(uint256) external returns (address);
    function mockCall(address, bytes calldata, bytes calldata) external;
    function etch(address, bytes calldata) external;
}

abstract contract Test {
    Vm internal constant vm =
        Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event log_named_uint(string key, uint256 val);
    event log_named_address(string key, address val);
    event log_string(string val);

    function bound(
        uint256 x,
        uint256 min,
        uint256 max
    ) internal pure returns (uint256) {
        require(min <= max, "bound");
        if (x >= min && x <= max) return x;
        return min + (x % (max - min + 1));
    }

    function assertEq(uint256 a, uint256 b, string memory why) internal pure {
        if (a != b) revert(string.concat(why, ": ", _s(a), " != ", _s(b)));
    }

    function assertEq(address a, address b, string memory why) internal pure {
        require(a == b, why);
    }

    function assertTrue(bool ok, string memory why) internal pure {
        require(ok, why);
    }

    function assertLe(uint256 a, uint256 b, string memory why) internal pure {
        if (a > b) revert(string.concat(why, ": ", _s(a), " > ", _s(b)));
    }

    function assertGe(uint256 a, uint256 b, string memory why) internal pure {
        if (a < b) revert(string.concat(why, ": ", _s(a), " < ", _s(b)));
    }

    function assertApproxEq(
        uint256 a,
        uint256 b,
        uint256 tol,
        string memory why
    ) internal pure {
        uint256 d = a > b ? a - b : b - a;
        if (d > tol) revert(string.concat(why, ": ", _s(a), " vs ", _s(b)));
    }

    function _s(uint256 v) private pure returns (string memory) {
        if (v == 0) return "0";
        uint256 j = v;
        uint256 len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory b = new bytes(len);
        while (v != 0) {
            b[--len] = bytes1(uint8(48 + (v % 10)));
            v /= 10;
        }
        return string(b);
    }
}
