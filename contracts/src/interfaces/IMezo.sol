// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice The parts of Mezo's veBTC (VotingEscrow) that Keel uses.
interface IVeBTC {
    struct LockedBalance {
        int128 amount;
        uint256 end;
        bool isPermanent;
        uint256 boost;
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

/// @notice The parts of Pyth that Keel uses.
interface IPyth {
    struct Price {
        int64 price;
        uint64 conf;
        int32 expo;
        uint256 publishTime;
    }

    function getUpdateFee(bytes[] calldata updateData) external view returns (uint256);
    function updatePriceFeeds(bytes[] calldata updateData) external payable;
    function getPriceNoOlderThan(bytes32 id, uint256 age) external view returns (Price memory);
}
