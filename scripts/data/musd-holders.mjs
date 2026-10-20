import { createPublicClient, http, parseAbi, formatUnits } from 'viem'
const c = createPublicClient({ transport: http('https://mezo.drpc.org',{fetchOptions:{headers:{'user-agent':'curl/8.5.0'}}}) })
const MUSD='0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186'
const rd=async(a,sig,args=[],bn)=>{try{const f=sig.match(/function (\w+)/)[1];return await c.readContract({address:a,abi:parseAbi([sig]),functionName:f,args,blockNumber:bn})}catch(e){return 'ERR'}}
const f18=v=>typeof v==='bigint'?Number(formatUnits(v,18)).toLocaleString('en-US',{maximumFractionDigits:0}):v
const A={NTT:'0x7efb386675d75280D39Aae42964A6776DE0ee0bD',PCV:'0x391EcC7ffEFc48cff41D0F2Bb36e38b82180B993',SP:'0x73245Eff485aB3AAc1158B3c4d8f4b23797B0e32',BO:'0x44b1bac67dDA612a41a58AAf779143B181dEe031',TM:'0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193',IRM:'0x4a453700d157717Fe02fB62E7700ED7845048285',GAS:'0x3EB418BdBE95b4b9cf465ecfBD8424685ACD1Bc1',FEE:'0xb4D498029af77680cD1eF828b967f010d06C51CC',MULTISIG:'0x98D8899c3030741925BE630C710A98B57F397C7a',POOL_BTC:'0x52e604c44417233b6CcEDDDc0d640A405Caacefb'}
let sum=0n
for (const [k,a] of Object.entries(A)) { const b=await rd(MUSD,'function balanceOf(address) view returns (uint256)',[a]); if(typeof b==='bigint') sum+=b; console.log(k.padEnd(9),'bal',f18(b).padStart(12),' mintList',await rd(MUSD,'function mintList(address) view returns (bool)',[a]),' burnList',await rd(MUSD,'function burnList(address) view returns (bool)',[a])) }
console.log('sum listed', f18(sum))
for (const s of ['function getDepositorMUSDDeposit(address) view returns (uint256)','function getCompoundedMUSDDeposit(address) view returns (uint256)']) console.log('SP deposit of PCV', s.match(/function (\w+)/)[1], f18(await rd(A.SP,s,[A.PCV])))
console.log('NTT mode', await rd(A.NTT,'function getMode() view returns (uint8)'), '(0=LOCKING hub,1=BURNING)')
for (const s of ['function asset() view returns (address)','function totalAssets() view returns (uint256)','function totalSupply() view returns (uint256)','function name() view returns (string)']) console.log('FEE', s.match(/function (\w+)/)[1], f18(await rd(A.FEE,s)))
