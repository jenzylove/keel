// Compiles the vendored MUSDSavingsRate with solc 0.8.33 using the settings
// of the verified mainnet build (optimizer 100 runs, london).
// Usage: node script/compile-vendor.js <path to solc-js 0.8.33 package> > out.json
const fs = require('fs');
const path = require('path');
const solc = require(process.argv[2]);
const root = path.join(__dirname, '..', 'vendor', 'musd-savings-rate');
const sources = {};
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.sol')) sources[path.relative(root, p)] = { content: fs.readFileSync(p, 'utf8') };
  }
})(root);
const input = {
  language: 'Solidity',
  sources,
  settings: {
    optimizer: { enabled: true, runs: 100 },
    evmVersion: 'london',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};
const out = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (out.errors || []).filter((e) => e.severity === 'error');
if (errors.length) {
  console.error(errors.map((e) => e.formattedMessage).join('\n'));
  process.exit(1);
}
const c = out.contracts['contracts/vaults/MUSDSavingsRate.sol'].MUSDSavingsRate;
process.stdout.write(JSON.stringify({ abi: c.abi, bytecode: '0x' + c.evm.bytecode.object }));
