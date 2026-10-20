import { createPublicClient, http, parseAbi, formatUnits } from 'viem'
const t=createPublicClient({ transport: http('https://mezo-testnet.drpc.org',{fetchOptions:{headers:{'user-agent':'curl/8.5.0'}}}) })
const rd=async(a,sig,args=[])=>{try{const f=sig.match(/function (\w+)/)[1];return await t.readContract({address:a,abi:parseAbi([sig]),functionName:f,args})}catch(e){try{const f=sig.match(/function (\w+)/)[1];return (await t.simulateContract({address:a,abi:parseAbi([sig]),functionName:f,args})).result}catch(e2){return 'ERR '+(e2.shortMessage||'').slice(0,60)}}}
const f=v=>typeof v==='bigint'?Number(formatUnits(v,18)).toLocaleString('en-US',{maximumFractionDigits:4}):v
const TM='0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0', PF='0x86bCF0841622a5dAC14A313a15f96A95421b9366', MUSD='0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503', VE='0xB63fcCd03521Cf21907627bd7fA465C129479231', BO='0xCdF7028ceAB81fA0C6971208e83fa7872994beE5'
console.log('block', await t.getBlockNumber())
const p=await rd(PF,'function fetchPrice() returns (uint256)'); console.log('testnet BTC price', f(p))
console.log('troves', await rd(TM,'function getTroveOwnersCount() view returns (uint256)'), 'MUSD supply', f(await rd(MUSD,'function totalSupply() view returns (uint256)')))
console.log('TM pcv', await rd(TM,'function pcv() view returns (address)'))
console.log('veBTC supply', f(await rd(VE,'function supply() view returns (uint256)')), 'tokenId', await rd(VE,'function tokenId() view returns (uint256)'), 'voter', await rd(VE,'function voter() view returns (address)'))
console.log('veBTC split allowed(any)', await rd(VE,'function canSplit(address) view returns (bool)',['0x0000000000000000000000000000000000000000']))
const pcv=await rd(TM,'function pcv() view returns (address)'); if(!String(pcv).startsWith('ERR')){ const fr=await rd(pcv,'function feeRecipient() view returns (address)'); console.log('testnet feeRecipient (sMUSD?)', fr, await rd(fr,'function name() view returns (string)'), f(await rd(fr,'function totalSupply() view returns (uint256)'))) }
// price history testnet
const head=await t.getBlockNumber()
for (const d of [1,7,30]) { const bn=head-BigInt(Math.floor(d*86400/3.874)); try{ const r=await t.call({to:PF,data:'0x0fdb11cf',blockNumber:bn}); console.log(`-${d}d testnet price raw`, r.data? f(BigInt(r.data)) : r) }catch(e){console.log('hist err')} }
