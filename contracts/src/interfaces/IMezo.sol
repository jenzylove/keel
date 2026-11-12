// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice The parts of Mezo's veBTC (VotingEscrow) that Keel uses.
interface IVeBTC {
    /// @dev Mainnet veBTC returns a fourth field (boost) after these three;
    ///      testnet veBTC returns only these three. Declaring three decodes
    ///      both, since extra return data is ignored.
    struct LockedBalance {
        int128 amount;
        uint256 end;
        bool isPermanent;
    }

    /// @dev 0 = NORMAL, 1 = LOCKED (in a managed NFT), 2 = MANAGED.
    function escrowType(uint256 tokenId) external view returns (uint8);
    function locked(uint256 tokenId) external view returns (LockedBalance memory);
    function ownerOf(uint256 tokenId) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
    function increaseUnlockTime(uint256 tokenId, uint256 duration) external;
}

/// @notice The parts of Mezo's veBTC Voter that Keel uses.
interface IVoter {
    function vote(uint256 tokenId, address[] calldata pools, uint256[] calldata weights) external;
    function reset(uint256 tokenId) external;
    function claimFees(address[] calldata fees, address[][] calldata tokens, uint256 tokenId) external;
    function claimBribes(address[] calldata bribes, address[][] calldata tokens, uint256 tokenId) external;
}

/// @notice Mezo's MUSD system price feed: BTC price in MUSD, 18 decimals.
interface IPriceFeed {
    function fetchPrice() external returns (uint256);
}

/// @notice Mezo's BorrowerOperationsSignatures: lets a signed message close a
///         trove, with the BTC sent to a recipient the borrower chose.
interface IBorrowerOperationsSignatures {
    function closeTroveWithSignature(address borrower, address recipient, bytes calldata signature, uint256 deadline)
        external;
    function getNonce(address user) external view returns (uint256);
}

/// @notice The parts of Mezo's TroveManager that moving a trove reads.
interface ITroveManager {
    function updateSystemAndTroveInterest(address borrower) external;
    function getTroveDebt(address borrower) external view returns (uint256);
    function getTroveColl(address borrower) external view returns (uint256);
}

/// @notice The part of Mezo's BorrowerOperations that moving a trove reads.
interface IBorrowerOperations {
    function MUSD_GAS_COMPENSATION() external view returns (uint256);
}

/// @notice A Mezo basic pool (Solidly style): send the input in, then call
///         swap for the output.
interface ISwapPool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getAmountOut(uint256 amountIn, address tokenIn) external view returns (uint256);
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external;
}
