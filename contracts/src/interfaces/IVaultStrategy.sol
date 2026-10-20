// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice The strategy interface of Mezo's MUSD Savings Rate vault (sMUSD),
///         copied from the verified MUSDSavingsRate source on Mezo mainnet.
interface IVaultStrategy {
    event Allocate(uint256 amount);
    event Deallocate(uint256 amount);
    event Migrated(address newStrategy, uint256 amount);

    /// @notice Pulls `amount` of principal from the vault.
    function allocate(uint256 amount) external;

    /// @notice Sends `amount` of principal back to the vault, in the same
    ///         transaction as a saver's withdrawal.
    function deallocate(uint256 amount) external;

    /// @notice Sends earned yield to the vault and returns the amount.
    function claimYield() external returns (uint256 amount);

    /// @notice Sends all principal to `newStrategy` and returns the amount.
    function migrate(address newStrategy) external returns (uint256 amount);

    /// @notice Bookkeeping hook after principal arrives from the old strategy.
    function onMigrated(uint256 amount) external;
}
