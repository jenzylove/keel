// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IVaultStrategy} from "./interfaces/IVaultStrategy.sol";

interface IOwnable {
    function owner() external view returns (address);
}

interface IKeelMarket {
    function accrue() external;
    function configDelay() external view returns (uint256);
}

/// @title KeelStrategy
/// @notice A strategy for Mezo's MUSD Savings Rate vault. It holds savers'
///         principal, lets KeelMarket borrow a capped share of it, and sends
///         the interest borrowers pay back to the vault as yield.
/// @dev The vault calls `deallocate` inside a saver's withdrawal and pays the
///      saver straight after, so a withdrawal is paid in full or not at all.
///      `withdrawable()` says exactly how much can leave right now, so a front
///      end can cap a withdrawal before sending it. That is the liquid
///      principal plus the reserve while it is still held here: the reserve is
///      a claim on the strategy's assets that absorbs losses first, and lending
///      its MUSD to a leaving saver keeps that claim whole. Repayments refill it
///      before any principal counts as liquid again. Yield owed to the vault is
///      never used, so the vault's own claims never fail.
///
///      While liquid principal is under `minLiquidBps` of principal, new
///      borrowing pauses and repayments stay open. Withdrawals also shrink
///      what may be lent, which pushes utilisation up the steep part of the
///      rate curve and pulls repayments in. Principal can only be migrated
///      away once nothing is lent out.
///
///      Interest is released to the vault over `DRIP` rather than in one lump
///      at repayment, so a deposit made just before a large repayment earns
///      only its share of the time it stays. Any change to principal or the
///      cap brings the market's interest up to date first.
///
///      Keel adds no new party to trust: its admin is whoever owns the vault,
///      read live. On mainnet that is the Mezo multisig, which can already move
///      the whole vault with `setStrategy`.
contract KeelStrategy is IVaultStrategy {
    using SafeERC20 for IERC20;

    uint256 internal constant BPS = 10_000;
    /// @notice Hard ceiling on the lent share, whatever the admin sets.
    uint256 public constant MAX_LENT_CEILING_BPS = 5_000;
    /// @notice Interest is released to savers evenly over this period.
    uint256 public constant DRIP = 7 days;
    /// @notice Highest protocol share of interest, whatever the admin sets.
    uint256 public constant MAX_FEE_BPS = 2_000;
    /// @notice Liquidity buffer a new strategy starts with: 10% of principal.
    uint256 public constant DEFAULT_MIN_LIQUID_BPS = 1_000;

    IERC20 public immutable musd;
    address public immutable vault;

    address public market;

    /// @notice Savers' principal this strategy is responsible for.
    uint256 public principal;
    /// @notice Principal currently lent to borrowers.
    uint256 public lent;
    /// @notice Interest set aside to cover bad debt.
    uint256 public reserve;
    /// @notice Interest owed to the vault, released over `DRIP`.
    uint256 public yieldOwed;
    /// @notice Total principal ever written off beyond the reserve.
    uint256 public badDebt;
    /// @notice Part of `badDebt` not yet made good. New interest covers it
    ///         before anything goes to the reserve or to savers.
    uint256 public uncovered;
    /// @notice Unreleased interest as of `dripAt`.
    uint256 public dripLeft;
    uint256 public dripAt;

    uint256 public maxLentBps;
    uint256 public reserveBps;
    /// @notice Most principal the strategy accepts (0 = no limit). A small,
    ///         unaudited deployment keeps what savers can put at risk small.
    uint256 public principalCap;
    /// @notice New borrowing pauses while liquid principal is below this
    ///         share of principal.
    uint256 public minLiquidBps;
    /// @notice Protocol share of borrower interest, paid to `feeRecipient`
    ///         to fund the keeper and hosting. Starts at zero.
    uint256 public feeBps;
    address public feeRecipient;

    /// @notice Proposed parameters and when they may be applied. They wait
    ///         the market's config delay, because the cap moves the rate.
    uint256 public pendingMaxLentBps;
    uint256 public pendingReserveBps;
    uint256 public pendingMinLiquidBps;
    uint256 public pendingFeeBps;
    address public pendingFeeRecipient;
    uint256 public paramsEta;

    event MarketSet(address market);
    event ParamsSet(uint256 maxLentBps, uint256 reserveBps);
    event Drawn(address to, uint256 amount);
    event Repaid(uint256 principalPart, uint256 interestPart, uint256 toReserve);
    event WrittenOff(uint256 amount, uint256 fromReserve);
    event ReserveReleased(uint256 amount);
    event YieldSent(uint256 amount);
    event LossCovered(address from, uint256 amount);
    event ParamsProposed(uint256 maxLentBps, uint256 reserveBps, uint256 eta);
    event ParamsCancelled();
    event Swept(address to, uint256 amount);
    event PrincipalCapSet(uint256 cap);
    event BufferAndFeeSet(uint256 minLiquidBps, uint256 feeBps, address feeRecipient);
    event BufferAndFeeProposed(uint256 minLiquidBps, uint256 feeBps, address feeRecipient, uint256 eta);
    event FeePaid(address recipient, uint256 amount);

    error OnlyVault();
    error OnlyMarket();
    error OnlyAdmin();
    error MarketAlreadySet();
    /// @notice A withdrawal or draw asked for more than is available now.
    error InsufficientLiquidity(uint256 wanted, uint256 available);
    error BelowLiquidityBuffer(uint256 liquidAfter, uint256 buffer);
    error ReserveNotHeld(uint256 wanted, uint256 held);
    error LendCapExceeded(uint256 wanted, uint256 available);
    error LoansOutstanding(uint256 lent);
    error BadParams();
    error NothingPending();
    error TooEarly(uint256 eta);
    error StillActive();
    error PrincipalCapReached(uint256 principal, uint256 cap);

    modifier onlyVault() {
        if (msg.sender != vault) revert OnlyVault();
        _;
    }

    modifier onlyMarket() {
        if (msg.sender != market) revert OnlyMarket();
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin()) revert OnlyAdmin();
        _;
    }

    /// @notice The vault's owner, who governs Keel too.
    function admin() public view returns (address) {
        return IOwnable(vault).owner();
    }

    constructor(
        IERC20 _musd,
        address _vault,
        uint256 _maxLentBps,
        uint256 _reserveBps
    ) {
        musd = _musd;
        vault = _vault;
        _setParams(_maxLentBps, _reserveBps, DEFAULT_MIN_LIQUID_BPS, 0, address(0));
    }

    // ---------------------------------------------------------------------
    // Vault side (IVaultStrategy)
    // ---------------------------------------------------------------------

    /// @inheritdoc IVaultStrategy
    function allocate(uint256 amount) external onlyVault {
        _accrueMarket();
        emit Allocate(amount);
        principal += amount;
        _checkCap();
        musd.safeTransferFrom(vault, address(this), amount);
    }

    /// @inheritdoc IVaultStrategy
    /// @dev Pays from liquid principal, then from the reserve while it is held
    ///      here. Reverts with the amount available when asked for more.
    function deallocate(uint256 amount) external onlyVault {
        _accrueMarket();
        uint256 a = withdrawable();
        if (amount > a) revert InsufficientLiquidity(amount, a);
        emit Deallocate(amount);
        principal -= amount;
        musd.safeTransfer(vault, amount);
    }

    /// @inheritdoc IVaultStrategy
    /// @dev The vault reverts on yield too small to move its index, and it
    ///      claims inside every deposit and withdrawal, so such an amount is
    ///      held back until it has grown.
    function claimYield() external onlyVault returns (uint256 amount) {
        amount = yieldOwed - unreleased();
        if (amount == 0) return 0;
        try IERC20(vault).totalSupply() returns (uint256 supply) {
            if (amount * 1e18 < supply) return 0;
        } catch {}
        yieldOwed -= amount;
        emit YieldSent(amount);
        musd.safeTransfer(vault, amount);
    }

    /// @inheritdoc IVaultStrategy
    function migrate(
        address newStrategy
    ) external onlyVault returns (uint256 amount) {
        if (lent != 0) revert LoansOutstanding(lent);
        // After a loss beyond the reserve, only what is here can move. The
        // shortfall then sits with the vault rather than blocking migration.
        uint256 l = liquid();
        amount = principal < l ? principal : l;
        principal = 0;
        uncovered = 0;
        emit Migrated(newStrategy, amount);
        if (amount > 0) musd.safeTransfer(newStrategy, amount);
    }

    /// @inheritdoc IVaultStrategy
    function onMigrated(uint256 amount) external onlyVault {
        _accrueMarket();
        principal += amount;
        _checkCap();
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
        // A loan may not take liquid principal below the buffer savers rely on.
        uint256 buffer = liquidityBuffer();
        if (l - amount < buffer) revert BelowLiquidityBuffer(l - amount, buffer);
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
        // Interest first makes good any earlier loss to savers' principal.
        uint256 cover = interestPart < uncovered ? interestPart : uncovered;
        if (cover > 0) {
            uncovered -= cover;
            emit LossCovered(msg.sender, cover);
        }
        uint256 rest = interestPart - cover;
        uint256 toReserve = (rest * reserveBps) / BPS;
        uint256 fee = (rest * feeBps) / BPS;
        reserve += toReserve;
        _addYield(rest - toReserve - fee);
        emit Repaid(principalPart, interestPart, toReserve);
        if (fee > 0) {
            emit FeePaid(feeRecipient, fee);
            musd.safeTransfer(feeRecipient, fee);
        }
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
        uncovered += amount - fromReserve;
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

    /// @notice MUSD the vault can pull in a withdrawal right now: liquid
    ///         principal plus the reserve still held here, never yield owed to
    ///         the vault and never more than principal. A withdrawal of up to
    ///         this amount always succeeds; one above it reverts.
    function withdrawable() public view returns (uint256) {
        uint256 free = _free();
        return free < principal ? free : principal;
    }

    /// @notice Reserve MUSD held here rather than lent to leaving savers.
    function reserveHeld() public view returns (uint256) {
        uint256 free = _free();
        return free < reserve ? free : reserve;
    }

    /// @notice Liquid principal below which new borrowing pauses.
    function liquidityBuffer() public view returns (uint256) {
        return (principal * minLiquidBps) / BPS;
    }

    /// @notice True while liquid principal is at or above the buffer.
    function liquidityHealthy() public view returns (bool) {
        return liquid() >= liquidityBuffer();
    }

    /// @notice Interest booked but not yet released to the vault.
    function unreleased() public view returns (uint256) {
        uint256 elapsed = block.timestamp - dripAt;
        if (elapsed >= DRIP) return 0;
        return (dripLeft * (DRIP - elapsed)) / DRIP;
    }

    /// @notice Most principal that may be lent at once.
    function lendable() public view returns (uint256) {
        return (principal * maxLentBps) / BPS;
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    /// @notice Wires the market. It can only be replaced while nothing is lent.
    function setMarket(address _market) external onlyAdmin {
        if (market != address(0) && lent != 0) revert MarketAlreadySet();
        market = _market;
        emit MarketSet(_market);
    }

    /// @notice Proposes a new cap and reserve share, keeping the buffer and
    ///         fee as they are. Lowering the cap raises the rate, so this
    ///         waits the market's config delay like any other rate change.
    function proposeParams(uint256 _maxLentBps, uint256 _reserveBps) external onlyAdmin {
        _propose(_maxLentBps, _reserveBps, minLiquidBps, feeBps, feeRecipient);
    }

    /// @notice Proposes every parameter: the cap, the reserve share, the
    ///         liquidity buffer, and the protocol fee and who receives it.
    function proposeParams(
        uint256 _maxLentBps,
        uint256 _reserveBps,
        uint256 _minLiquidBps,
        uint256 _feeBps,
        address _feeRecipient
    ) external onlyAdmin {
        _propose(_maxLentBps, _reserveBps, _minLiquidBps, _feeBps, _feeRecipient);
    }

    /// @notice Anyone may apply proposed parameters once the delay has passed.
    function applyParams() external {
        if (paramsEta == 0) revert NothingPending();
        if (block.timestamp < paramsEta) revert TooEarly(paramsEta);
        paramsEta = 0;
        _accrueMarket();
        _setParams(pendingMaxLentBps, pendingReserveBps, pendingMinLiquidBps, pendingFeeBps, pendingFeeRecipient);
    }

    /// @notice Limits new deposits. Instant, because it can only stop money
    ///         coming in; it never moves the rate or touches open loans.
    function setPrincipalCap(uint256 cap) external onlyAdmin {
        principalCap = cap;
        emit PrincipalCapSet(cap);
    }

    function cancelParams() external onlyAdmin {
        paramsEta = 0;
        emit ParamsCancelled();
    }

    /// @notice Pays part of the reserve out to savers as yield. Only reserve
    ///         held here can be released, so yield owed is always on hand.
    function releaseReserve(uint256 amount) external onlyAdmin {
        uint256 held = reserveHeld();
        if (amount > held) revert ReserveNotHeld(amount, held);
        reserve -= amount;
        _addYield(amount);
        emit ReserveReleased(amount);
    }

    /// @notice Anyone may make good an uncovered loss with their own MUSD.
    function coverLoss(uint256 amount) external {
        if (amount > uncovered) amount = uncovered;
        uncovered -= amount;
        emit LossCovered(msg.sender, amount);
        musd.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice After migration, sends what is left (the reserve and yield not
    ///         yet released) to governance, to pass on to savers. The vault
    ///         stops claiming from a strategy it has moved away from.
    function sweep() external onlyAdmin {
        if (principal != 0 || lent != 0) revert StillActive();
        uint256 bal = musd.balanceOf(address(this));
        reserve = 0;
        yieldOwed = 0;
        dripLeft = 0;
        emit Swept(msg.sender, bal);
        musd.safeTransfer(msg.sender, bal);
    }

    function _addYield(uint256 amount) private {
        if (amount == 0) return;
        dripLeft = unreleased() + amount;
        dripAt = block.timestamp;
        yieldOwed += amount;
    }

    function _checkCap() private view {
        if (principalCap != 0 && principal > principalCap) {
            revert PrincipalCapReached(principal, principalCap);
        }
    }

    function _accrueMarket() private {
        if (market != address(0)) IKeelMarket(market).accrue();
    }

    /// @dev MUSD here that is not yield owed to the vault.
    function _free() private view returns (uint256) {
        uint256 bal = musd.balanceOf(address(this));
        return bal > yieldOwed ? bal - yieldOwed : 0;
    }

    function _propose(
        uint256 _maxLentBps,
        uint256 _reserveBps,
        uint256 _minLiquidBps,
        uint256 _feeBps,
        address _feeRecipient
    ) private {
        _check(_maxLentBps, _reserveBps, _minLiquidBps, _feeBps, _feeRecipient);
        uint256 delay = market == address(0) ? 0 : IKeelMarket(market).configDelay();
        pendingMaxLentBps = _maxLentBps;
        pendingReserveBps = _reserveBps;
        pendingMinLiquidBps = _minLiquidBps;
        pendingFeeBps = _feeBps;
        pendingFeeRecipient = _feeRecipient;
        paramsEta = block.timestamp + delay;
        emit ParamsProposed(_maxLentBps, _reserveBps, paramsEta);
        emit BufferAndFeeProposed(_minLiquidBps, _feeBps, _feeRecipient, paramsEta);
    }

    function _check(
        uint256 _maxLentBps,
        uint256 _reserveBps,
        uint256 _minLiquidBps,
        uint256 _feeBps,
        address _feeRecipient
    ) private pure {
        if (
            _maxLentBps > MAX_LENT_CEILING_BPS ||
            _feeBps > MAX_FEE_BPS ||
            _reserveBps + _feeBps > BPS ||
            _minLiquidBps > BPS ||
            (_feeBps != 0 && _feeRecipient == address(0))
        ) revert BadParams();
    }

    function _setParams(
        uint256 _maxLentBps,
        uint256 _reserveBps,
        uint256 _minLiquidBps,
        uint256 _feeBps,
        address _feeRecipient
    ) private {
        _check(_maxLentBps, _reserveBps, _minLiquidBps, _feeBps, _feeRecipient);
        maxLentBps = _maxLentBps;
        reserveBps = _reserveBps;
        minLiquidBps = _minLiquidBps;
        feeBps = _feeBps;
        feeRecipient = _feeRecipient;
        emit ParamsSet(_maxLentBps, _reserveBps);
        emit BufferAndFeeSet(_minLiquidBps, _feeBps, _feeRecipient);
    }
}
