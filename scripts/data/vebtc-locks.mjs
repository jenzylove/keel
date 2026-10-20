import { createPublicClient, http, parseAbi, formatUnits } from 'viem'
const mk=u=>createPublicClient({ transport: http(u,{fetchOptions:{headers:{'user-agent':'curl/8.5.0'}}}) })
const c=mk('https://mezo.drpc.org')
const rd=async(cl,a,sig,args=[])=>{try{const f=sig.match(/function (\w+)/)[1];return await cl.readContract({address:a,abi:parseAbi([sig]),functionName:f,args})}catch(e){return 'ERR '+(e.shortMessage||'').slice(0,60)}}
const VE='0x3D4b1b884A7a1E59fE8589a3296EC8f8cBB6f279'
const f=v=>typeof v==='bigint'?Number(formatUnits(v,18)).toFixed(3):v
console.log('permanentLockBalance', f(await rd(c,VE,'function permanentLockBalance() view returns (uint256)')))
console.log('supply', f(await rd(c,VE,'function supply() view returns (uint256)')))
console.log('tokenId (count minted)', await rd(c,VE,'function tokenId() view returns (uint256)'))
console.log('totalVotingPower', f(await rd(c,VE,'function totalVotingPower() view returns (uint256)')), 'unboosted', f(await rd(c,VE,'function unboostedTotalVotingPower() view returns (uint256)')))
console.log('canSplit(any)', await rd(c,VE,'function canSplit(address) view returns (bool)',['0x0000000000000000000000000000000000000000']))
// sample locks
const n=Number(await rd(c,VE,'function tokenId() view returns (uint256)')); let perm=0,act=0,exp=0,amtP=0,amtA=0,amtE=0,types={},sizes=[]
const now=BigInt(Math.floor(Date.now()/1000))
const ids=[]; for(let i=n;i>0&&ids.length<400;i--) ids.push(BigInt(i))
const L='function locked(uint256) view returns ((int128 amount,uint256 end,bool isPermanent,uint256 boost))'
const res=await Promise.all(ids.map(id=>rd(c,VE,L,[id])))
for(const r of res){ if(typeof r==='string') continue; const a=Number(formatUnits(r.amount<0n?0n:r.amount,18)); if(a===0) continue; sizes.push(a); if(r.isPermanent){perm++;amtP+=a} else if(r.end>now){act++;amtA+=a} else {exp++;amtE+=a} }
sizes.sort((a,b)=>b-a)
console.log(`last 400 ids: permanent ${perm} (${amtP.toFixed(2)} BTC), active ${act} (${amtA.toFixed(2)}), expired-not-withdrawn ${exp} (${amtE.toFixed(2)})`)
console.log('top sizes', sizes.slice(0,10).map(x=>x.toFixed(2)).join(', '), 'median', sizes[Math.floor(sizes.length/2)]?.toFixed(4), 'count', sizes.length)
// testnet
const t=mk('https://mezo-testnet.drpc.org')
console.log('testnet chain', await t.getChainId())
