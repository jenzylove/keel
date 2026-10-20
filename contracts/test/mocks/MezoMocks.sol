// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IVeBTC, IPyth} from "../../src/interfaces/IMezo.sol";
import {MockERC20} from "./MockERC20.sol";

/// @dev veBTC stand-in: ownership, lock data, and Mezo's rule that an NFT has
///      no voting power in the block it changed owner.
contract MockVeBTC {
    mapping(uint256 => address) public ownerOf;
    mapping(uint256 => IVeBTC.LockedBalance) internal _locked;
    mapping(uint256 => uint8) public escrowType;
    mapping(uint256 => uint256) public ownershipChange;
    mapping(uint256 => mapping(address => bool)) public approved;
    uint256 public nextId = 1;

    function mint(address to, uint256 amount, uint256 end, bool permanent) external returns (uint256 id) {
        id = nextId++;
        ownerOf[id] = to;
        _locked[id] = IVeBTC.LockedBalance(int128(int256(amount)), end, permanent);
    }

    function locked(uint256 id) external view returns (IVeBTC.LockedBalance memory) {
        return _locked[id];
    }

    function setEscrowType(uint256 id, uint8 t) external {
        escrowType[id] = t;
    }

    function approve(address to, uint256 id) external {
        require(ownerOf[id] == msg.sender, "owner");
        approved[id][to] = true;
    }

    function transferFrom(address from, address to, uint256 id) external {
        require(ownerOf[id] == from, "from");
        require(msg.sender == from || approved[id][msg.sender], "auth");
        ownerOf[id] = to;
        delete approved[id][msg.sender];
        ownershipChange[id] = block.number;
    }

    function increaseUnlockTime(uint256 id, uint256 duration) external {
        require(ownerOf[id] == msg.sender, "auth");
        _locked[id].end = block.timestamp + duration;
    }

    function votingPower(uint256 id) external view returns (uint256) {
        if (ownershipChange[id] == block.number) return 0;
        return uint256(int256(_locked[id].amount));
    }
}

/// @dev Voter stand-in: records votes and pays rewards to the NFT owner.
contract MockVoter {
    MockVeBTC public immutable ve;
    mapping(uint256 => bool) public voted;
    MockERC20 public rewardToken;

    error ZeroBalance();

    constructor(MockVeBTC _ve, MockERC20 _reward) {
        ve = _ve;
        rewardToken = _reward;
    }

    function vote(uint256 id, address[] calldata, uint256[] calldata) external {
        require(ve.ownerOf(id) == msg.sender, "auth");
        if (ve.votingPower(id) == 0) revert ZeroBalance();
        voted[id] = true;
    }

    function reset(uint256 id) external {
        require(ve.ownerOf(id) == msg.sender, "auth");
        voted[id] = false;
    }

    function claimFees(address[] calldata, address[][] calldata, uint256 id) external {
        rewardToken.mint(ve.ownerOf(id), 3e18);
    }

    function claimBribes(address[] calldata, address[][] calldata, uint256 id) external {
        rewardToken.mint(ve.ownerOf(id), 5e18);
    }
}

contract MockPriceFeed {
    uint256 public price;

    function set(uint256 p) external {
        price = p;
    }

    function fetchPrice() external view returns (uint256) {
        return price;
    }
}

/// @dev Pyth stand-in: one settable price, staleness enforced like Pyth.
contract MockPyth {
    int64 public price;
    int32 public expo = -8;
    uint256 public publishTime;
    uint256 public fee = 1;

    error StalePrice();

    function set(int64 p, uint256 t) external {
        price = p;
        publishTime = t;
    }

    function getUpdateFee(bytes[] calldata) external view returns (uint256) {
        return fee;
    }

    function updatePriceFeeds(bytes[] calldata data) external payable {
        require(msg.value >= fee, "fee");
        (int64 p, uint256 t) = abi.decode(data[0], (int64, uint256));
        price = p;
        publishTime = t;
    }

    function getPriceNoOlderThan(bytes32, uint256 age) external view returns (IPyth.Price memory) {
        if (block.timestamp > publishTime + age) revert StalePrice();
        return IPyth.Price(price, 0, expo, publishTime);
    }
}
