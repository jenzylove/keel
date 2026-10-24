// Copies ../deployments/testnet.json into the app so the build never depends
// on files outside the app directory. Run before dev and build.
import { copyFileSync, existsSync } from 'node:fs';
const src = new URL('../../deployments/testnet.json', import.meta.url);
const dst = new URL('../lib/testnet.json', import.meta.url);
if (existsSync(src)) copyFileSync(src, dst);
const loop = new URL('../../deployments/loop-run.json', import.meta.url);
if (existsSync(loop)) copyFileSync(loop, new URL('../lib/loop-run.json', import.meta.url));
