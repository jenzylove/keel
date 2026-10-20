import { createPublicClient, http, parseAbi, formatUnits } from 'viem'
const c=createPublicClient({ transport: http('https://mezo.drpc.org',{fetchOptions:{headers:{'user-agent':'curl/8.5.0'}}}) })
const rd=async(a,sig,args=[])=>{try{const f=sig.match(/function (\w+)/)[1];return await c.readContract({address:a,abi:parseAbi([sig]),functionName:f,args})}catch(e){return 'ERR'}}
const CL='0xCC372B7E15535aB225fe17c1075831D38ef7aC1a', SB='0xB0C9A818A4E5d9184E5C9108a144E607dEa90100'
const t0=await rd(CL,'function token0() view returns (address)'), t1=await rd(CL,'function token1() view returns (address)')
const sym=async a=>await rd(a,'function symbol() view returns (string)'), dec=async a=>Number(await rd(a,'function decimals() view returns (uint8)'))
console.log('CLPool', await sym(t0), await sym(t1), 'tickSpacing', await rd(CL,'function tickSpacing() view returns (int24)'), 'liquidity', await rd(CL,'function liquidity() view returns (uint128)'))
const s0=await rd(CL,'function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,bool)')
if(s0!=='ERR'){ const d0=await dec(t0), d1=await dec(t1); const p=(Number(s0[0])/2**96)**2*10**(d0-d1); console.log('price token1 per token0', p, 'tick', s0[1]) }
const bal='function balanceOf(address) view returns (uint256)'
console.log('CL balances', formatUnits(await rd(t0,bal,[CL]),await dec(t0)), formatUnits(await rd(t1,bal,[CL]),await dec(t1)))
for (const n of ['owner','pool','position']) console.log('SB',n, await rd(SB,`function ${n}() view returns (address)`))
for (const n of ['targetCRatio','MCR','rebalanceThreshold','minRebuyAmount','cRatioTolerance']) { const v=await rd(SB,`function ${n}() view returns (uint256)`); console.log('SB',n, typeof v==='bigint'?formatUnits(v,18):v) }
console.log('SB native BTC', formatUnits(await c.getBalance({address:SB}),18))
