// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {KeelMath} from "./libraries/KeelMath.sol";
import {KeelStrategy} from "./KeelStrategy.sol";
import {IVeBTC, IVoter, IPriceFeed} from "./interfaces/IMezo.sol";
import {IPegOracle} from "./oracles/PegOracles.sol";

/// @title KeelMarket
/// @notice Lends MUSD from KeelStrategy against BTC or a veBTC NFT. Loans live
///         here, not in Mezo's TroveManager, so MUSD redemptions can't touch
///         them. A veBTC borrower keeps voting with their NFT and keeps its
///         rewards.
/// @dev One loan holds either BTC or one veBTC NFT. BTC price comes from the
///      MUSD system's PriceFeed. The rate adds a peg premium that moves in
///      bounded steps toward a target set by MUSD's time-weighted price in a
///      Mezo pool.
///
///      Governance is the savings vault's owner (via KeelStrategy). Risk,
///      rates, peg settings, the oracle and the minimum loan only change after
///      `configDelay`, so borrowers can repay or add collateral before a
///      tighter setting applies. The borrowing throttle is instant because it
///      can only pause new borrowing.
contract KeelMarket is ReentrancyGuard, IERC721Receiver {
    using SafeERC20 for IERC20;

    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 10_000;

    enum Kind {
        None,
        Btc,
        Ve
    }

    struct Risk {
        uint16 maxLtvBps;
        uint16 liqLtvBps;
        uint16 bonusBps;
    }

    struct Loan {
        address owner;
        Kind kind;
        uint64 depositBlock;
        uint256 btc;
        uint256 nftId;
        uint256 principal;
        uint256 scaled;
    }

    struct RateParams {
        uint256 baseRate;
        uint256 slope1;
        uint256 slope2;
        uint256 kink;
    }

    struct PegParams {
        uint256 startBelow;
        uint256 fullAt;
        uint256 maxPremium;
        uint256 maxStep;
        uint256 interval;
    }

    /// @notice Everything that changes only after `configDelay`.
    struct Config {
        Risk[3] risks;
        RateParams rates;
        PegParams peg;
        IPegOracle pegOracle;
        uint256 minLoan;
    }

    IERC20 public immutable musd;
    IERC20 public immutable btc;
    IVeBTC public immutable ve;
    IVoter public immutable voter;
    IPriceFeed public immutable priceFeed;
    KeelStrategy public immutable strategy;
    /// @notice Wait between proposing and applying a config change.
    uint256 public immutable configDelay;

    Risk public btcRisk;
    Risk public veTimedRisk;
    Risk public vePermanentRisk;
    uint256 public minLoan;

    RateParams public rates;
    PegParams public peg;
    IPegOracle public pegOracle;
    uint256 public pegPremium;
    uint256 public lastPegStep;
    uint256 public lastMusdPrice;

    /// @notice Pool whose stable-side balance gates new borrowing (0 = off).
    address public watchPool;
    IERC20 public watchToken;
    uint256 public watchFloor;

    uint256 public borrowIndex = WAD;
    uint256 public lastAccrual;
    uint256 public lastBtcPrice;
    uint256 public totalPrincipal;
    uint256 public nextLoanId = 1;
    mapping(uint256 => Loan) public loans;

    Config internal pending;
    /// @notice When the pending config may be applied (0 = nothing pending).
    uint256 public pendingEta;

    event LoanOpened(uint256 indexed id, address indexed owner, Kind kind, uint256 btc, uint256 nftId);
    event Borrowed(uint256 indexed id, uint256 amount);
    event Repaid(uint256 indexed id, address payer, uint256 amount, uint256 interestPart);
    event CollateralAdded(uint256 indexed id, uint256 btc);
    event CollateralRemoved(uint256 indexed id, uint256 btc);
    event LoanClosed(uint256 indexed id);
    event Liquidated(uint256 indexed id, address liquidator, uint256 paid, uint256 seizedBtc, uint256 nftId, uint256 surplus, uint256 badDebt);
    event Voted(uint256 indexed id, uint256 nftId);
    event RewardsForwarded(uint256 indexed id, address token, uint256 amount);
    event PegStepped(uint256 musdPrice, uint256 target, uint256 premium);
    event ConfigProposed(uint256 eta);
    event ConfigApplied();
    event ConfigCancelled();

    error OnlyAdmin();
    error NotLoanOwner();
    error WrongKind();
    error NotNormalLock();
    error EmptyLock();
    error BelowMinLoan(uint256 debt, uint256 min);
    error OverBorrowLimit(uint256 debt, uint256 limit);
    error BorrowingPaused();
    error StillHealthy();
    error DebtOutstanding(uint256 debt);
    error SameBlockAsDeposit();
    error PegStepTooSoon(uint256 nextAt);
    error BadParams();
    error NotVeBTC();
    error NoDebt();
    error PriceAboveMax(uint256 price, uint256 max);
    error NothingPending();
    error TooEarly(uint256 eta);
    error RateTooHigh();

    modifier onlyAdmin() {
        if (msg.sender != admin()) revert OnlyAdmin();
        _;
    }

    /// @notice The savings vault's owner, read through the strategy.
    function admin() public view returns (address) {
        return strategy.admin();
    }

    modifier onlyLoanOwner(uint256 id) {
        if (loans[id].owner != msg.sender) revert NotLoanOwner();
        _;
    }

    struct Deps {
        IERC20 musd;
        IERC20 btc;
        IVeBTC ve;
        IVoter voter;
        IPriceFeed priceFeed;
        IPegOracle pegOracle;
        KeelStrategy strategy;
    }

    constructor(Deps memory d, Config memory c, uint256 _configDelay) {
        musd = d.musd;
        btc = d.btc;
        ve = d.ve;
        voter = d.voter;
        priceFeed = d.priceFeed;
        strategy = d.strategy;
        configDelay = _configDelay;
        _setConfig(c);
        lastAccrual = block.timestamp;
    }

    // ---------------------------------------------------------------------
    // Opening loans
    // ---------------------------------------------------------------------

    /// @notice Deposits BTC and optionally borrows MUSD in one call.
    function openWithBtc(
        uint256 btcAmount,
        uint256 borrowAmount
    ) external nonReentrant returns (uint256 id) {
        _accrue();
        id = nextLoanId++;
        loans[id] = Loan(msg.sender, Kind.Btc, uint64(block.number), btcAmount, 0, 0, 0);
        btc.safeTransferFrom(msg.sender, address(this), btcAmount);
        emit LoanOpened(id, msg.sender, Kind.Btc, btcAmount, 0);
        if (borrowAmount > 0) _borrow(id, borrowAmount);
    }

    /// @notice Deposits a veBTC NFT and optionally borrows MUSD in one call.
    /// @dev The caller must own the NFT or be approved for it.
    function openWithVeBTC(
        uint256 nftId,
        uint256 borrowAmount
    ) external nonReentrant returns (uint256 id) {
        if (ve.escrowType(nftId) != 0) revert NotNormalLock();
        if (ve.locked(nftId).amount <= 0) revert EmptyLock();
        _accrue();
        id = nextLoanId++;
        loans[id] = Loan(msg.sender, Kind.Ve, uint64(block.number), 0, nftId, 0, 0);
        ve.transferFrom(msg.sender, address(this), nftId);
        emit LoanOpened(id, msg.sender, Kind.Ve, 0, nftId);
        if (borrowAmount > 0) _borrow(id, borrowAmount);
    }

    // ---------------------------------------------------------------------
    // Managing loans
    // ---------------------------------------------------------------------

    function borrow(uint256 id, uint256 amount) external nonReentrant onlyLoanOwner(id) {
        _accrue();
        _borrow(id, amount);
    }

    /// @notice Repays up to `amount` of a loan. Anyone can repay any loan.
    function repay(uint256 id, uint256 amount) external nonReentrant returns (uint256 paid) {
        _accrue();
        Loan storage loan = loans[id];
        uint256 debt = KeelMath.debtOf(loan.scaled, borrowIndex);
        if (debt == 0) revert NoDebt();
        paid = amount > debt ? debt : amount;
        uint256 left = debt - paid;
        if (left != 0 && left < minLoan) revert BelowMinLoan(left, minLoan);
        musd.safeTransferFrom(msg.sender, address(strategy), paid);
        _settle(id, paid, debt, false);
    }

    function addBtc(uint256 id, uint256 amount) external nonReentrant {
        Loan storage loan = loans[id];
        if (loan.kind != Kind.Btc) revert WrongKind();
        loan.btc += amount;
        btc.safeTransferFrom(msg.sender, address(this), amount);
        emit CollateralAdded(id, amount);
    }

    function removeBtc(uint256 id, uint256 amount) external nonReentrant onlyLoanOwner(id) {
        _accrue();
        Loan storage loan = loans[id];
        if (loan.kind != Kind.Btc) revert WrongKind();
        loan.btc -= amount;
        _checkBorrowLimit(id);
        btc.safeTransfer(msg.sender, amount);
        emit CollateralRemoved(id, amount);
    }

    /// @notice Returns the collateral of a fully repaid loan.
    function close(uint256 id) external nonReentrant onlyLoanOwner(id) {
        Loan memory loan = loans[id];
        if (loan.scaled != 0) {
            revert DebtOutstanding(KeelMath.debtOf(loan.scaled, borrowIndex));
        }
        delete loans[id];
        if (loan.kind == Kind.Btc && loan.btc > 0) {
            btc.safeTransfer(loan.owner, loan.btc);
        } else if (loan.kind == Kind.Ve) {
            _tryReset(loan.nftId);
            ve.transferFrom(address(this), loan.owner, loan.nftId);
        }
        emit LoanClosed(id);
    }

    // ---------------------------------------------------------------------
    // veBTC passthrough
    // ---------------------------------------------------------------------

    /// @notice Votes with the loan's NFT. Not allowed in the deposit block:
    ///         veBTC gives an NFT zero voting power in the block it moves.
    function vote(
        uint256 id,
        address[] calldata pools,
        uint256[] calldata weights
    ) external nonReentrant onlyLoanOwner(id) {
        Loan storage loan = loans[id];
        if (loan.kind != Kind.Ve) revert WrongKind();
        if (block.number <= loan.depositBlock) revert SameBlockAsDeposit();
        voter.vote(loan.nftId, pools, weights);
        emit Voted(id, loan.nftId);
    }

    function resetVotes(uint256 id) external nonReentrant onlyLoanOwner(id) {
        Loan storage loan = loans[id];
        if (loan.kind != Kind.Ve) revert WrongKind();
        voter.reset(loan.nftId);
    }

    /// @notice Claims the NFT's fees or bribes and forwards them to the
    ///         borrower. Rewards arrive here because this contract owns the NFT.
    function claimRewards(
        uint256 id,
        address[] calldata rewards,
        address[][] calldata tokens,
        bool bribes
    ) external nonReentrant onlyLoanOwner(id) {
        Loan storage loan = loans[id];
        if (loan.kind != Kind.Ve) revert WrongKind();

        uint256 n;
        for (uint256 i = 0; i < tokens.length; ++i) n += tokens[i].length;
        address[] memory flat = new address[](n);
        uint256[] memory before = new uint256[](n);
        n = 0;
        for (uint256 i = 0; i < tokens.length; ++i) {
            for (uint256 j = 0; j < tokens[i].length; ++j) {
                flat[n] = tokens[i][j];
                before[n] = IERC20(flat[n]).balanceOf(address(this));
                ++n;
            }
        }

        if (bribes) voter.claimBribes(rewards, tokens, loan.nftId);
        else voter.claimFees(rewards, tokens, loan.nftId);

        for (uint256 k = 0; k < n; ++k) {
            uint256 bal = IERC20(flat[k]).balanceOf(address(this));
            if (bal > before[k]) {
                uint256 gained = bal - before[k];
                // Mark the gain as forwarded so a repeated token isn't paid twice.
                for (uint256 m = k + 1; m < n; ++m) {
                    if (flat[m] == flat[k]) before[m] += gained;
                }
                IERC20(flat[k]).safeTransfer(loan.owner, gained);
                emit RewardsForwarded(id, flat[k], gained);
            }
        }
    }

    /// @notice Extends a timed lock, which keeps the collateral locked longer.
    function extendLock(uint256 id, uint256 duration) external nonReentrant onlyLoanOwner(id) {
        Loan storage loan = loans[id];
        if (loan.kind != Kind.Ve) revert WrongKind();
        ve.increaseUnlockTime(loan.nftId, duration);
    }

    // ---------------------------------------------------------------------
    // Liquidation
    // ---------------------------------------------------------------------

    /// @notice Liquidates an unhealthy loan.
    /// @dev BTC loans: repay up to `maxRepay` and receive BTC worth the repaid
    ///      amount plus the bonus. veBTC loans: pay the NFT's value less the
    ///      bonus, at most `maxRepay`, and receive the NFT; anything above the
    ///      debt goes to the borrower. Unrecoverable principal is written off
    ///      in the strategy.
    function liquidate(uint256 id, uint256 maxRepay) external nonReentrant {
        _accrue();
        uint256 price = _btcPrice();
        Loan storage loan = loans[id];
        uint256 debt = KeelMath.debtOf(loan.scaled, borrowIndex);
        (uint256 val, Risk memory r) = _valueAndRisk(loan, price);
        if (debt == 0 || !KeelMath.isLiquidatable(val, debt, r.liqLtvBps)) {
            revert StillHealthy();
        }

        if (loan.kind == Kind.Btc) {
            uint256 pay = maxRepay > debt ? debt : maxRepay;
            uint256 seized = KeelMath.seizeFor(pay, price, r.bonusBps, loan.btc);
            // Taking all the BTC without clearing the debt means the rest is
            // written off, so the payment can't count as interest.
            bool shortfall = seized == loan.btc && pay < debt;
            loan.btc -= seized;
            musd.safeTransferFrom(msg.sender, address(strategy), pay);
            _settle(id, pay, debt, shortfall);
            uint256 lost;
            if (loan.btc == 0 && loan.scaled != 0) lost = _writeOff(id);
            btc.safeTransfer(msg.sender, seized);
            emit Liquidated(id, msg.sender, pay, seized, 0, 0, lost);
        } else {
            uint256 sale = KeelMath.salePrice(val, r.bonusBps);
            if (sale > maxRepay) revert PriceAboveMax(sale, maxRepay);
            address owner = loan.owner;
            uint256 nftId = loan.nftId;
            uint256 toDebt = sale > debt ? debt : sale;
            uint256 surplus = sale - toDebt;
            musd.safeTransferFrom(msg.sender, address(strategy), toDebt);
            _settle(id, toDebt, debt, sale < debt);
            uint256 lost;
            if (loan.scaled != 0) lost = _writeOff(id);
            if (surplus > 0) musd.safeTransferFrom(msg.sender, owner, surplus);
            delete loans[id];
            // Transfer works even if the NFT voted this epoch, when Mezo
            // refuses a reset; the new owner can reset from the next epoch.
            _tryReset(nftId);
            ve.transferFrom(address(this), msg.sender, nftId);
            emit Liquidated(id, msg.sender, sale, 0, nftId, surplus, lost);
        }
    }

    // ---------------------------------------------------------------------
    // Peg premium
    // ---------------------------------------------------------------------

    /// @notice Steps the peg premium toward its target. Anyone may call it
    ///         once per interval.
    /// @dev If the oracle can't produce a price the call reverts and the
    ///      premium keeps its last value.
    function stepPeg() external nonReentrant {
        uint256 nextAt = lastPegStep + peg.interval;
        if (block.timestamp < nextAt) revert PegStepTooSoon(nextAt);
        uint256 p = pegOracle.musdPrice();
        if (p == 0) revert BadParams();
        _accrue();
        uint256 target = KeelMath.pegTarget(p, peg.startBelow, peg.fullAt, peg.maxPremium);
        pegPremium = KeelMath.stepToward(pegPremium, target, peg.maxStep);
        lastPegStep = block.timestamp;
        lastMusdPrice = p;
        emit PegStepped(p, target, pegPremium);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function currentRate() public view returns (uint256) {
        uint256 u = KeelMath.utilisation(strategy.lent(), strategy.lendable());
        return KeelMath.borrowRate(u, rates.baseRate, rates.slope1, rates.slope2, rates.kink, pegPremium);
    }

    /// @notice What savers earn on the whole vault from current borrowing.
    function saverRate() external view returns (uint256) {
        uint256 p = strategy.principal();
        if (p == 0) return 0;
        uint256 keep = BPS - strategy.reserveBps();
        return (currentRate() * strategy.lent() * keep) / (p * BPS);
    }

    function indexNow() public view returns (uint256) {
        return KeelMath.accrueIndex(borrowIndex, currentRate(), block.timestamp - lastAccrual);
    }

    function debtOf(uint256 id) public view returns (uint256) {
        return KeelMath.debtOf(loans[id].scaled, indexNow());
    }

    /// @notice Collateral value, debt and health at the last stored BTC price.
    function position(
        uint256 id
    ) external view returns (uint256 collateralValue, uint256 debt, uint256 healthWad, uint256 borrowLimit) {
        return positionAt(id, lastBtcPrice);
    }

    /// @notice The same at a BTC price the caller supplies, e.g. a fresh read
    ///         of the PriceFeed, so keepers don't judge health on a stale price.
    function positionAt(
        uint256 id,
        uint256 price
    ) public view returns (uint256 collateralValue, uint256 debt, uint256 healthWad, uint256 borrowLimit) {
        Loan storage loan = loans[id];
        (uint256 val, Risk memory r) = _valueAndRisk(loan, price);
        debt = debtOf(id);
        collateralValue = val;
        healthWad = KeelMath.health(val, debt, r.liqLtvBps);
        borrowLimit = KeelMath.maxBorrow(val, r.maxLtvBps);
    }

    function borrowingOpen() public view returns (bool) {
        if (watchPool == address(0)) return true;
        return watchToken.balanceOf(watchPool) >= watchFloor;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external view returns (bytes4) {
        if (msg.sender != address(ve)) revert NotVeBTC();
        return IERC721Receiver.onERC721Received.selector;
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    /// @notice Queues a new config. It can be applied after `configDelay`.
    function proposeConfig(Config calldata c) external onlyAdmin {
        _validate(c);
        pending = c;
        pendingEta = block.timestamp + configDelay;
        emit ConfigProposed(pendingEta);
    }

    /// @notice Applies the queued config once its delay has passed. Anyone may
    ///         call it.
    function applyConfig() external nonReentrant {
        if (pendingEta == 0) revert NothingPending();
        if (block.timestamp < pendingEta) revert TooEarly(pendingEta);
        _accrue();
        _setConfig(pending);
        pendingEta = 0;
        emit ConfigApplied();
    }

    function cancelConfig() external onlyAdmin {
        pendingEta = 0;
        emit ConfigCancelled();
    }

    function pendingConfig() external view returns (Config memory) {
        return pending;
    }

    function setThrottle(address pool, IERC20 token, uint256 floor) external onlyAdmin {
        watchPool = pool;
        watchToken = token;
        watchFloor = floor;
    }

    /// @notice Refreshes the stored BTC price used by views.
    function pokePrice() external returns (uint256) {
        return _btcPrice();
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    /// @notice Brings interest up to date. The strategy calls this before
    ///         principal or the cap changes, since both move the rate.
    function accrue() external nonReentrant {
        _accrue();
    }

    /// @dev Clears the NFT's votes before it leaves, where Mezo allows it.
    function _tryReset(uint256 nftId) internal {
        try voter.reset(nftId) {} catch {}
    }

    function _accrue() internal {
        uint256 elapsed = block.timestamp - lastAccrual;
        if (elapsed == 0) return;
        borrowIndex = KeelMath.accrueIndex(borrowIndex, currentRate(), elapsed);
        lastAccrual = block.timestamp;
    }

    function _borrow(uint256 id, uint256 amount) internal {
        if (!borrowingOpen()) revert BorrowingPaused();
        Loan storage loan = loans[id];
        loan.scaled += KeelMath.scaledUp(amount, borrowIndex);
        loan.principal += amount;
        totalPrincipal += amount;
        uint256 debt = KeelMath.debtOf(loan.scaled, borrowIndex);
        if (debt < minLoan) revert BelowMinLoan(debt, minLoan);
        _checkBorrowLimit(id);
        strategy.draw(loan.owner, amount);
        emit Borrowed(id, amount);
    }

    function _checkBorrowLimit(uint256 id) internal {
        Loan storage loan = loans[id];
        if (loan.scaled == 0) return;
        (uint256 val, Risk memory r) = _valueAndRisk(loan, _btcPrice());
        uint256 debt = KeelMath.debtOf(loan.scaled, borrowIndex);
        uint256 limit = KeelMath.maxBorrow(val, r.maxLtvBps);
        if (debt > limit) revert OverBorrowLimit(debt, limit);
    }

    /// @dev Applies `paid` MUSD (already sent to the strategy) to a loan whose
    ///      debt was `debt`. Interest is paid before principal, unless the loan
    ///      is about to be written off: then principal comes first, so savers
    ///      aren't paid yield on interest that was never collected.
    function _settle(uint256 id, uint256 paid, uint256 debt, bool principalFirst) internal {
        if (paid == 0) return;
        Loan storage loan = loans[id];
        uint256 interestPart;
        uint256 principalPart;
        if (principalFirst) {
            principalPart = paid > loan.principal ? loan.principal : paid;
            interestPart = paid - principalPart;
        } else {
            uint256 interest = debt > loan.principal ? debt - loan.principal : 0;
            interestPart = paid > interest ? interest : paid;
            principalPart = paid - interestPart;
        }
        if (paid == debt) {
            loan.scaled = 0;
        } else {
            uint256 s = KeelMath.scaledDown(paid, borrowIndex);
            loan.scaled = s > loan.scaled ? 0 : loan.scaled - s;
        }
        loan.principal -= principalPart;
        totalPrincipal -= principalPart;
        strategy.repaid(principalPart, interestPart);
        emit Repaid(id, msg.sender, paid, interestPart);
    }

    function _writeOff(uint256 id) internal returns (uint256 lost) {
        Loan storage loan = loans[id];
        lost = loan.principal;
        totalPrincipal -= lost;
        loan.principal = 0;
        loan.scaled = 0;
        if (lost > 0) strategy.writeOff(lost);
    }

    function _valueAndRisk(
        Loan storage loan,
        uint256 price
    ) internal view returns (uint256 val, Risk memory r) {
        if (loan.kind == Kind.Btc) {
            return (KeelMath.value(loan.btc, price), btcRisk);
        }
        if (loan.kind == Kind.Ve) {
            IVeBTC.LockedBalance memory l = ve.locked(loan.nftId);
            uint256 amount = l.amount > 0 ? uint256(int256(l.amount)) : 0;
            return (KeelMath.value(amount, price), l.isPermanent ? vePermanentRisk : veTimedRisk);
        }
        return (0, btcRisk);
    }

    function _btcPrice() internal returns (uint256 p) {
        p = priceFeed.fetchPrice();
        lastBtcPrice = p;
    }

    /// @dev Highest yearly rate the curve may reach before the peg premium.
    uint256 internal constant MAX_CURVE_RATE = 1e18;

    function _validate(Config memory c) internal pure {
        for (uint256 i = 0; i < 3; ++i) {
            Risk memory r = c.risks[i];
            if (r.maxLtvBps >= r.liqLtvBps || r.liqLtvBps >= BPS || r.bonusBps >= BPS - r.liqLtvBps) {
                revert BadParams();
            }
        }
        if (c.rates.kink > WAD) revert BadParams();
        if (c.rates.baseRate + c.rates.slope1 + c.rates.slope2 > MAX_CURVE_RATE) revert RateTooHigh();
        if (c.peg.fullAt >= c.peg.startBelow || c.peg.startBelow > WAD || c.peg.maxPremium > MAX_CURVE_RATE) {
            revert BadParams();
        }
        if (address(c.pegOracle) == address(0)) revert BadParams();
    }

    function _setConfig(Config memory c) internal {
        _validate(c);
        btcRisk = c.risks[0];
        veTimedRisk = c.risks[1];
        vePermanentRisk = c.risks[2];
        rates = c.rates;
        peg = c.peg;
        pegOracle = c.pegOracle;
        minLoan = c.minLoan;
    }
}
