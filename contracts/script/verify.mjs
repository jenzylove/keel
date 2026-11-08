// Verifies Keel's deployed contracts on the Mezo Blockscout explorer.
//
//   node script/verify.mjs testnet
//   node script/verify.mjs mainnet
//   node script/verify.mjs testnet keelMarket pegOracle   (only these)
//   node script/verify.mjs testnet --src ../../keel-launch/verify-src/contracts
//
// --src points at a contracts folder holding the source as deployed (for
// example a git archive of the deploy commit), so edits to the working tree
// cannot change the result. Run forge build there first.
//
// Reads deployments/<network>.json, finds each contract's creation transaction
// through the explorer API, takes the constructor arguments from the tail of
// that transaction's input, and runs forge verify-contract. Needs forge on the
// PATH and a forge build that matches the deployed code (same solc settings).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const NETWORKS = {
  testnet: { chainId: 31611, explorer: 'https://explorer.test.mezo.org', api: 'https://api.explorer.test.mezo.org/api/' },
  mainnet: { chainId: 31612, explorer: 'https://explorer.mezo.org', api: 'https://api.explorer.mezo.org/api/' },
};

const args = process.argv.slice(2);
const srcAt = args.indexOf('--src');
const build = srcAt >= 0 ? resolve(args.splice(srcAt, 2)[1]) : root;
const network = args[0];
const net = NETWORKS[network];
if (!net) throw new Error('usage: node script/verify.mjs <testnet|mainnet> [contractKey ...] [--src <contracts dir>]');
const only = args.slice(1);

const record = JSON.parse(readFileSync(join(root, '..', 'deployments', `${network}.json`), 'utf8'));
const v2 = net.api.replace(/api\/$/, 'api/v2');
const getJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
};

// Contract keys in deployments json and the source each one was built from.
// The peg oracle has two variants, picked by whichever build matches the creation code.
const TARGETS = {
  keelStrategy: ["src/KeelStrategy.sol:KeelStrategy"],
  keelMarket: ["src/KeelMarket.sol:KeelMarket"],
  pegOracle: ["src/oracles/PegOracles.sol:BasicPoolTwapPegOracle", "src/oracles/PegOracles.sol:ClPoolTwapPegOracle"],
  // The vault is an OpenZeppelin ERC1967 proxy built by forge.
  vault: ["node_modules/@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy"],
};

// The forge artifact holds the creation code without constructor args, so the
// args are whatever follows it in the creation transaction input.
function split(input, candidates) {
  for (const target of candidates) {
    const [file, name] = target.split(":");
    const art = JSON.parse(readFileSync(join(build, "out", file.split("/").pop(), name + ".json"), "utf8"));
    const code = art.bytecode.object.toLowerCase().replace(/^0x/, "");
    if (input.startsWith(code)) return { target, args: input.slice(code.length) };
  }
  throw new Error("no local build matches the creation code; run forge build and check the source is unchanged");
}
// vaultImplementation (the vendored MUSDSavingsRate, solc 0.8.33, london, 100 runs)
// is not built by forge here, so it is left out. Verify it from the explorer UI
// with standard JSON input if you need it.

// Sourcify keeps an exact match record per chain, so it doubles as the check.
const sourcify = (address) => getJson(`https://sourcify.dev/server/v2/contract/${net.chainId}/${address}`).catch(() => ({}));
const isExact = (m) => m.match === 'exact_match';

const results = [];
for (const [key, pick] of Object.entries(TARGETS)) {
  if (only.length && !only.includes(key)) continue;
  const address = record.contracts[key];
  const smart = await getJson(`${v2}/smart-contracts/${address}`);
  const onExplorer = () => getJson(`${v2}/smart-contracts/${address}`).then((s) => Boolean(s.is_verified || s.name));
  if (smart.is_verified || smart.name) {
    results.push([key, address, 'verified on explorer']);
    continue;
  }
  if (isExact(await sourcify(address))) {
    results.push([key, address, 'verified on sourcify']);
    continue;
  }
  const info = await getJson(`${v2}/addresses/${address}`);
  const tx = await getJson(`${v2}/transactions/${info.creation_transaction_hash}`);
  const input = tx.raw_input.toLowerCase().replace(/^0x/, "");
  const { target, args } = split(input, pick);
  const base = [address, target, '--chain-id', String(net.chainId), '--watch'];
  if (args) base.push('--constructor-args', '0x' + args);
  const run = (verifier) => {
    const cmd = ['verify-contract', ...base, ...(verifier === 'blockscout' ? ['--verifier', 'blockscout', '--verifier-url', net.api] : ['--verifier', 'sourcify'])];
    console.log(`\n== ${key} ${address} via ${verifier}\nforge ${cmd.join(' ').slice(0, 200)}`);
    return spawnSync('forge', cmd, { cwd: build, stdio: 'inherit', shell: false });
  };
  // The explorer first. Its verifier service is sometimes down or lacks the
  // compiler (it did for Mezo testnet on 2026-11-08), so Sourcify is the backup.
  run('blockscout');
  if (await onExplorer()) {
    results.push([key, address, 'verified on explorer']);
    continue;
  }
  run('sourcify');
  results.push([key, address, isExact(await sourcify(address)) ? 'verified on sourcify' : 'failed']);
}

console.log('\nSummary');
for (const [key, address, status] of results) console.log(`${key.padEnd(14)} ${status.padEnd(22)} ${net.explorer}/address/${address}?tab=contract`);
console.log('Sourcify: https://repo.sourcify.dev/' + net.chainId + '/<address>');
