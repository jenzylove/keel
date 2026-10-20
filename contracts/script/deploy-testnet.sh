#!/usr/bin/env bash
# Deploys Keel on Mezo testnet:
#   1. our own copy of Mezo's MUSDSavingsRate vault (behind an ERC1967 proxy we own)
#   2. KeelStrategy, KeelMarket
#   3. wires them and plugs KeelStrategy into the vault with setStrategy
# Writes addresses and transaction hashes to deployments/testnet.json.
#
# Needs: DEPLOYER_PK, MEZO_TESTNET_RPC (see ../.env), forge/cast, node, and
# SOLC_833 pointing at a solc-js 0.8.33 package. FORGE_SOLC may point at a solc
# 0.8.28 binary when compilers can't be downloaded.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${DEPLOYER_PK:?}" "${MEZO_TESTNET_RPC:?}"
R="$MEZO_TESTNET_RPC"
USE=()
[[ -n "${FORGE_SOLC:-}" ]] && USE=(--use "$FORGE_SOLC")
OUT=../deployments/testnet.json

# Mezo testnet (chain 31611)
MUSD=0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503
BTC=0x7b7C000000000000000000000000000000000000
VE=0xB63fcCd03521Cf21907627bd7fA465C129479231
VOTER=0x72F8dd7F44fFa19E45955aa20A5486E8EB255738
PRICE_FEED=0x86bCF0841622a5dAC14A313a15f96A95421b9366
PYTH=0x2880aB155794e7179c9eE2e38200202908C17B43
MUSD_FEED=0x0617a9b725011a126a2b9fd53563f4236501f32cf76d877644b943394606c6de
FORWARDER=0x000000000000000000000000000000000000dEaD

ME=$(cast wallet address --private-key "$DEPLOYER_PK")

# Mezo testnet RPC sometimes drops receipt polling; send async, then poll.
send() {
  local tx
  tx=$(cast send "$@" --rpc-url "$R" --private-key "$DEPLOYER_PK" --legacy --async)
  for _ in $(seq 1 30); do
    if st=$(cast receipt "$tx" status --rpc-url "$R" 2>/dev/null); then
      [[ "$st" == 1* || "$st" == true* ]] || { echo "reverted: $tx ($st)" >&2; exit 1; }
      echo "$tx"; return
    fi
    sleep 2
  done
  echo "no receipt: $tx" >&2; exit 1
}

create() { # create <bytecode-with-args>
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

if [[ -n "${VAULT:-}" ]]; then
  # Re-deploying Keel against an existing vault: the vault's setStrategy call
  # below migrates principal out of the previous strategy.
  echo "== reusing vault $VAULT"
  SMR_IMPL=$(jq -r .contracts.vaultImplementation "$OUT"); SMR_IMPL_TX=$(jq -r .txs.vaultImplementation "$OUT")
  VAULT_TX=$(jq -r .txs.vaultProxy "$OUT"); IDLE=$(jq -r .contracts.idleStrategy "$OUT")
else
  echo "== vault copy"
  node script/compile-vendor.js "$SOLC_833" > /tmp/smr.json
  SMR_BC=$(jq -r .bytecode /tmp/smr.json)
  read -r SMR_IMPL SMR_IMPL_TX < <(create "$SMR_BC$(cast abi-encode 'c(address)' $FORWARDER | cut -c3-)")
  INIT=$(cast calldata "initialize(address)" $MUSD)
  read -r VAULT VAULT_TX < <(create "$(bc ERC1967Proxy ERC1967Proxy)$(cast abi-encode 'c(address,bytes)' "$SMR_IMPL" "$INIT" | cut -c3-)")
  IDLE=$(cast call "$VAULT" "strategy()(address)" --rpc-url "$R")
fi

echo "== KeelStrategy"
read -r STRAT STRAT_TX < <(create "$(bc KeelStrategy KeelStrategy)$(cast abi-encode 'c(address,address,address,uint256,uint256)' $MUSD "$VAULT" "$ME" 2000 1000 | cut -c3-)")

echo "== KeelMarket"
ARGS=$(cast abi-encode 'c((address,address,address,address,address,address,address),address,(uint16,uint16,uint16)[3],(uint256,uint256,uint256,uint256),(bytes32,uint256,uint256,uint256,uint256,uint256,uint256),uint256)' \
  "($MUSD,$BTC,$VE,$VOTER,$PRICE_FEED,$PYTH,$STRAT)" "$ME" \
  "[(5000,6500,500),(4500,6000,800),(4000,5500,1000)]" \
  "(30000000000000000,40000000000000000,750000000000000000,800000000000000000)" \
  "($MUSD_FEED,3600,995000000000000000,985000000000000000,40000000000000000,10000000000000000,604800)" \
  10000000000000000000)
read -r MARKET MARKET_TX < <(create "$(bc KeelMarket KeelMarket)${ARGS:2}")

echo "== wire"
SET_MARKET_TX=$(send "$STRAT" "setMarket(address)" "$MARKET")
SET_STRATEGY_TX=$(send "$VAULT" "setStrategy(address)" "$STRAT")

jq -n --arg vault "$VAULT" --arg vaultImpl "$SMR_IMPL" --arg idle "$IDLE" --arg strategy "$STRAT" --arg market "$MARKET" \
  --arg vaultTx "$VAULT_TX" --arg vaultImplTx "$SMR_IMPL_TX" --arg strategyTx "$STRAT_TX" --arg marketTx "$MARKET_TX" \
  --arg setMarketTx "$SET_MARKET_TX" --arg setStrategyTx "$SET_STRATEGY_TX" \
  --arg musd $MUSD --arg btc $BTC --arg ve $VE --arg voter $VOTER --arg priceFeed $PRICE_FEED --arg pyth $PYTH \
  '{chainId:31611, contracts:{vault:$vault, vaultImplementation:$vaultImpl, idleStrategy:$idle, keelStrategy:$strategy, keelMarket:$market},
    mezo:{musd:$musd, btc:$btc, veBTC:$ve, voter:$voter, priceFeed:$priceFeed, pyth:$pyth},
    txs:{vaultImplementation:$vaultImplTx, vaultProxy:$vaultTx, keelStrategy:$strategyTx, keelMarket:$marketTx, setMarket:$setMarketTx, setStrategy:$setStrategyTx}}' > "$OUT"
cat "$OUT"
