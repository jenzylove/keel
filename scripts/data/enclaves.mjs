import { createPublicClient, http, parseAbi, formatUnits, keccak256, toHex } from 'viem'
const c=createPublicClient({ transport: http('https://mezo.drpc.org',{fetchOptions:{headers:{'user-agent':'curl/8.5.0'}}}) })
const rd=async(a,sig,args=[],bn)=>{try{const f=sig.match(/function (\w+)/)[1];return await c.readContract({address:a,abi:parseAbi([sig]),functionName:f,args,blockNumber:bn})}catch(e){return 'ERR '+(e.shortMessage||'').slice(0,80)}}
const E='0x2c5e9afbb670c4a61ac2dcad62c258ee2391389a'
const f=v=>typeof v==='bigint'?Number(formatUnits(v,18)).toLocaleString('en-US',{maximumFractionDigits:2}):v
for (const n of ['getTotalOutstandingDebt','totalMintedDebt','totalDebtBurned','totalPrincipal','totalInterestMinted','mintCap','maxRate','MAX_PLEDGED_VEBTC','MIN_MINIMUM_CR','totalOriginatorFeeMinted','getAccruedInterest']) console.log(n, f(await rd(E,`function ${n}() view returns (uint256)`)))
const role=await rd(E,'function ENCLAVE_ROLE() view returns (bytes32)'); const cnt=await rd(E,'function getRoleMemberCount(bytes32) view returns (uint256)',[role]); console.log('enclaves',cnt)
for (let i=0n;i<(typeof cnt==='bigint'?cnt:0n);i++){ const m=await rd(E,'function getRoleMember(bytes32,uint256) view returns (address)',[role,i]); console.log(' enclave',m) }
// find position ids via veBTC ids of whales: scan veBTC ids with big locks
const VE='0x3D4b1b884A7a1E59fE8589a3296EC8f8cBB6f279'
const L='function locked(uint256) view returns ((int128 amount,uint256 end,bool isPermanent,uint256 boost))'
const n=Number(await rd(VE,'function tokenId() view returns (uint256)'))
const big=[]
for(let s=1;s<=n;s+=300){ const ids=[]; for(let i=s;i<s+300&&i<=n;i++) ids.push(BigInt(i)); const rs=await Promise.all(ids.map(id=>rd(VE,L,[id]))); rs.forEach((r,k)=>{ if(typeof r!=='string' && r.amount>10n**18n) big.push([ids[k],r]) }) }
for(const [id,r] of big){ const owner=await rd(VE,'function ownerOf(uint256) view returns (address)',[id]); const pid=await rd(E,'function getVeBtcPositionId(uint256) view returns (bytes32)',[id]); let debt='',cr=''; if(typeof pid==='string'&&!pid.startsWith('ERR')&&pid!=='0x'+'0'.repeat(64)){debt=f(await rd(E,'function getPositionDebt(bytes32) view returns (uint256)',[pid])); cr=await rd(E,'function getPositionCR(bytes32) view returns (uint256)',[pid]); cr=typeof cr==='bigint'?Number(formatUnits(cr,16)).toFixed(0)+'%':cr}
 console.log('veBTC',id,'BTC',Number(formatUnits(r.amount,18)).toFixed(2),'perm',r.isPermanent,'owner',owner,'pos',typeof pid==='string'?pid.slice(0,10):pid,'debt',debt,'CR',cr) }
