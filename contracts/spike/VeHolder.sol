// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IVeBTC {
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function transferFrom(address from, address to, uint256 tokenId) external;
    function lockPermanent(uint256 tokenId) external;
    function unlockPermanent(uint256 tokenId) external;
    function increaseUnlockTime(uint256 tokenId, uint256 duration) external;
}

interface IVoter {
    function vote(uint256 tokenId, address[] calldata pools, uint256[] calldata weights) external;
    function reset(uint256 tokenId) external;
}

/// @notice Spike only: proves a contract can custody, vote with, lock and hand back a veBTC NFT.
contract VeHolder {
    IVeBTC public immutable ve;
    IVoter public immutable voter;
    address public immutable owner;

    constructor(IVeBTC _ve, IVoter _voter) {
        ve = _ve;
        voter = _voter;
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "owner");
        _;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function vote(uint256 id, address[] calldata pools, uint256[] calldata weights) external onlyOwner {
        voter.vote(id, pools, weights);
    }

    function reset(uint256 id) external onlyOwner {
        voter.reset(id);
    }

    function lockPermanent(uint256 id) external onlyOwner {
        ve.lockPermanent(id);
    }

    function unlockPermanent(uint256 id) external onlyOwner {
        ve.unlockPermanent(id);
    }

    function give(uint256 id, address to) external onlyOwner {
        ve.transferFrom(address(this), to, id);
    }
}
