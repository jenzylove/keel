// Runs Keel's whole loop on Mezo testnet with fresh wallets playing both
// sides: savers deposit, borrowers borrow against BTC and against a veBTC lock,
// interest accrues, borrowers repay, savers' yield reaches the vault, and
// savers withdraw. Every step is a real transaction, recorded with its hash in
// deployments/loop-run.json. Progress is saved after each step, so a flaky RPC
// can't lose it: rerun the same phase to continue.
//
//   node script/loop.mjs open     fund wallets, deposit, open three loans
//   node script/loop.mjs close    repay and close, release yield, savers claim and withdraw
//
// Wallet keys live in contracts/wallets/loop.json (git-ignored).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const v = join(root, '..', 'app', 'node_modules', 'viem', '_esm');
const { createPublicClient, createWalletClient, defineChain, http, parseAbi, parseEther, formatEther, encodeFunctionData } =
  await import(pathToFileURL(join(v, 'index.js')).href);
const { privateKeyToAccount, generatePrivateKey } = await import(pathToFileURL(join(v, 'accounts', 'index.js')).href);

const env = Object.fromEntries(
  readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const dep = JSON.parse(readFileSync(join(root, '..', 'deployments', 'testnet.json'), 'utf8'));
const { vault: VAULT, keelStrategy: STRAT, keelMarket: MARKET } = dep.contracts;
const { musd: MUSD, btc: BTC, veBTC: VE } = dep.mezo;

const SEND_RPC = 'https://rpc.test.mezo.org';
const READ_RPC = 'https://mezo-testnet.drpc.org';
const chain = defineChain({ id: 31611, name: 'mezo-testnet', nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 }, rpcUrls: { default: { http: [SEND_RPC] } } });
const pub = createPublicClient({ chain, transport: http(SEND_RPC, { retryCount: 5 }) });
const pubRead = createPublicClient({ chain, transport: http(READ_RPC, { retryCount: 5 }) });

const erc20 = parseAbi(['function approve(address,uint256) returns (bool)', 'function transfer(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)']);
const vaultAbi = parseAbi(['function deposit(uint256)', 'function withdraw(uint256)', 'function claimYield() returns (uint256)', 'function receiveYieldFromStrategy()', 'function yieldIndex() view returns (uint256)', 'function claimableYield(address) view returns (uint256)', 'function balanceOf(address) view returns (uint256)']);
const marketAbi = parseAbi([
  'function openWithBtc(uint256,uint256) returns (uint256)',
  'function openWithVeBTC(uint256,uint256) returns (uint256)',
  'function repay(uint256,uint256) returns (uint256)',
  'function close(uint256)',
  'function nextLoanId() view returns (uint256)',
  'function debtOf(uint256) view returns (uint256)',
  'function loans(uint256) view returns (address owner, uint8 kind, uint64 depositBlock, uint256 btc, uint256 nftId, uint256 principal, uint256 scaled)',
]);
const stratAbi = parseAbi(['function principal() view returns (uint256)', 'function lent() view returns (uint256)', 'function yieldOwed() view returns (uint256)', 'function reserve() view returns (uint256)', 'function unreleased() view returns (uint256)']);
const veAbi = parseAbi(['function createLock(uint256,uint256) returns (uint256)', 'function approve(address,uint256)', 'function tokenId() view returns (uint256)', 'function ownerOf(uint256) view returns (address)']);

// --- state ---------------------------------------------------------------
const walletsFile = join(root, 'wallets', 'loop.json');
const runFile = join(root, '..', 'deployments', 'loop-run.json');
mkdirSync(join(root, 'wallets'), { recursive: true });
const keys = existsSync(walletsFile)
  ? JSON.parse(readFileSync(walletsFile, 'utf8'))
  : Object.fromEntries(['saver1', 'saver2', 'borrower1', 'borrower2', 'borrower3'].map((n) => [n, generatePrivateKey()]));
writeFileSync(walletsFile, JSON.stringify(keys, null, 2));
const run = existsSync(runFile) ? JSON.parse(readFileSync(runFile, 'utf8')) : { network: 'Mezo testnet (31611)', contracts: dep.contracts, actors: {}, steps: [], loans: {} };
for (const [n, k] of Object.entries(keys)) run.actors[n] = privateKeyToAccount(k).address;
const save = () => writeFileSync(runFile, JSON.stringify(run, (_, x) => (typeof x === 'bigint' ? x.toString() : x), 2) + '\n');
const done = (key) => run.steps.find((s) => s.key === key);

const deployer = privateKeyToAccount(env.DEPLOYER_PK);
const acct = (n) => (n === 'deployer' ? deployer : privateKeyToAccount(keys[n]));

async function receipt(hash) {
  for (let i = 0; i < 100; i++) {
    for (const c of [pubRead, pub]) {
      try {
        const r = await c.getTransactionReceipt({ hash });
        if (r) return r;
      } catch {}
    }
    await new Promise((s) => setTimeout(s, 2500));
  }
  throw new Error(`no receipt for ${hash}`);
}

/** Sends one step once. A step already recorded is skipped on a rerun. */
async function step(key, who, what, tx, gas) {
  if (done(key)) return done(key);
  const account = acct(who);
  const w = createWalletClient({ account, chain, transport: http(SEND_RPC, { retryCount: 3 }) });
  const gasPrice = await pub.getGasPrice();
  let hash;
  for (let t = 0; t < 4 && !hash; t++) {
    try {
      hash = await w.sendTransaction({ ...tx, gas, gasPrice, type: 'legacy' });
    } catch (e) {
      if (t === 3) throw e;
      await new Promise((s) => setTimeout(s, 4000));
    }
  }
  const r = await receipt(hash);
  if (r.status !== 'success') throw new Error(`${key} reverted: ${hash}`);
  const rec = { key, who, address: account.address, what, hash, block: Number(r.blockNumber) };
  run.steps.push(rec);
  save();
  console.log(`${what.padEnd(58)} ${hash}`);
  return rec;
}
const call = (address, abi, functionName, args) => ({ to: address, data: encodeFunctionData({ abi, functionName, args }) });
const read = (address, abi, functionName, args = []) => pub.readContract({ address, abi, functionName, args });

async function snapshot(label) {
  const [principal, lent, yieldOwed, reserve, unreleased, yieldIndex] = await Promise.all([
    read(STRAT, stratAbi, 'principal'), read(STRAT, stratAbi, 'lent'), read(STRAT, stratAbi, 'yieldOwed'),
    read(STRAT, stratAbi, 'reserve'), read(STRAT, stratAbi, 'unreleased'), read(VAULT, vaultAbi, 'yieldIndex'),
  ]);
  const savers = {};
  for (const n of ['saver1', 'saver2']) {
    const a = run.actors[n];
    const [shares, claimable, musd] = await Promise.all([read(VAULT, vaultAbi, 'balanceOf', [a]), read(VAULT, vaultAbi, 'claimableYield', [a]), read(MUSD, erc20, 'balanceOf', [a])]);
    savers[n] = { sMUSD: formatEther(shares), claimableYield: formatEther(claimable), walletMUSD: formatEther(musd) };
  }
  run[label] = {
    at: new Date().toISOString(),
    strategy: { principal: formatEther(principal), lent: formatEther(lent), yieldOwed: formatEther(yieldOwed), reserve: formatEther(reserve), unreleased: formatEther(unreleased) },
    vaultYieldIndex: yieldIndex.toString(),
    savers,
  };
  save();
  console.log(label, JSON.stringify(run[label]));
}

const phase = process.argv[2];
const SAVE = parseEther('60');
const loanPlan = [
  { who: 'borrower1', kind: 'btc', btc: parseEther('0.0012'), borrow: parseEther('30') },
  { who: 'borrower2', kind: 'btc', btc: parseEther('0.001'), borrow: parseEther('25') },
  { who: 'borrower3', kind: 've', btc: parseEther('0.0012'), borrow: parseEther('20') },
];

if (phase === 'open') {
  await snapshot('before');
  // Fund the actors from the deployer: gas for everyone, MUSD for savers,
  // collateral for borrowers.
  for (const n of ['saver1', 'saver2']) {
    await step(`fund-${n}-btc`, 'deployer', `Fund ${n} with gas BTC`, { to: run.actors[n], value: parseEther('0.0002') }, 30_000n);
    await step(`fund-${n}-musd`, 'deployer', `Send ${n} 60 MUSD`, call(MUSD, erc20, 'transfer', [run.actors[n], SAVE]), 120_000n);
  }
  for (const l of loanPlan) {
    await step(`fund-${l.who}`, 'deployer', `Fund ${l.who} with ${formatEther(l.btc + parseEther('0.0004'))} BTC`, { to: run.actors[l.who], value: l.btc + parseEther('0.0004') }, 30_000n);
  }
  // Savers deposit into the savings vault, which allocates into Keel.
  for (const n of ['saver1', 'saver2']) {
    await step(`${n}-approve`, n, `${n} approves the vault`, call(MUSD, erc20, 'approve', [VAULT, SAVE]), 120_000n);
    await step(`${n}-deposit`, n, `${n} deposits 60 MUSD (allocated into Keel)`, call(VAULT, vaultAbi, 'deposit', [SAVE]), 700_000n);
  }
  // Borrowers open loans outside the redemption system.
  for (const l of loanPlan) {
    if (l.kind === 'btc') {
      await step(`${l.who}-approve`, l.who, `${l.who} approves ${formatEther(l.btc)} BTC`, call(BTC, erc20, 'approve', [MARKET, l.btc]), 120_000n);
      const s = await step(`${l.who}-open`, l.who, `${l.who} locks ${formatEther(l.btc)} BTC, borrows ${formatEther(l.borrow)} MUSD`, call(MARKET, marketAbi, 'openWithBtc', [l.btc, l.borrow]), 1_000_000n);
      if (!run.loans[l.who]) run.loans[l.who] = { kind: 'BTC', id: Number(await read(MARKET, marketAbi, 'nextLoanId')) - 1, openTx: s.hash };
    } else {
      await step(`${l.who}-ve-approve`, l.who, `${l.who} approves BTC for a veBTC lock`, call(BTC, erc20, 'approve', [VE, l.btc]), 120_000n);
      const lock = await step(`${l.who}-ve-lock`, l.who, `${l.who} locks ${formatEther(l.btc)} BTC as veBTC for 21 days`, call(VE, veAbi, 'createLock', [l.btc, 21n * 86400n]), 1_500_000n);
      if (!run.loans[l.who]) run.loans[l.who] = { kind: 'veBTC', nftId: Number(await read(VE, veAbi, 'tokenId')), lockTx: lock.hash };
      save();
      const nft = BigInt(run.loans[l.who].nftId);
      await step(`${l.who}-ve-approve-market`, l.who, `${l.who} approves veBTC #${nft} to Keel`, call(VE, veAbi, 'approve', [MARKET, nft]), 150_000n);
      const s = await step(`${l.who}-open`, l.who, `${l.who} deposits veBTC #${nft}, borrows ${formatEther(l.borrow)} MUSD`, call(MARKET, marketAbi, 'openWithVeBTC', [nft, l.borrow]), 1_300_000n);
      run.loans[l.who].id = Number(await read(MARKET, marketAbi, 'nextLoanId')) - 1;
      run.loans[l.who].openTx = s.hash;
    }
    save();
  }
  await snapshot('afterOpen');
} else if (phase === 'close') {
  // Each borrower repays with interest (topped up by the deployer, since the
  // interest is a little more than they borrowed) and gets their collateral back.
  for (const l of loanPlan) {
    const id = BigInt(run.loans[l.who].id);
    const debt = await read(MARKET, marketAbi, 'debtOf', [id]);
    const pay = debt + debt / 500n + 1n;
    await step(`${l.who}-topup`, 'deployer', `Send ${l.who} the interest owed`, call(MUSD, erc20, 'transfer', [run.actors[l.who], pay - l.borrow]), 120_000n);
    await step(`${l.who}-repay-approve`, l.who, `${l.who} approves the repayment`, call(MUSD, erc20, 'approve', [MARKET, pay]), 120_000n);
    await step(`${l.who}-repay`, l.who, `${l.who} repays loan #${id} (interest first, to savers)`, call(MARKET, marketAbi, 'repay', [id, pay]), 800_000n);
    await step(`${l.who}-close`, l.who, `${l.who} closes loan #${id}, collateral returned`, call(MARKET, marketAbi, 'close', [id]), 800_000n);
  }
  await snapshot('afterRepay');
  // Released interest moves from Keel into the savings vault; savers claim it
  // and withdraw their deposit.
  await step('release', 'deployer', 'Vault pulls released interest from Keel', call(VAULT, vaultAbi, 'receiveYieldFromStrategy', []), 700_000n);
  for (const n of ['saver1', 'saver2']) {
    await step(`${n}-claim`, n, `${n} claims their yield`, call(VAULT, vaultAbi, 'claimYield', []), 500_000n);
    await step(`${n}-withdraw`, n, `${n} withdraws their 60 MUSD`, call(VAULT, vaultAbi, 'withdraw', [SAVE]), 800_000n);
  }
  await snapshot('after');
} else {
  console.log('usage: node script/loop.mjs <open|close>');
}
process.exit(0);
