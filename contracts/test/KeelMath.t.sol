// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "./utils/Test.sol";
import {KeelMath} from "../src/libraries/KeelMath.sol";

contract KeelMathTest is Test {
    uint256 constant WAD = 1e18;

    function test_accrue_one_year_at_5pct() external pure {
        uint256 idx = KeelMath.accrueIndex(WAD, 0.05e18, 365 days);
        assertEq(idx, 1.05e18, "index after a year");
    }

    function test_debt_rounds_up_and_repay_rounds_down() external pure {
        uint256 index = 1.000000000000000001e18;
        uint256 scaled = KeelMath.scaledUp(100e18, index);
        assertGe(KeelMath.debtOf(scaled, index), 100e18, "debt never undercounted");
        assertLe(KeelMath.scaledDown(100e18, index), scaled, "repay never over-clears");
    }

    function test_health_threshold() external pure {
        // 1 BTC at 80k MUSD, liquidation at 65% -> liquidatable above 52k debt.
        uint256 v = KeelMath.value(1e18, 80_000e18);
        assertTrue(!KeelMath.isLiquidatable(v, 52_000e18, 6500), "at threshold is safe");
        assertTrue(KeelMath.isLiquidatable(v, 52_000e18 + 1, 6500), "above threshold");
        assertEq(KeelMath.health(v, 52_000e18, 6500), WAD, "health 1.0 at threshold");
    }

    function test_sale_price_and_seize() external pure {
        assertEq(KeelMath.salePrice(100e18, 800), 92e18, "8% discount");
        // Repay 1,000 MUSD at 50k/BTC with 5% bonus -> 0.021 BTC.
        assertEq(KeelMath.seizeFor(1_000e18, 50_000e18, 500, 1e18), 0.021e18, "seize");
        assertEq(KeelMath.seizeFor(1_000e18, 50_000e18, 500, 0.01e18), 0.01e18, "capped");
    }

    function test_rate_curve_kink() external pure {
        uint256 r = KeelMath.borrowRate(0.8e18, 0.02e18, 0.05e18, 0.6e18, 0.8e18, 0);
        assertEq(r, 0.06e18, "at kink");
        r = KeelMath.borrowRate(0.9e18, 0.02e18, 0.05e18, 0.6e18, 0.8e18, 0.01e18);
        assertEq(r, 0.02e18 + 0.04e18 + 0.06e18 + 0.01e18, "past kink plus peg");
    }

    function test_peg_target_shape() external pure {
        assertEq(KeelMath.pegTarget(1e18, 0.995e18, 0.985e18, 0.04e18), 0, "at par");
        assertEq(KeelMath.pegTarget(0.995e18, 0.995e18, 0.985e18, 0.04e18), 0, "at start");
        assertEq(KeelMath.pegTarget(0.99e18, 0.995e18, 0.985e18, 0.04e18), 0.02e18, "halfway");
        assertEq(KeelMath.pegTarget(0.97e18, 0.995e18, 0.985e18, 0.04e18), 0.04e18, "capped");
    }

    function testFuzz_step_never_overshoots(uint256 cur, uint256 tgt, uint256 step) external pure {
        cur = bound(cur, 0, 1e18);
        tgt = bound(tgt, 0, 1e18);
        step = bound(step, 0, 1e18);
        uint256 next = KeelMath.stepToward(cur, tgt, step);
        uint256 moved = next > cur ? next - cur : cur - next;
        assertLe(moved, step, "moved more than a step");
        uint256 before = cur > tgt ? cur - tgt : tgt - cur;
        uint256 afterGap = next > tgt ? next - tgt : tgt - next;
        assertLe(afterGap, before, "moved away from target");
    }

    function testFuzz_scaled_round_trip(uint256 amount, uint256 index) external pure {
        amount = bound(amount, 1, 1e30);
        index = bound(index, WAD, 100 * WAD);
        uint256 scaled = KeelMath.scaledUp(amount, index);
        assertGe(KeelMath.debtOf(scaled, index), amount, "debt below amount lent");
        assertLe(KeelMath.debtOf(scaled, index), amount + 101, "debt rounding too large");
    }

    function testFuzz_seize_value_matches_bonus(uint256 repay, uint256 price) external pure {
        repay = bound(repay, 1e18, 1e27);
        price = bound(price, 1_000e18, 1_000_000e18);
        uint256 seized = KeelMath.seizeFor(repay, price, 500, type(uint256).max);
        uint256 got = KeelMath.value(seized, price);
        assertLe(got, (repay * 10_500) / 10_000, "liquidator overpaid");
        assertApproxEq(got, (repay * 10_500) / 10_000, price / 1e18 + 1, "bonus not paid");
    }

    function testFuzz_rate_monotonic_in_utilisation(uint256 a, uint256 b) external pure {
        a = bound(a, 0, WAD);
        b = bound(b, a, WAD);
        uint256 ra = KeelMath.borrowRate(a, 0.02e18, 0.05e18, 0.6e18, 0.8e18, 0);
        uint256 rb = KeelMath.borrowRate(b, 0.02e18, 0.05e18, 0.6e18, 0.8e18, 0);
        assertLe(ra, rb, "rate fell as utilisation rose");
    }
}
