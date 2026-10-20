// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IVaultStrategy} from "./interfaces/IVaultStrategy.sol";

/// @title KeelStrategy
/// @notice A strategy for Mezo's MUSD Savings Rate vault. It holds savers'
///         principal, lets KeelMarket borrow a capped share of it, and sends
///         the interest borrowers pay back to the vault as yield.
/// @dev The vault calls `deallocate` inside a saver's withdrawal, so at least
///      `1 - maxLentBps` of principal always stays liquid here. Principal can
///      only be migrated away once nothing is lent out.
contract KeelStrategy is IVaultStrategy {
    using SafeERC20 for IERC20;

    uint256 internal constant BPS = 10_000;
    /// @notice Hard ceiling on the lent share, whatever the admin sets.
    uint256 public constant MAX_LENT_CEILING_BPS = 5_000;

    IERC20 public immutable musd;
    address public immutable vault;

    address public admin;
    address public market;

    /// @notice Savers' principal this strategy is responsible for.
    uint256 public principal;
    /// @notice Principal currently lent to borrowers.
    uint256 public lent;
    /// @notice Interest set aside to cover bad debt.
    uint256 public reserve;
    /// @notice Interest owed to the vault, paid on the next `claimYield`.
    uint256 public yieldOwed;
    /// @notice Total principal ever written off as bad debt.
    uint256 public badDebt;

    uint256 public maxLentBps;
    uint256 public reserveBps;

    event MarketSet(address market);
    event AdminChanged(address admin);
    event ParamsSet(uint256 maxLentBps, uint256 reserveBps);
    event Drawn(address to, uint256 amount);
    event Repaid(uint256 principalPart, uint256 interestPart, uint256 toReserve);
    event WrittenOff(uint256 amount, uint256 fromReserve);
    event ReserveReleased(uint256 amount);
    event YieldSent(uint256 amount);

    error OnlyVault();
    error OnlyMarket();
    error OnlyAdmin();
    error MarketAlreadySet();
    error InsufficientLiquidity(uint256 wanted, uint256 liquid);
    error LendCapExceeded(uint256 wanted, uint256 available);
    error LoansOutstanding(uint256 lent);
    error BadParams();

    modifier onlyVault() {
        if (msg.sender != vault) revert OnlyVault();
        _;
    }

    modifier onlyMarket() {
        if (msg.sender != market) revert OnlyMarket();
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    constructor(
        IERC20 _musd,
        address _vault,
        address _admin,
        uint256 _maxLentBps,
        uint256 _reserveBps
    ) {
        musd = _musd;
        vault = _vault;
        admin = _admin;
        _setParams(_maxLentBps, _reserveBps);
    }

    // ---------------------------------------------------------------------
    // Vault side (IVaultStrategy)
    // ---------------------------------------------------------------------

    /// @inheritdoc IVaultStrategy
    function allocate(uint256 amount) external onlyVault {
        emit Allocate(amount);
        principal += amount;
        musd.safeTransferFrom(vault, address(this), amount);
    }

    /// @inheritdoc IVaultStrategy
    function deallocate(uint256 amount) external onlyVault {
        uint256 l = liquid();
        if (amount > l) revert InsufficientLiquidity(amount, l);
        emit Deallocate(amount);
        principal -= amount;
        musd.safeTransfer(vault, amount);
    }

    /// @inheritdoc IVaultStrategy
    function claimYield() external onlyVault returns (uint256 amount) {
        amount = yieldOwed;
        if (amount > 0) {
            yieldOwed = 0;
            emit YieldSent(amount);
            musd.safeTransfer(vault, amount);
        }
    }

    /// @inheritdoc IVaultStrategy
    function migrate(
        address newStrategy
    ) external onlyVault returns (uint256 amount) {
        if (lent != 0) revert LoansOutstanding(lent);
        amount = principal;
        principal = 0;
        emit Migrated(newStrategy, amount);
        if (amount > 0) musd.safeTransfer(newStrategy, amount);
    }

    /// @inheritdoc IVaultStrategy
    function onMigrated(uint256 amount) external onlyVault {
        principal += amount;
    }

    // ---------------------------------------------------------------------
    // Market side
    // ---------------------------------------------------------------------

    /// @notice Lends `amount` of principal to a borrower, within the cap.
    function draw(address to, uint256 amount) external onlyMarket {
        // Withdrawals shrink principal while loans stay out, so the cap can
        // fall below what is already lent.
        uint256 cap = lendable();
        uint256 room = cap > lent ? cap - lent : 0;
        if (amount > room) revert LendCapExceeded(amount, room);
        uint256 l = liquid();
        if (amount > l) revert InsufficientLiquidity(amount, l);
        lent += amount;
        emit Drawn(to, amount);
        musd.safeTransfer(to, amount);
    }

    /// @notice Records a repayment. The market has already sent
    ///         `principalPart + interestPart` MUSD here.
    function repaid(
        uint256 principalPart,
        uint256 interestPart
    ) external onlyMarket {
        lent -= principalPart;
        uint256 toReserve = (interestPart * reserveBps) / BPS;
        reserve += toReserve;
        yieldOwed += interestPart - toReserve;
        emit Repaid(principalPart, interestPart, toReserve);
    }

    /// @notice Records lent principal that will never come back. The reserve
    ///         absorbs it first; anything beyond is a loss to savers and is
    ///         recorded in `badDebt`.
    function writeOff(uint256 amount) external onlyMarket {
        lent -= amount;
        uint256 fromReserve = amount > reserve ? reserve : amount;
        // Reserve MUSD is still held here, so moving it into principal's
        // liquid balance covers the hole without any transfer.
        reserve -= fromReserve;
        badDebt += amount - fromReserve;
        emit WrittenOff(amount, fromReserve);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice MUSD available to repay savers right now.
    function liquid() public view returns (uint256) {
        uint256 bal = musd.balanceOf(address(this));
        uint256 held = yieldOwed + reserve;
        return bal > held ? bal - held : 0;
    }

    /// @notice Most principal that may be lent at once.
    function lendable() public view returns (uint256) {
        return (principal * maxLentBps) / BPS;
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    /// @notice Wires the market once.
    function setMarket(address _market) external onlyAdmin {
        if (market != address(0)) revert MarketAlreadySet();
        market = _market;
        emit MarketSet(_market);
    }

    function setParams(
        uint256 _maxLentBps,
        uint256 _reserveBps
    ) external onlyAdmin {
        _setParams(_maxLentBps, _reserveBps);
    }

    /// @notice Pays part of the reserve out to savers as yield.
    function releaseReserve(uint256 amount) external onlyAdmin {
        reserve -= amount;
        yieldOwed += amount;
        emit ReserveReleased(amount);
    }

    function setAdmin(address _admin) external onlyAdmin {
        admin = _admin;
        emit AdminChanged(_admin);
    }

    function _setParams(uint256 _maxLentBps, uint256 _reserveBps) private {
        if (_maxLentBps > MAX_LENT_CEILING_BPS || _reserveBps > BPS) {
            revert BadParams();
        }
        maxLentBps = _maxLentBps;
        reserveBps = _reserveBps;
        emit ParamsSet(_maxLentBps, _reserveBps);
    }
}
