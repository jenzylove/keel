// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice MUSD's dollar price, 18 decimals. Reverts if it can't be read.
interface IPegOracle {
    function musdPrice() external view returns (uint256);
}

interface IERC20Decimals {
    function decimals() external view returns (uint8);
}

interface IClPool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s);
}

interface IBasicPool {
    function quote(address tokenIn, uint256 amountIn, uint256 granularity) external view returns (uint256);
}

/// @title ClPoolTwapPegOracle
/// @notice MUSD price from the time-weighted average tick of a Mezo
///         concentrated-liquidity pool pairing MUSD with a dollar stablecoin.
///         On mainnet this is the mUSDC/MUSD pool that holds Mezo's peg wall.
contract ClPoolTwapPegOracle is IPegOracle {
    IClPool public immutable pool;
    address public immutable musd;
    uint32 public immutable window;
    bool internal immutable musdIsToken0;
    int256 internal immutable decimalsShift; // decimals(MUSD) - decimals(stable)

    error BadPool();

    constructor(IClPool _pool, address _musd, uint32 _window) {
        pool = _pool;
        musd = _musd;
        window = _window;
        address t0 = _pool.token0();
        address t1 = _pool.token1();
        if (t0 != _musd && t1 != _musd) revert BadPool();
        musdIsToken0 = t0 == _musd;
        address stable = musdIsToken0 ? t1 : t0;
        decimalsShift = int256(uint256(IERC20Decimals(_musd).decimals())) - int256(uint256(IERC20Decimals(stable).decimals()));
    }

    function musdPrice() external view returns (uint256) {
        uint32[] memory ago = new uint32[](2);
        ago[0] = window;
        ago[1] = 0;
        (int56[] memory cum, ) = pool.observe(ago);
        int256 tick = int256(cum[1] - cum[0]) / int256(uint256(window));
        // Price of token0 in token1, raw units: 1.0001^tick.
        uint256 p = _pow10001(tick); // WAD
        // Stablecoins per MUSD, in raw units, then scaled to 18 decimals.
        uint256 stablePerMusd = musdIsToken0 ? p : (1e36 / p);
        return decimalsShift >= 0
            ? stablePerMusd * 10 ** uint256(decimalsShift)
            : stablePerMusd / 10 ** uint256(-decimalsShift);
    }

    /// @dev 1.0001^tick in WAD by binary exponentiation. Ticks near stable
    ///      pairs are small after the decimals shift is applied separately,
    ///      but the raw tick here includes it, so the full range is handled.
    function _pow10001(int256 tick) internal pure returns (uint256 r) {
        uint256 absTick = tick < 0 ? uint256(-tick) : uint256(tick);
        uint256 base = 1.0001e18;
        r = 1e18;
        while (absTick > 0) {
            if (absTick & 1 == 1) r = (r * base) / 1e18;
            base = (base * base) / 1e18;
            absTick >>= 1;
        }
        if (tick < 0) r = 1e36 / r;
    }
}

/// @title BasicPoolTwapPegOracle
/// @notice MUSD price from a Mezo basic (Aerodrome-style) pool's
///         time-weighted `quote`, averaged over `granularity` observations
///         (about 30 minutes each).
contract BasicPoolTwapPegOracle is IPegOracle {
    IBasicPool public immutable pool;
    address public immutable musd;
    uint256 public immutable granularity;
    uint256 internal immutable scale;

    constructor(IBasicPool _pool, address _musd, address _stable, uint256 _granularity) {
        pool = _pool;
        musd = _musd;
        granularity = _granularity;
        scale = 10 ** (18 - uint256(IERC20Decimals(_stable).decimals()));
    }

    function musdPrice() external view returns (uint256) {
        return pool.quote(musd, 1e18, granularity) * scale;
    }
}
