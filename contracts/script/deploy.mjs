// Deploys Keel with its own copy of Mezo's MUSDSavingsRate vault, owned by the
// deployer, and writes deployments/<network>.json. Runs anywhere Node and
// Foundry do (no jq or bash needed).
//
//   node script/deploy.mjs testnet
//   node script/deploy.mjs mainnet
//   node script/deploy.mjs mainnet --rpc http://127.0.0.1:8545   (dry run on an anvil fork)
//
// Reads contracts/.env: DEPLOYER_PK and MEZO_TESTNET_RPC for testnet,
// MAINNET_DEPLOYER_PK and MEZO_MAINNET_RPC for mainnet. SOLC_JS points at a
// solc-js 0.8.33 package for the vendored vault (default ../../keel-tools).
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const viemPath = join(root, '..', 'app', 'node_modules', 'viem');
const { createPublicClient, createWalletClient, defineChain, encodeAbiParameters, encodeFunctionData, http, parseAbiParameters } =
  await import(pathToFileURL(join(viemPath, '_esm', 'index.js')).href);
const { privateKeyToAccount } = await import(pathToFileURL(join(viemPath, '_esm', 'accounts', 'index.js')).href);

const env = Object.fromEntries(
  (existsSync(join(root, '.env')) ? readFileSync(join(root, '.env'), 'utf8') : '')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

const network = process.argv[2];
const rpcFlag = process.argv.indexOf('--rpc');
const dryRun = rpcFlag > 0;

const WAD = 10n ** 18n;
const pct = (n) => (BigInt(Math.round(n * 1e4)) * WAD) / 10_000n;
const common = {
  forwarder: '0x000000000000000000000000000000000000dEaD',
  maxLentBps: 2000n,
  reserveBps: 1000n,
  risks: [
    [5000, 6500, 500],
    [4500, 6000, 800],
    [4000, 5500, 1000],
  ],
  rates: [pct(0.03), pct(0.04), pct(0.75), pct(0.8)],
  peg: [pct(0.995), pct(0.985), pct(0.04), pct(0.01), 604800n],
};
const NETWORKS = {
  testnet: {
    chainId: 31611,
    explorer: 'https://explorer.test.mezo.org',
    rpc: env.MEZO_TESTNET_RPC || 'https://mezo-testnet.drpc.org',
    pk: env.DEPLOYER_PK,
    musd: '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503',
    btc: '0x7b7C000000000000000000000000000000000000',
    ve: '0xB63fcCd03521Cf21907627bd7fA465C129479231',
    voter: '0x72F8dd7F44fFa19E45955aa20A5486E8EB255738',
    priceFeed: '0x86bCF0841622a5dAC14A313a15f96A95421b9366',
    // MUSD/mUSDC basic stable pool: its quote() gives the peg oracle's price.
    oracle: { kind: 'basic', pool: '0x525F049A4494dA0a6c87E3C4df55f9929765Dc3e', stable: '0xe1a26db653708A2AD8F824E92Db9852410e33A59', granularity: 48n },
    configDelay: 600n,
    minLoan: 10n * WAD,
    principalCap: 0n,
    throttle: null,
  },
  mainnet: {
    chainId: 31612,
    explorer: 'https://explorer.mezo.org',
    rpc: env.MEZO_MAINNET_RPC || 'https://mainnet.mezo.public.validationcloud.io',
    pk: env.MAINNET_DEPLOYER_PK,
    musd: '0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186',
    btc: '0x7b7C000000000000000000000000000000000000',
    ve: '0x3D4b1b884A7a1E59fE8589a3296EC8f8cBB6f279',
    // Read live from veBTC.voter().
    voter: '0x48233cCC97B87Ba93bCA212cbEe48e3210211f03',
    priceFeed: '0xc5aC5A8892230E0A3e1c473881A2de7353fFcA88',
    // mUSDC/MUSD concentrated-liquidity pool holding Mezo's peg wall, 24h TWAP.
    oracle: { kind: 'cl', pool: '0xCC372B7E15535aB225fe17c1075831D38ef7aC1a', window: 86400 },
    configDelay: 172800n,
    minLoan: 100n * WAD,
    // A small, unaudited deployment: at most 2,000 MUSD of savings, so at most
    // 400 MUSD lent.
    principalCap: 2000n * WAD,
    // New borrowing pauses while the wall holds less than 30,000 mUSDC.
    throttle: { pool: '0xCC372B7E15535aB225fe17c1075831D38ef7aC1a', token: '0x04671C72Aab5AC02A03c1098314b1BB6B560c197', floor: 30_000n * 10n ** 6n },
  },
};

const cfg = NETWORKS[network];
if (!cfg) throw new Error('usage: node script/deploy.mjs <testnet|mainnet> [--rpc <url>]');
if (!cfg.pk) throw new Error(`no deployer key for ${network} in contracts/.env`);
const rpc = dryRun ? process.argv[rpcFlag + 1] : cfg.rpc;

const chain = defineChain({ id: cfg.chainId, name: `mezo-${network}`, nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const account = privateKeyToAccount(cfg.pk);
const pub = createPublicClient({ chain, transport: http(rpc, { retryCount: 5 }) });
const wallet = createWalletClient({ account, chain, transport: http(rpc, { retryCount: 5 }) });
const say = (...a) => console.log(...a);

// --- build ---------------------------------------------------------------
const forge = spawnSync('forge', ['build'], { cwd: root, stdio: 'inherit', shell: true });
if (forge.status !== 0) throw new Error('forge build failed');
const art = (file, name) => JSON.parse(readFileSync(join(root, 'out', file, `${name}.json`), 'utf8'));
const solcPath = env.SOLC_JS || join(root, '..', '..', 'keel-tools', 'node_modules', 'solc');
const vendored = spawnSync('node', [join(here, 'compile-vendor.js'), solcPath], { encoding: 'utf8', maxBuffer: 64 << 20 });
if (vendored.status !== 0) throw new Error(vendored.stderr);
const vaultArt = JSON.parse(vendored.stdout);

// --- send helpers --------------------------------------------------------
async function waitReceipt(hash) {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await pub.getTransactionReceipt({ hash });
      if (r) {
        if (r.status !== 'success') throw new Error(`reverted: ${hash}`);
        return r;
      }
    } catch (e) {
      if (String(e.message).startsWith('reverted')) throw e;
    }
    await new Promise((s) => setTimeout(s, 2000));
  }
  throw new Error(`no receipt for ${hash}`);
}
async function send(tx) {
  const gasPrice = await pub.getGasPrice();
  const gas = ((await pub.estimateGas({ account, ...tx })) * 13n) / 10n;
  const hash = await wallet.sendTransaction({ ...tx, gas, gasPrice, type: 'legacy' });
  return { hash, receipt: await waitReceipt(hash) };
}
async function create(bytecode, types, args) {
  const data = types ? bytecode + encodeAbiParameters(parseAbiParameters(types), args).slice(2) : bytecode;
  const { hash, receipt } = await send({ data });
  return { address: receipt.contractAddress, hash };
}
const call = (address, abi, functionName, args = []) => send({ to: address, data: encodeFunctionData({ abi, functionName, args }) });
const read = (address, abi, functionName, args = []) => pub.readContract({ address, abi, functionName, args });

// --- deploy --------------------------------------------------------------
say(`== ${network}${dryRun ? ' (dry run)' : ''} · deployer ${account.address}`);
const balance = await pub.getBalance({ address: account.address });
say(`   BTC for gas: ${Number(balance) / 1e18}`);
if (balance === 0n) throw new Error('fund the deployer with BTC first');

const txs = {};
const impl = await create(vaultArt.bytecode, 'address', [common.forwarder]);
txs.vaultImplementation = impl.hash;
say('vault implementation', impl.address);

const init = encodeFunctionData({ abi: vaultArt.abi, functionName: 'initialize', args: [cfg.musd] });
const proxyArt = art('ERC1967Proxy.sol', 'ERC1967Proxy');
const vault = await create(proxyArt.bytecode.object, 'address, bytes', [impl.address, init]);
txs.vaultProxy = vault.hash;
const idle = await read(vault.address, vaultArt.abi, 'strategy');
say('vault', vault.address, '· idle strategy', idle);

const oracleArt = art('PegOracles.sol', cfg.oracle.kind === 'cl' ? 'ClPoolTwapPegOracle' : 'BasicPoolTwapPegOracle');
const oracle =
  cfg.oracle.kind === 'cl'
    ? await create(oracleArt.bytecode.object, 'address, address, uint32', [cfg.oracle.pool, cfg.musd, cfg.oracle.window])
    : await create(oracleArt.bytecode.object, 'address, address, address, uint256', [cfg.oracle.pool, cfg.musd, cfg.oracle.stable, cfg.oracle.granularity]);
txs.pegOracle = oracle.hash;
say('peg oracle', oracle.address, '· reads', Number(await read(oracle.address, oracleArt.abi, 'musdPrice')) / 1e18);

const stratArt = art('KeelStrategy.sol', 'KeelStrategy');
const strategy = await create(stratArt.bytecode.object, 'address, address, uint256, uint256', [cfg.musd, vault.address, common.maxLentBps, common.reserveBps]);
txs.keelStrategy = strategy.hash;
say('KeelStrategy', strategy.address);

const marketArt = art('KeelMarket.sol', 'KeelMarket');
const market = await create(
  marketArt.bytecode.object,
  '(address,address,address,address,address,address,address), ((uint16,uint16,uint16)[3],(uint256,uint256,uint256,uint256),(uint256,uint256,uint256,uint256,uint256),address,uint256), uint256',
  [
    [cfg.musd, cfg.btc, cfg.ve, cfg.voter, cfg.priceFeed, oracle.address, strategy.address],
    [common.risks, common.rates, common.peg, oracle.address, cfg.minLoan],
    cfg.configDelay,
  ],
);
txs.keelMarket = market.hash;
say('KeelMarket', market.address);

txs.setMarket = (await call(strategy.address, stratArt.abi, 'setMarket', [market.address])).hash;
txs.setStrategy = (await call(vault.address, vaultArt.abi, 'setStrategy', [strategy.address])).hash;
if (cfg.principalCap > 0n) txs.setPrincipalCap = (await call(strategy.address, stratArt.abi, 'setPrincipalCap', [cfg.principalCap])).hash;
if (cfg.throttle) txs.setThrottle = (await call(market.address, marketArt.abi, 'setThrottle', [cfg.throttle.pool, cfg.throttle.token, cfg.throttle.floor])).hash;

// Check the wiring before writing anything down.
const checks = {
  'vault strategy = Keel': (await read(vault.address, vaultArt.abi, 'strategy')).toLowerCase() === strategy.address.toLowerCase(),
  'strategy market = market': (await read(strategy.address, stratArt.abi, 'market')).toLowerCase() === market.address.toLowerCase(),
  'admin = deployer': (await read(market.address, marketArt.abi, 'admin')).toLowerCase() === account.address.toLowerCase(),
  'config delay': (await read(market.address, marketArt.abi, 'configDelay')) === cfg.configDelay,
  'principal cap': (await read(strategy.address, stratArt.abi, 'principalCap')) === cfg.principalCap,
};
say(checks);
if (!Object.values(checks).every(Boolean)) throw new Error('wiring check failed');

if (dryRun) {
  say('dry run: nothing written');
  process.exit(0);
}

const out = join(root, '..', 'deployments', `${network}.json`);
const prev = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : {};
const contracts = { vault: vault.address, vaultImplementation: impl.address, idleStrategy: idle, keelStrategy: strategy.address, keelMarket: market.address, pegOracle: oracle.address };
const record = {
  chainId: cfg.chainId,
  explorer: cfg.explorer,
  contracts,
  mezo: { musd: cfg.musd, btc: cfg.btc, veBTC: cfg.ve, voter: cfg.voter, priceFeed: cfg.priceFeed },
  params: {
    ...(prev.params ?? {}),
    governance: 'the vault owner, read live',
    configDelaySeconds: Number(cfg.configDelay),
    maxLentBps: Number(common.maxLentBps),
    reserveBps: Number(common.reserveBps),
    principalCap: cfg.principalCap === 0n ? 'none' : `${cfg.principalCap / WAD} MUSD`,
    throttle: cfg.throttle ? `${cfg.throttle.floor / 10n ** 6n} mUSDC floor on ${cfg.throttle.pool}` : 'off',
    minLoan: `${cfg.minLoan / WAD} MUSD`,
  },
  txs,
  history: [...(prev.history ?? []), ...(prev.contracts ? [{ note: `Replaced on ${new Date().toISOString().slice(0, 10)} by the deployment above.`, contracts: prev.contracts, txs: prev.txs }] : [])],
};
writeFileSync(out, JSON.stringify(record, null, 2) + '\n');
say('wrote', out);
