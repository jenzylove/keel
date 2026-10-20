#!/usr/bin/env bash
# Replaces the testnet KeelMarket (and its peg oracle) behind the existing
# KeelStrategy. The strategy only accepts a new market while nothing is lent,
# so close every loan first. Updates deployments/testnet.json and keeps the old
# market under "history".
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DEPLOYER_PK:?}" "${MEZO_TESTNET_RPC:?}"
R="$MEZO_TESTNET_RPC"
USE=()
[[ -n "${FORGE_SOLC:-}" ]] && USE=(--use "$FORGE_SOLC")
OUT=../deployments/testnet.json
. script/tx.sh

ME=$(cast wallet address --private-key "$DEPLOYER_PK")
STRAT=$(jq -r .contracts.keelStrategy "$OUT")
OLD_MARKET=$(jq -r .contracts.keelMarket "$OUT")
MUSD=$(jq -r .mezo.musd "$OUT"); BTC=$(jq -r .mezo.btc "$OUT"); VE=$(jq -r .mezo.veBTC "$OUT")
VOTER=$(jq -r .mezo.voter "$OUT"); PRICE_FEED=$(jq -r .mezo.priceFeed "$OUT")
# Testnet MUSD/mUSDC basic stable pool; its quote() gives a time-weighted price.
PEG_POOL=0x525F049A4494dA0a6c87E3C4df55f9929765Dc3e
MUSDC=0xe1a26db653708A2AD8F824E92Db9852410e33A59

create() {
  local tx addr
  tx=$(cast send --rpc-url "$R" --private-key "$DEPLOYER_PK" --legacy --async --create "$1")
  for _ in $(seq 1 30); do
    if addr=$(cast receipt "$tx" contractAddress --rpc-url "$R" 2>/dev/null) && [[ -n "$addr" ]]; then
      echo "$addr $tx"; return
    fi
    sleep 2
  done
  echo "no receipt: $tx" >&2; exit 1
}

forge build "${USE[@]}" >/dev/null
bc() { jq -r '.bytecode.object' "out/$1.sol/$2.json"; }

read -r ORACLE ORACLE_TX < <(create "$(bc PegOracles BasicPoolTwapPegOracle)$(cast abi-encode 'c(address,address,address,uint256)' $PEG_POOL $MUSD $MUSDC 48 | cut -c3-)")
ARGS=$(cast abi-encode 'c((address,address,address,address,address,address,address),address,(uint16,uint16,uint16)[3],(uint256,uint256,uint256,uint256),(uint256,uint256,uint256,uint256,uint256),uint256)' \
  "($MUSD,$BTC,$VE,$VOTER,$PRICE_FEED,$ORACLE,$STRAT)" "$ME" \
  "[(5000,6500,500),(4500,6000,800),(4000,5500,1000)]" \
  "(30000000000000000,40000000000000000,750000000000000000,800000000000000000)" \
  "(995000000000000000,985000000000000000,40000000000000000,10000000000000000,604800)" \
  10000000000000000000)
read -r MARKET MARKET_TX < <(create "$(bc KeelMarket KeelMarket)${ARGS:2}")
SET_TX=$(tx "setMarket" "$STRAT" "setMarket(address)" "$MARKET" | awk '{print $3}')

jq --arg m "$MARKET" --arg o "$ORACLE" --arg mt "$MARKET_TX" --arg ot "$ORACLE_TX" --arg st "$SET_TX" --arg old "$OLD_MARKET" \
  '.history += [{note: "Market replaced by the peg-oracle version (Pyth dropped); all its loans were closed first.", keelMarket: $old}]
   | .contracts.keelMarket = $m | .contracts.pegOracle = $o
   | .txs.keelMarket = $mt | .txs.pegOracle = $ot | .txs.setMarket = $st
   | .params.peg = {source: "MUSD/mUSDC basic pool quote(), 48 observations (~24h)", startBelow: "0.995", fullAt: "0.985", maxPremium: "4%", maxStep: "1%", interval: "7 days"}
   | del(.mezo.pyth)' "$OUT" > "$OUT.tmp" && mv "$OUT.tmp" "$OUT"
jq .contracts "$OUT"
