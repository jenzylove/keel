import { createPublicClient, http, parseAbi, formatUnits } from 'viem'
const c = createPublicClient({ transport: http('https://mezo.drpc.org',{fetchOptions:{headers:{'user-agent':'curl/8.5.0'}}}) })
const TM='0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193', BO='0x44b1bac67dDA612a41a58AAf779143B181dEe031', MUSD='0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186'
const names=['pcv','pcvAddress','interestRateManager','stabilityPool','troveManager','borrowerOperations','activePool','defaultPool','gasPoolAddress','collSurplusPool','sortedTroves','priceFeed','musdToken','owner','governance']
for (const [lbl,a] of [['TM',TM],['BO',BO],['MUSD',MUSD]]) for (const n of names) {
  try { const v=await c.readContract({address:a,abi:parseAbi([`function ${n}() view returns (address)`]),functionName:n}); console.log(lbl,n,v) } catch {}
}
const head=await c.getBlockNumber()
const cnt=parseAbi(['function getTroveOwnersCount() view returns (uint256)','function getEntireSystemDebt() view returns (uint256)'])
for (const d of [0,7,14,30,45,60,90,120,150,180,240,300]) {
  const bn=head-BigInt(Math.floor(d*86400/3.874))
  try { const n=await c.readContract({address:TM,abi:cnt,functionName:'getTroveOwnersCount',blockNumber:bn}); const dbt=await c.readContract({address:TM,abi:cnt,functionName:'getEntireSystemDebt',blockNumber:bn}); console.log(`-${d}d`,bn,'troves',n,'debt',Number(formatUnits(dbt,18)).toFixed(0)) } catch(e){ console.log(`-${d}d ERR`,(e.shortMessage||'').slice(0,100)) }
}
