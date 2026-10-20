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
