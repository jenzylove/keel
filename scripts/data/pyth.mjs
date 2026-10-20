import { createPublicClient, http, parseAbi } from 'viem'
const ab=parseAbi(['function getPriceUnsafe(bytes32) view returns ((int64 price,uint64 conf,int32 expo,uint256 publishTime))'])
const P='0x2880aB155794e7179c9eE2e38200202908C17B43'
const ids={MUSD:'0x0617a9b725011a126a2b9fd53563f4236501f32cf76d877644b943394606c6de',BTC:'0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43'}
for (const [net,u] of [['mainnet','https://mezo.drpc.org'],['testnet','https://mezo-testnet.drpc.org']]) {
  const c=createPublicClient({transport:http(u,{fetchOptions:{headers:{'user-agent':'curl/8.5.0'}}})})
  for (const [k,id] of Object.entries(ids)) { try { const r=await c.readContract({address:P,abi:ab,functionName:'getPriceUnsafe',args:[id]}); const age=Math.floor(Date.now()/1000)-Number(r.publishTime); console.log(net,k,Number(r.price)*10**r.expo,'age_s',age) } catch(e){ console.log(net,k,'ERR',(e.shortMessage||'').slice(0,80)) } }
}
