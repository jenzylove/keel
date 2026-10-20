// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC20 { function balanceOf(address) external view returns (uint256); function transfer(address,uint256) external returns (bool); function transferFrom(address,address,uint256) external returns (bool); function approve(address,uint256) external returns (bool); }
interface ISMUSD { function owner() external view returns (address); function strategy() external view returns (address); function setStrategy(address) external; function deposit(uint256) external; function withdraw(uint256) external; function receiveYieldFromStrategy() external; function claimableYield(address) external view returns (uint256); function totalSupply() external view returns (uint256); function balanceOf(address) external view returns (uint256); }
interface Vm { function prank(address) external; function startPrank(address) external; function stopPrank() external; function createSelectFork(string calldata) external returns (uint256); function deal(address,uint256) external; }

/// Minimal strategy matching IVaultStrategy: holds principal, can return yield.
contract SpikeStrategy {
    IERC20 public immutable token; address public immutable vault; uint256 public principal; uint256 public yieldBuffer;
    constructor(address t, address v) { token = IERC20(t); vault = v; }
    modifier onlyVault() { require(msg.sender == vault, "vault"); _; }
    function allocate(uint256 a) external onlyVault { token.transferFrom(vault, address(this), a); principal += a; }
    function deallocate(uint256 a) external onlyVault { principal -= a; token.transfer(vault, a); }
    function claimYield() external returns (uint256 a) { a = yieldBuffer; if (a > 0) { yieldBuffer = 0; token.transfer(vault, a); } }
    function migrate(address n) external onlyVault returns (uint256 a) { a = principal; principal = 0; token.transfer(n, a); }
    function onMigrated(uint256 a) external onlyVault { principal += a; }
    function addYield(uint256 a) external { token.transferFrom(msg.sender, address(this), a); yieldBuffer += a; }
}

contract MigrateSpike {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    ISMUSD constant S = ISMUSD(0xb4D498029af77680cD1eF828b967f010d06C51CC);
    IERC20 constant MUSD = IERC20(0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186);
    address constant IDLE = 0x0C0944713c185ea3e64F5609ECee3fB3C054a295;
    address constant SP = 0x73245Eff485aB3AAc1158B3c4d8f4b23797B0e32; // a large MUSD holder to fund the test user

    event log_named_uint(string, uint256); event log_named_address(string, address);

    function test_migrate_idle_to_strategy() external {
        vm.createSelectFork("mezo");
        address owner = S.owner(); emit log_named_address("sMUSD owner", owner);
        require(S.strategy() == IDLE, "strategy is not IdleStrategy");
        uint256 idleBal = MUSD.balanceOf(IDLE); emit log_named_uint("idle MUSD", idleBal / 1e18);

        SpikeStrategy k = new SpikeStrategy(address(MUSD), address(S));
        vm.prank(owner); S.setStrategy(address(k));
        require(S.strategy() == address(k), "not switched");
        require(MUSD.balanceOf(address(k)) == idleBal && k.principal() == idleBal, "principal not migrated");
        emit log_named_uint("migrated into strategy", k.principal() / 1e18);

        // A saver deposits, the strategy earns yield, the saver claims it and withdraws.
        address saver = address(0xBEEF);
        vm.prank(SP); MUSD.transfer(saver, 1_000e18);
        vm.startPrank(saver); MUSD.approve(address(S), 1_000e18); S.deposit(1_000e18); vm.stopPrank();
        vm.prank(SP); MUSD.transfer(address(this), 10_000e18);
        MUSD.approve(address(k), 10_000e18); k.addYield(10_000e18);
        S.receiveYieldFromStrategy();
        uint256 before = MUSD.balanceOf(saver);
        vm.prank(saver); S.withdraw(1_000e18);
        uint256 got = MUSD.balanceOf(saver) - before;
        emit log_named_uint("saver received principal+yield (wei)", got);
        require(got > 1_000e18, "no yield reached saver");
        emit log_named_uint("saver yield share (wei)", got - 1_000e18);
    }
}
