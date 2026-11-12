import { parseAbi } from 'viem';

export const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
]);

export const vaultAbi = parseAbi([
  'function strategy() view returns (address)',
  'function deposit(uint256)',
  'function withdraw(uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function receiveYieldFromStrategy()',
]);

export const strategyAbi = parseAbi([
  'function principal() view returns (uint256)',
  'function lent() view returns (uint256)',
  'function liquid() view returns (uint256)',
  'function lendable() view returns (uint256)',
  'function reserve() view returns (uint256)',
  'function yieldOwed() view returns (uint256)',
  'function badDebt() view returns (uint256)',
  'function uncovered() view returns (uint256)',
  'function unreleased() view returns (uint256)',
  'function maxLentBps() view returns (uint256)',
  'function admin() view returns (address)',
  'function reserveBps() view returns (uint256)',
  'function withdrawable() view returns (uint256)',
  'function feeBps() view returns (uint256)',
  'function minLiquidBps() view returns (uint256)',
  'function liquidityHealthy() view returns (bool)',
]);

export const marketAbi = parseAbi([
  'function vote(uint256 id, address[] pools, uint256[] weights)',
  'function claimRewards(uint256 id, address[] rewards, address[][] tokens, bool bribes)',
  'function claimRewardsToDebt(uint256 id, address[] rewards, address[][] tokens, bool bribes)',
  'function setAutoPay(uint256 id, bool on)',
  'function autoPay(uint256) view returns (bool)',
  'function currentRate() view returns (uint256)',
  'function saverRate() view returns (uint256)',
  'function pegPremium() view returns (uint256)',
  'function lastMusdPrice() view returns (uint256)',
  'function lastPegStep() view returns (uint256)',
  'function lastBtcPrice() view returns (uint256)',
  'function nextLoanId() view returns (uint256)',
  'function minLoan() view returns (uint256)',
  'function borrowingOpen() view returns (bool)',
  'function debtOf(uint256) view returns (uint256)',
  'function loans(uint256) view returns (address owner, uint8 kind, uint64 depositBlock, uint256 btc, uint256 nftId, uint256 principal, uint256 scaled)',
  'function position(uint256) view returns (uint256 collateralValue, uint256 debt, uint256 healthWad, uint256 borrowLimit)',
  'function positionAt(uint256, uint256) view returns (uint256 collateralValue, uint256 debt, uint256 healthWad, uint256 borrowLimit)',
  'function admin() view returns (address)',
  'function configDelay() view returns (uint256)',
  'function pendingEta() view returns (uint256)',
  'function priceFeed() view returns (address)',
  'function btcRisk() view returns (uint16 maxLtvBps, uint16 liqLtvBps, uint16 bonusBps)',
  'function veTimedRisk() view returns (uint16 maxLtvBps, uint16 liqLtvBps, uint16 bonusBps)',
  'function vePermanentRisk() view returns (uint16 maxLtvBps, uint16 liqLtvBps, uint16 bonusBps)',
  'function openWithBtc(uint256 btcAmount, uint256 borrowAmount) returns (uint256)',
  'function openWithVeBTC(uint256 nftId, uint256 borrowAmount) returns (uint256)',
  'function borrow(uint256 id, uint256 amount)',
  'function repay(uint256 id, uint256 amount) returns (uint256)',
  'function close(uint256 id)',
  'function stepPeg()',
  'function liquidate(uint256 id, uint256 maxRepay)',
  'event LoanOpened(uint256 indexed id, address indexed owner, uint8 kind, uint256 btc, uint256 nftId)',
  // Move a Mezo loan (trove) into Keel with one CloseTrove signature.
  'function openFromTrove(uint256 extraBtc, uint256 deadline, bytes sig) returns (uint256)',
  'function bos() view returns (address)',
  'function troveManager() view returns (address)',
  'function borrowerOperations() view returns (address)',
  'function activePool() view returns (address)',
  'event TroveMoved(uint256 indexed id, address indexed borrower, uint256 btc, uint256 debt)',
  // Every reward pays the loan: BTC rewards swapped to MUSD on a Mezo pool.
  'function swapPool(address token) view returns (address)',
  'function setSwapPool(address token, address pool)',
  'function maxSlippageBps() view returns (uint256)',
  'function setMaxSlippage(uint256 bps)',
  'event RewardsSwapped(uint256 indexed id, address token, uint256 amountIn, uint256 musdOut)',
  'event SwapPoolSet(address indexed token, address pool)',
]);

/** Mezo's trove contracts, read to quote and sign a move into Keel. */
export const troveAbi = parseAbi([
  'function getTroveDebt(address) view returns (uint256)',
  'function getTroveColl(address) view returns (uint256)',
  'function getTroveStatus(address) view returns (uint256)',
  'function getNonce(address) view returns (uint256)',
  'function MUSD_GAS_COMPENSATION() view returns (uint256)',
  'function interestRate() view returns (uint16)',
]);

export const veAbi = parseAbi([
  'function locked(uint256) view returns (int128 amount, uint256 end, bool isPermanent)',
  'function ownerOf(uint256) view returns (address)',
  'function approve(address,uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function ownerToNFTokenIdList(address,uint256) view returns (uint256)',
]);

export const mainnetAbi = parseAbi([
  'function getTroveOwnersCount() view returns (uint256)',
  'function getEntireSystemDebt() view returns (uint256)',
  'function getTotalOutstandingDebt() view returns (uint256)',
  'function debtToPay() view returns (uint256)',
  'function supply() view returns (uint256)',
  'function strategy() view returns (address)',
  'function fetchPrice() view returns (uint256)',
  'function yieldIndex() view returns (uint256)',
]);
