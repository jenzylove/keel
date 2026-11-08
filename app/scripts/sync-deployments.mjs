// Copies ../deployments/testnet.json and mainnet.json into the app so the build never depends
// on files outside the app directory. Run before dev and build.
import { copyFileSync, existsSync } from 'node:fs';
const src = new URL('../../deployments/testnet.json', import.meta.url);
const dst = new URL('../lib/testnet.json', import.meta.url);
if (existsSync(src)) copyFileSync(src, dst);
const loop = new URL('../../deployments/loop-run.json', import.meta.url);
if (existsSync(loop)) copyFileSync(loop, new URL('../lib/loop-run.json', import.meta.url));
const wave2 = new URL('../../deployments/wave2-run.json', import.meta.url);
if (existsSync(wave2)) copyFileSync(wave2, new URL('../lib/wave2-run.json', import.meta.url));
// Mainnet: the opt in vault and its run log, so the app can switch networks.
const main = new URL('../../deployments/mainnet.json', import.meta.url);
if (existsSync(main)) copyFileSync(main, new URL('../lib/mainnet.json', import.meta.url));
const mainRun = new URL('../../deployments/mainnet-run.json', import.meta.url);
if (existsSync(mainRun)) copyFileSync(mainRun, new URL('../lib/mainnet-run.json', import.meta.url));
