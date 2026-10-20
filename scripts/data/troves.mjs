import { createPublicClient, http, parseAbi, formatUnits } from 'viem'
const c = createPublicClient({ transport: http('https://mezo.drpc.org') })
const TM='0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193', ST='0x8C5DB4C62BF29c1C4564390d10c20a47E0b2749f', PF='0xc5aC5A8892230E0A3e1c473881A2de7353fFcA88', MUSD='0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186'
const abi = parseAbi([
 'function totalSupply() view returns (uint256)',
 'function getSize() view returns (uint256)',
 'function getFirst() view returns (address)',
 'function getLast() view returns (address)',
 'function getNext(address) view returns (address)',
 'function fetchPrice() returns (uint256)',
 'function getTCR(uint256) view returns (uint256)',
 'function getTroveOwnersCount() view returns (uint256)',
 'function getCurrentICR(address,uint256) view returns (uint256)',
 'function getTroveDebt(address) view returns (uint256)',
 'function getTroveColl(address) view returns (uint256)',
 'function getEntireSystemDebt() view returns (uint256)',
 'function getEntireSystemColl() view returns (uint256)',
])
const r = async (address, functionName, args=[]) => { try { return (await c.simulateContract({address, abi, functionName, args})).result } catch(e) { try { return await c.readContract({address, abi, functionName, args}) } catch(e2){ return 'ERR '+(e2.shortMessage||e2.message).slice(0,120) } } }
const price = await r(PF,'fetchPrice')
console.log('block', await c.getBlockNumber())
console.log('BTC price', typeof price==='bigint'? formatUnits(price,18):price)
const sup = await r(MUSD,'totalSupply'); console.log('MUSD totalSupply', formatUnits(sup,18))
console.log('SortedTroves size', await r(ST,'getSize'))
console.log('TroveOwnersCount', await r(TM,'getTroveOwnersCount'))
for (const f of ['getEntireSystemDebt','getEntireSystemColl']) { const v=await r(TM,f); console.log(f, typeof v==='bigint'?formatUnits(v,18):v) }
const tcr = await r(TM,'getTCR',[price]); console.log('TCR', typeof tcr==='bigint'?formatUnits(tcr,16)+'%':tcr)
// walk troves from last (lowest ICR) via getLast? In Liquity, first=highest NICR, last=lowest
let a = await r(ST,'getFirst'); const rows=[]
while (a && a!=='0x0000000000000000000000000000000000000000' && rows.length<200) {
  const d=await r(TM,'getTroveDebt',[a]), co=await r(TM,'getTroveColl',[a]), icr=await r(TM,'getCurrentICR',[a,price])
  rows.push({a, debt: typeof d==='bigint'?Number(formatUnits(d,18)).toFixed(0):d, collBTC: typeof co==='bigint'?Number(formatUnits(co,18)).toFixed(4):co, icr: typeof icr==='bigint'?Number(formatUnits(icr,16)).toFixed(1)+'%':icr})
  a = await r(ST,'getNext',[a])
}
console.table(rows)
