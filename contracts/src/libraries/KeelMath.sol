// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title KeelMath
/// @notice Pure maths for Keel: interest accrual, collateral health,
///         liquidation amounts and the interest-rate curve with its peg term.
/// @dev Amounts are 18-decimal fixed point (WAD) unless noted. Rates are
///      yearly, in WAD (0.05e18 = 5% a year). Ratios are in basis points.
library KeelMath {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 10_000;
    uint256 internal constant YEAR = 365 days;

    /// @notice Grows a borrow index by simple interest over `elapsed` seconds.
    /// @dev Compounds each time it is called, so frequent accrual compounds
    ///      more often. The index starts at WAD.
    function accrueIndex(
        uint256 index,
        uint256 yearlyRate,
        uint256 elapsed
    ) internal pure returns (uint256) {
        if (elapsed == 0 || yearlyRate == 0) return index;
        return index + (index * yearlyRate * elapsed) / (YEAR * WAD);
    }

    /// @notice Debt owed for a scaled balance at the current index, rounded up
    ///         so the protocol never undercounts what it is owed.
    function debtOf(
        uint256 scaled,
        uint256 index
    ) internal pure returns (uint256) {
        return _divUp(scaled * index, WAD);
    }

    /// @notice Scaled balance to add when lending `amount`, rounded up so new
    ///         debt is never undercounted.
    function scaledUp(
        uint256 amount,
        uint256 index
    ) internal pure returns (uint256) {
        return _divUp(amount * WAD, index);
    }

    /// @notice Scaled balance to remove when `amount` is repaid, rounded down so
    ///         a repayment never clears more than it pays for.
    function scaledDown(
        uint256 amount,
        uint256 index
    ) internal pure returns (uint256) {
        return (amount * WAD) / index;
    }

    /// @notice MUSD value of `btcAmount` BTC at `price` MUSD per BTC.
    function value(
        uint256 btcAmount,
        uint256 price
    ) internal pure returns (uint256) {
        return (btcAmount * price) / WAD;
    }

    /// @notice Most that can be borrowed against `collateralValue`.
    function maxBorrow(
        uint256 collateralValue,
        uint256 maxLtvBps
    ) internal pure returns (uint256) {
        return (collateralValue * maxLtvBps) / BPS;
    }

    /// @notice True once debt is above the liquidation threshold.
    function isLiquidatable(
        uint256 collateralValue,
        uint256 debt,
        uint256 liquidationLtvBps
    ) internal pure returns (bool) {
        return debt * BPS > collateralValue * liquidationLtvBps;
    }

    /// @notice Health factor in WAD: 1e18 means exactly at the liquidation
    ///         threshold, above is safe. Max uint when there is no debt.
    function health(
        uint256 collateralValue,
        uint256 debt,
        uint256 liquidationLtvBps
    ) internal pure returns (uint256) {
        if (debt == 0) return type(uint256).max;
        return (collateralValue * liquidationLtvBps * WAD) / (debt * BPS);
    }

    /// @notice Price a liquidator pays for a whole, indivisible collateral item
    ///         (a veBTC NFT): its value less the liquidation bonus.
    function salePrice(
        uint256 collateralValue,
        uint256 bonusBps
    ) internal pure returns (uint256) {
        return (collateralValue * (BPS - bonusBps)) / BPS;
    }

    /// @notice BTC a liquidator receives for repaying `repay` MUSD of debt on
    ///         fungible BTC collateral, including the bonus, capped at what the
    ///         loan holds.
    function seizeFor(
        uint256 repay,
        uint256 price,
        uint256 bonusBps,
        uint256 collateral
    ) internal pure returns (uint256) {
        uint256 seized = (repay * (BPS + bonusBps) * WAD) / (BPS * price);
        return seized > collateral ? collateral : seized;
    }

    /// @notice Utilisation in WAD: borrowed out of what may be lent.
    function utilisation(
        uint256 borrowed,
        uint256 lendable
    ) internal pure returns (uint256) {
        if (lendable == 0) return borrowed == 0 ? 0 : WAD;
        uint256 u = (borrowed * WAD) / lendable;
        return u > WAD ? WAD : u;
    }

    /// @notice Kinked utilisation curve plus the peg premium.
    function borrowRate(
        uint256 u,
        uint256 baseRate,
        uint256 slope1,
        uint256 slope2,
        uint256 kink,
        uint256 pegPremium
    ) internal pure returns (uint256 rate) {
        rate = baseRate + pegPremium;
        if (u <= kink) {
            rate += (slope1 * u) / WAD;
        } else {
            rate += slope1 * kink / WAD + (slope2 * (u - kink)) / WAD;
        }
    }

    /// @notice Peg premium the rate should move toward for an MUSD price.
    /// @dev Zero at or above `startBelow`, rising linearly to `maxPremium` at
    ///      or below `fullAt`. Paying more to borrow and to save while MUSD is
    ///      cheap pulls in repayments and rewards holding MUSD.
    function pegTarget(
        uint256 musdPrice,
        uint256 startBelow,
        uint256 fullAt,
        uint256 maxPremium
    ) internal pure returns (uint256) {
        if (musdPrice >= startBelow) return 0;
        if (musdPrice <= fullAt) return maxPremium;
        return (maxPremium * (startBelow - musdPrice)) / (startBelow - fullAt);
    }

    /// @notice Moves `current` toward `target` by at most `maxStep`.
    function stepToward(
        uint256 current,
        uint256 target,
        uint256 maxStep
    ) internal pure returns (uint256) {
        if (target > current) {
            return target - current > maxStep ? current + maxStep : target;
        }
        return current - target > maxStep ? current - maxStep : target;
    }

    function _divUp(uint256 a, uint256 b) private pure returns (uint256) {
        return a == 0 ? 0 : (a - 1) / b + 1;
    }
}
