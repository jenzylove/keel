import { createPublicClient, http, parseAbi, formatUnits } from 'viem'
const c = createPublicClient({ transport: http('https://mezo.drpc.org',{fetchOptions:{headers:{'user-agent':'curl/8.5.0'}}}) })
const MUSD='0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186', PCV='0x391EcC7ffEFc48cff41D0F2Bb36e38b82180B993', SP='0x73245Eff485aB3AAc1158B3c4d8f4b23797B0e32'
const rd=async(a,sig,args=[],bn)=>{try{const f=sig.match(/function (\w+)/)[1];return await c.readContract({address:a,abi:parseAbi([sig]),functionName:f,args,blockNumber:bn})}catch(e){return 'ERR'}}
const f18=v=>typeof v==='bigint'?Number(formatUnits(v,18)).toLocaleString('en-US',{maximumFractionDigits:2}):v
for (const s of ['function debtToPay() view returns (uint256)','function feeRecipient() view returns (address)','function feeSplitPercentage() view returns (uint8)','function BOOTSTRAP_LOAN() view returns (uint256)','function governanceTimeDelay() view returns (uint256)'])
  console.log('PCV', s.match(/function (\w+)/)[1], (await rd(PCV,s)).toString?.() ?? '', f18(await rd(PCV,s)))
const bal='function balanceOf(address) view returns (uint256)'
console.log('MUSD bal PCV', f18(await rd(MUSD,bal,[PCV])))
console.log('SP total deposits', f18(await rd(SP,'function getTotalMUSDDeposits() view returns (uint256)')))
const fr=await rd(PCV,'function feeRecipient() view returns (address)'); if(fr!=='ERR'){console.log('feeRecipient MUSD bal',f18(await rd(MUSD,bal,[fr]))); console.log('feeRecipient totalAssets', f18(await rd(fr,'function totalAssets() view returns (uint256)')))}
// pools
const pabi=['function token0() view returns (address)','function token1() view returns (address)','function getReserves() view returns (uint256,uint256,uint256)','function stable() view returns (bool)','function getAmountOut(uint256,address) view returns (uint256)']
const sym=async a=> a.toLowerCase()==='0x7b7c000000000000000000000000000000000000'?'BTC':await rd(a,'function symbol() view returns (string)')
const dec=async a=> Number(await rd(a,'function decimals() view returns (uint8)'))
for (const [n,P] of [['MUSD/BTC','0x52e604c44417233b6CcEDDDc0d640A405Caacefb'],['MUSD/mUSDC','0xEd812AEc0Fecc8fD882Ac3eccC43f3aA80A6c356'],['MUSD/mUSDT','0x10906a9E9215939561597b4C8e4b98F93c02031A']]) {
  const t0=await rd(P,pabi[0]), t1=await rd(P,pabi[1]), r=await rd(P,pabi[2]), st=await rd(P,pabi[3])
  const d0=await dec(t0), d1=await dec(t1)
  console.log(n, await sym(t0), await sym(t1), 'stable',st, 'reserves', r==='ERR'?r:[formatUnits(r[0],d0),formatUnits(r[1],d1)])
  for (const amt of [1000, 10000, 100000]) { const out=await rd(P,pabi[4],[BigInt(amt)*10n**18n, MUSD]); if(out!=='ERR'){ const other=t0.toLowerCase()===MUSD.toLowerCase()?t1:t0; console.log('  sell',amt,'MUSD ->',formatUnits(out,await dec(other)), await sym(other)) } }
}
const tot=await rd(MUSD,'function totalSupply() view returns (uint256)'); console.log('MUSD supply', f18(tot))
// history of PCV debt
const head=await c.getBlockNumber()
for (const d of [0,7,30,60,120,180]) { const bn=head-BigInt(Math.floor(d*86400/3.874)); console.log(`-${d}d debtToPay`, f18(await rd(PCV,'function debtToPay() view returns (uint256)',[],bn)), 'supply', f18(await rd(MUSD,'function totalSupply() view returns (uint256)',[],bn))) }
