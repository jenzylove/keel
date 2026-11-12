// Testnet only: swaps Keel's market for the version that can move a Mezo
// loan into Keel and swap BTC rewards to MUSD, keeping the same vault and
// strategy (and so the same savers). Then funds the vault so a minimum
// Mezo loan (1,800 MUSD) fits under the lend cap.
//
//   node script/upgrade-testnet-market.mjs <step>
//   steps: close-old | deploy | params | apply | liquidity | deposit
//
// Keys: contracts/.env DEPLOYER_PK (vault owner), ../.env DEPLOYER_PK (holds
// the Mezo trove to move) and LIQUIDATOR_PK, wallets/tester.json.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const viemPath = join(root, '..', 'app', 'node_modules', 'viem');
const v = await import(pathToFileURL(join(viemPath, '_esm', 'index.js')).href);
const { privateKeyToAccount } = await import(pathToFileURL(join(viemPath, '_esm', 'accounts', 'index.js')).href);
const { createPublicClient, createWalletClient, defineChain, encodeAbiParameters, parseAbiParameters, parseAbi, http, maxUint256 } = v;

const readEnv = (p) => Object.fromEntries((existsSync(p) ? readFileSync(p, 'utf8') : '').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const cenv = readEnv(join(root, '.env'));
const renv = readEnv(join(root, '..', '.env'));

const RPC = 'https://mezo-testnet.drpc.org';
const chain = defineChain({ id: 31611, name: 'mezo-testnet', nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain, transport: http(RPC, { retryCount: 5, timeout: 30_000 }) });
const wallet = (pk) => createWalletClient({ account: privateKeyToAccount(pk), chain, transport: http(RPC, { retryCount: 5, timeout: 30_000 }) });
const admin = wallet(cenv.DEPLOYER_PK);
const troveOwner = wallet(renv.DEPLOYER_PK);
const funder = wallet(renv.LIQUIDATOR_PK);
const tester = wallet(JSON.parse(readFileSync(join(root, 'wallets', 'tester.json'), 'utf8')).pk);

const depPath = join(root, '..', 'deployments', 'testnet.json');
const dep = JSON.parse(readFileSync(depPath, 'utf8'));
const C = dep.contracts;
const MUSD = '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503';
const BTC = '0x7b7C000000000000000000000000000000000000';
const BO = '0xCdF7028ceAB81fA0C6971208e83fa7872994beE5';
const TROVE = { bos: '0xD757e3646AF370b15f32EB557F0F8380Df7D639e', troveManager: '0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0', borrowerOperations: BO, activePool: '0x143A063F62340DA3A8bEA1C5642d18C6D0F7FF51' };
const BTC_POOL = '0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9';
const WAD = 10n ** 18n;
const pct = (n) => (BigInt(Math.round(n * 1e4)) * WAD) / 10_000n;

const art = (file, name) => JSON.parse(readFileSync(join(root, 'out', file, `${name}.json`), 'utf8'));
const erc20 = parseAbi(['function approve(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)', 'function transfer(address,uint256) returns (bool)']);

async function send(w, req) {
  const gasPrice = await pub.getGasPrice();
  const hash = req.data && !req.to
    ? await w.sendTransaction({ data: req.data, gas: 8_000_000n, gasPrice, type: 'legacy' })
    : req.abi
      ? await w.writeContract({ ...req, gasPrice, type: 'legacy', gas: req.gas ?? 1_500_000n })
      : await w.sendTransaction({ ...req, gasPrice, type: 'legacy', gas: req.gas ?? 100_000n });
  for (let i = 0; i < 90; i++) {
    const r = await pub.getTransactionReceipt({ hash }).catch(() => null);
    if (r) {
      console.log(`  ${req.functionName ?? (req.to ? 'send' : 'create')} ${hash} ${r.status}`);
      if (r.status !== 'success') throw new Error(`reverted ${hash}`);
      return { hash, r };
    }
    await new Promise((s) => setTimeout(s, 2000));
  }
  throw new Error(`no receipt ${hash}`);
}

const step = process.argv[2];
const record = dep.v3 ?? (dep.v3 = { txs: {} });
const save = () => writeFileSync(depPath, JSON.stringify(dep, null, 2) + '\n');
const oldMarket = C.keelMarket;
const mArt = () => art('KeelMarket.sol', 'KeelMarket');
const sArt = art('KeelStrategy.sol', 'KeelStrategy');

if (step === 'close-old') {
  // Loan #4 is the only open loan on the old market (veBTC #422, the tester's).
  const m = mArt().abi;
  await send(tester, { address: MUSD, abi: erc20, functionName: 'approve', args: [oldMarket, maxUint256] });
  record.txs.repayOld4 = (await send(tester, { address: oldMarket, abi: m, functionName: 'repay', args: [4n, maxUint256] })).hash;
  record.txs.closeOld4 = (await send(tester, { address: oldMarket, abi: m, functionName: 'close', args: [4n] })).hash;
  console.log('lent now', await pub.readContract({ address: C.keelStrategy, abi: sArt.abi, functionName: 'lent' }));
  save();
}

if (step === 'deploy') {
  const forge = spawnSync('forge', ['build'], { cwd: root, stdio: 'inherit', shell: true });
  if (forge.status !== 0) throw new Error('forge build failed');
  const a = mArt();
  const args = encodeAbiParameters(
    parseAbiParameters('(address,address,address,address,address,address,address), ((uint16,uint16,uint16)[3],(uint256,uint256,uint256,uint256),(uint256,uint256,uint256,uint256,uint256),address,uint256), uint256, (address,address,address,address,address)'),
    [
      [MUSD, BTC, dep.mezo.veBTC, dep.mezo.voter, dep.mezo.priceFeed, C.pegOracle, C.keelStrategy],
      [[[5000, 6500, 500], [4500, 6000, 800], [4000, 5500, 1000]], [pct(0.03), pct(0.04), pct(0.75), pct(0.8)], [pct(0.995), pct(0.985), pct(0.04), pct(0.01), 604800n], C.pegOracle, 10n * WAD],
      600n,
      [TROVE.bos, TROVE.troveManager, TROVE.borrowerOperations, TROVE.activePool, BTC_POOL],
    ],
  );
  const { hash, r } = await send(admin, { data: a.bytecode.object + args.slice(2) });
  record.txs.keelMarket = hash;
  record.previousMarket = oldMarket;
  C.keelMarket = r.contractAddress;
  console.log('new market', r.contractAddress);
  record.txs.setMarket = (await send(admin, { address: C.keelStrategy, abi: sArt.abi, functionName: 'setMarket', args: [r.contractAddress] })).hash;
  save();
}

if (step === 'params') {
  // Lend up to half of savings on testnet, like the mainnet opt in vault, so a
  // minimum Mezo loan fits. Waits the market's 600 s config delay.
  record.txs.proposeParams = (await send(admin, { address: C.keelStrategy, abi: sArt.abi, functionName: 'proposeParams', args: [5000n, 1000n, 1000n, 0n, '0x0000000000000000000000000000000000000000'] })).hash;
  save();
}
if (step === 'apply') {
  record.txs.applyParams = (await send(admin, { address: C.keelStrategy, abi: sArt.abi, functionName: 'applyParams' })).hash;
  console.log('maxLentBps', await pub.readContract({ address: C.keelStrategy, abi: sArt.abi, functionName: 'maxLentBps' }));
  save();
}

if (step === 'liquidity') {
  // A second Mezo loan, opened by the funder wallet, mints the MUSD savers deposit.
  const btcFor = BigInt(process.argv[3] ?? '42000000000000000');
  if ((await pub.getBalance({ address: funder.account.address })) < btcFor) record.txs.fundFunder = (await send(troveOwner, { to: funder.account.address, value: btcFor })).hash;
  const bo = parseAbi(['function openTrove(uint256 _debtAmount, address _upperHint, address _lowerHint) payable']);
  record.txs.openFunderTrove = (await send(funder, { address: BO, abi: bo, functionName: 'openTrove', args: [1800n * WAD, '0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000'], value: btcFor - 300_000_000_000_000n, gas: 6_000_000n })).hash;
  save();
}

if (step === 'deposit') {
  const vault = parseAbi(['function deposit(uint256)', 'function totalSupply() view returns (uint256)']);
  for (const [name, w] of [['funder', funder], ['troveOwner', troveOwner]]) {
    const bal = await pub.readContract({ address: MUSD, abi: erc20, functionName: 'balanceOf', args: [w.account.address] });
    if (bal < WAD) continue;
    await send(w, { address: MUSD, abi: erc20, functionName: 'approve', args: [C.vault, bal] });
    record.txs[`deposit_${name}`] = (await send(w, { address: C.vault, abi: vault, functionName: 'deposit', args: [bal] })).hash;
  }
  console.log('principal', await pub.readContract({ address: C.vault, abi: vault, functionName: 'totalSupply' }));
  console.log('lendable', await pub.readContract({ address: C.keelStrategy, abi: sArt.abi, functionName: 'lendable' }));
  save();
}
