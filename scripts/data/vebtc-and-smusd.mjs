import { createPublicClient, http, parseAbi, formatUnits } from 'viem'
const c = createPublicClient({ transport: http('https://mezo.drpc.org',{fetchOptions:{headers:{'user-agent':'curl/8.5.0'}}}) })
const rd=async(a,sig,args=[],bn)=>{try{const f=sig.match(/function (\w+)/)[1];return await c.readContract({address:a,abi:parseAbi([sig]),functionName:f,args,blockNumber:bn})}catch(e){return 'ERR'}}
const f=(v,d=18)=>typeof v==='bigint'?Number(formatUnits(v,d)).toLocaleString('en-US',{maximumFractionDigits:4}):v
const VE='0x3D4b1b884A7a1E59fE8589a3296EC8f8cBB6f279', BTC='0x7b7C000000000000000000000000000000000000', SM='0xb4D498029af77680cD1eF828b967f010d06C51CC', MV='0x06291b67e3d7660240ab44Afc9a708d82b976a8B'
const head=await c.getBlockNumber()
for (const s of ['function supply() view returns (uint256)','function totalSupply() view returns (uint256)','function epoch() view returns (uint256)','function token() view returns (address)','function voter() view returns (address)','function name() view returns (string)']) console.log('veBTC',s.match(/function (\w+)/)[1], f(await rd(VE,s)))
console.log('veBTC BTC held', f(await rd(BTC,'function balanceOf(address) view returns (uint256)',[VE])), 'native', f(await c.getBalance({address:VE})))
const voter=await rd(VE,'function voter() view returns (address)'); console.log('voter',voter)
for (const s of ['function length() view returns (uint256)','function totalWeight() view returns (uint256)','function epochGovernor() view returns (address)']) console.log('voter',s.match(/function (\w+)/)[1], f(await rd(voter,s)))
// sMUSD rate history
for (const d of [0,7,30,60,90,120,180]) { const bn=head-BigInt(Math.floor(d*86400/3.874)); const r=await rd(SM,'function convertToAssets(uint256) view returns (uint256)',[10n**18n],bn); const ta=await rd(SM,'function totalAssets() view returns (uint256)',[],bn); console.log(`sMUSD -${d}d rate`, f(r,18), 'totalAssets', f(ta)) }
console.log('Morpho vault totalAssets mUSDC', f(await rd(MV,'function totalAssets() view returns (uint256)'),6))
for (const d of [0,30,90]) { const bn=head-BigInt(Math.floor(d*86400/3.874)); console.log(`veBTC -${d}d supply`, f(await rd(VE,'function supply() view returns (uint256)',[],bn)), 'BTC held', f(await rd(BTC,'function balanceOf(address) view returns (uint256)',[VE],bn))) }
