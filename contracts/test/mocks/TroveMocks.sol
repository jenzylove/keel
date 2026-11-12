// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MockBurnableERC20} from "./MockERC20.sol";

interface VmDeal {
    function deal(address, uint256) external;
}

/// @dev Mezo's BTC token: an ERC20 view over the native balance. Moving it
///      moves native BTC, which the mock does with the deal cheatcode.
contract MockNativeBTC {
    VmDeal internal constant VM = VmDeal(address(uint160(uint256(keccak256("hevm cheat code")))));
    mapping(address => mapping(address => uint256)) public allowance;

    function decimals() external pure returns (uint8) {
        return 18;
    }

    function balanceOf(address a) public view returns (uint256) {
        return a.balance;
    }

    function mint(address to, uint256 amount) external {
        VM.deal(to, to.balance + amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "allowance");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) internal {
        require(from.balance >= amount, "balance");
        VM.deal(from, from.balance - amount);
        VM.deal(to, to.balance + amount);
    }
}

/// @dev Mezo's ActivePool: pays collateral with a plain call, as Mezo does.
contract MockActivePool {
    address public troves;

    function setTroves(address t) external {
        troves = t;
    }

    function sendCollateral(address to, uint256 amount) external {
        require(msg.sender == troves, "auth");
        (bool ok,) = to.call{value: amount}("");
        require(ok, "Sending BTC failed");
    }

    receive() external payable {}
}

/// @dev Plays BorrowerOperationsSignatures, TroveManager and
///      BorrowerOperations at one address. A signature is a hash of the
///      CloseTrove fields, so tests can make valid and invalid ones.
contract MockMezoTroves {
    uint256 public constant MUSD_GAS_COMPENSATION = 200e18;

    struct Trove {
        uint256 coll;
        uint256 debt;
        uint256 status;
    }

    MockBurnableERC20 public immutable musd;
    MockActivePool public immutable activePool;
    mapping(address => Trove) public troves;
    mapping(address => uint256) public getNonce;
    mapping(address => uint256) public pendingInterest;

    // Knobs that make the mock misbehave.
    uint256 public collShort;
    uint256 public burnShort;
    address public hookTarget;
    bytes public hookData;

    constructor(MockBurnableERC20 _musd, MockActivePool _ap) {
        musd = _musd;
        activePool = _ap;
    }

    function open(address borrower, uint256 coll, uint256 debt) external {
        troves[borrower] = Trove(coll, debt, 1);
    }

    function addInterest(address borrower, uint256 amount) external {
        pendingInterest[borrower] += amount;
    }

    function setShort(uint256 coll, uint256 burn) external {
        collShort = coll;
        burnShort = burn;
    }

    function setHook(address target, bytes calldata data) external {
        hookTarget = target;
        hookData = data;
    }

    function sigFor(address borrower, address recipient, uint256 deadline) public view returns (bytes memory) {
        return abi.encode(keccak256(abi.encode(borrower, recipient, getNonce[borrower], deadline)));
    }

    function updateSystemAndTroveInterest(address borrower) public {
        troves[borrower].debt += pendingInterest[borrower];
        pendingInterest[borrower] = 0;
    }

    function getTroveDebt(address borrower) external view returns (uint256) {
        return troves[borrower].debt;
    }

    function getTroveColl(address borrower) external view returns (uint256) {
        return troves[borrower].coll;
    }

    function getTroveStatus(address borrower) external view returns (uint256) {
        return troves[borrower].status;
    }

    function closeTroveWithSignature(address borrower, address recipient, bytes calldata sig, uint256 deadline)
        external
    {
        require(block.timestamp <= deadline, "expired");
        require(keccak256(sig) == keccak256(sigFor(borrower, recipient, deadline)), "Invalid signature");
        getNonce[borrower]++;
        Trove storage t = troves[borrower];
        require(t.status == 1, "not active");
        updateSystemAndTroveInterest(borrower);
        musd.burn(msg.sender, t.debt - MUSD_GAS_COMPENSATION - burnShort);
        uint256 coll = t.coll;
        t.coll = 0;
        t.debt = 0;
        t.status = 2;
        if (hookTarget != address(0)) {
            (bool ok, bytes memory ret) = hookTarget.call(hookData);
            if (!ok) {
                assembly {
                    revert(add(ret, 32), mload(ret))
                }
            }
        }
        activePool.sendCollateral(recipient, coll - collShort);
    }
}

interface IBalanceOf {
    function balanceOf(address) external view returns (uint256);
}

/// @dev A Mezo basic pool (Solidly style) between BTC and MUSD. Quotes at a
///      set price less a 0.3% fee; can be told to revert or to pay less than
///      it quoted.
contract MockSwapPool {
    address public immutable token0;
    address public immutable token1;
    MockBurnableERC20 public immutable musd;
    address public immutable btc;
    uint256 public price; // MUSD per BTC, 18 decimals
    bool public broken;
    uint256 public payBps = 10_000;
    uint256 internal seen;

    constructor(address _btc, MockBurnableERC20 _musd, uint256 _price) {
        (token0, token1) = _btc < address(_musd) ? (_btc, address(_musd)) : (address(_musd), _btc);
        musd = _musd;
        btc = _btc;
        price = _price;
    }

    function set(uint256 _price, bool _broken, uint256 _payBps) external {
        price = _price;
        broken = _broken;
        payBps = _payBps;
    }

    function getAmountOut(uint256 amountIn, address tokenIn) external view returns (uint256) {
        require(tokenIn == btc, "token");
        return ((amountIn * price) / 1e18) * 9_970 / 10_000;
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata) external {
        require(!broken, "K");
        uint256 bal = IBalanceOf(btc).balanceOf(address(this));
        require(bal > seen, "no input");
        seen = bal;
        uint256 out = token0 == address(musd) ? amount0Out : amount1Out;
        musd.mint(to, (out * payBps) / 10_000);
    }
}
