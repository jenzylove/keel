#!/usr/bin/env bash
# Deploys Keel on Mezo testnet and writes deployments/testnet.json.
#
#   - Fresh:  our own copy of Mezo's MUSDSavingsRate vault (behind an ERC1967
#             proxy we own), then the peg oracle, KeelStrategy and KeelMarket.
#   - VAULT=<address>: reuse that vault. The vault's setStrategy call migrates
#             the savings out of the previous strategy, which only works once
#             every loan in the previous market is closed.
#
# Keel is governed by the vault's owner, so the deployer must own the vault.
# Needs DEPLOYER_PK and MEZO_TESTNET_RPC (see ../.env); SOLC_833 (a solc-js
# 0.8.33 package) for a fresh vault; FORGE_SOLC if compilers can't download.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${DEPLOYER_PK:?}" "${MEZO_TESTNET_RPC:?}"
R="$MEZO_TESTNET_RPC"
USE=()
[[ -n "${FORGE_SOLC:-}" ]] && USE=(--use "$FORGE_SOLC")
OUT=../deployments/testnet.json
. script/tx.sh

# Mezo testnet (chain 31611)
MUSD=0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503
BTC=0x7b7C000000000000000000000000000000000000
VE=0xB63fcCd03521Cf21907627bd7fA465C129479231
VOTER=0x72F8dd7F44fFa19E45955aa20A5486E8EB255738
PRICE_FEED=0x86bCF0841622a5dAC14A313a15f96A95421b9366
FORWARDER=0x000000000000000000000000000000000000dEaD
# MUSD/mUSDC basic stable pool: its quote() gives the peg oracle's price.
PEG_POOL=0x525F049A4494dA0a6c87E3C4df55f9929765Dc3e
MUSDC=0xe1a26db653708A2AD8F824E92Db9852410e33A59
# Config changes wait this long. Short on testnet so the timelock can be shown;
# the mainnet proposal is 48 hours.
CONFIG_DELAY=600

create() { # create <bytecode-with-args> -> "address txhash"
  local tx addr
  tx=$(cast send --rpc-url "$R" --private-key "$DEPLOYER_PK" --legacy --async --create "$1")
  for _ in $(seq 1 45); do
    if addr=$(cast receipt "$tx" contractAddress --rpc-url "$R" 2>/dev/null) && [[ -n "$addr" ]]; then
      echo "$addr $tx"; return
    fi
    sleep 2
  done
  echo "no receipt: $tx" >&2; exit 1
}

forge build "${USE[@]}" >/dev/null
bc() { jq -r '.bytecode.object' "out/$1.sol/$2.json"; }

PREV='{}'
[[ -f "$OUT" ]] && PREV=$(cat "$OUT")

if [[ -n "${VAULT:-}" ]]; then
  echo "== reusing vault $VAULT"
  VAULT_TX=$(jq -r '.txs.vaultProxy // ""' <<<"$PREV")
  SMR_IMPL=$(jq -r '.contracts.vaultImplementation // ""' <<<"$PREV")
  SMR_IMPL_TX=$(jq -r '.txs.vaultImplementation // ""' <<<"$PREV")
  IDLE=$(jq -r '.contracts.idleStrategy // ""' <<<"$PREV")
else
  : "${SOLC_833:?}"
  echo "== vault copy"
  node script/compile-vendor.js "$SOLC_833" > /tmp/smr.json
  SMR_BC=$(jq -r .bytecode /tmp/smr.json)
  read -r SMR_IMPL SMR_IMPL_TX < <(create "$SMR_BC$(cast abi-encode 'c(address)' $FORWARDER | cut -c3-)")
  INIT=$(cast calldata "initialize(address)" $MUSD)
  read -r VAULT VAULT_TX < <(create "$(bc ERC1967Proxy ERC1967Proxy)$(cast abi-encode 'c(address,bytes)' "$SMR_IMPL" "$INIT" | cut -c3-)")
  IDLE=$(cast call "$VAULT" "strategy()(address)" --rpc-url "$R")
fi

echo "== peg oracle"
read -r ORACLE ORACLE_TX < <(create "$(bc PegOracles BasicPoolTwapPegOracle)$(cast abi-encode 'c(address,address,address,uint256)' $PEG_POOL $MUSD $MUSDC 48 | cut -c3-)")

echo "== KeelStrategy"
read -r STRAT STRAT_TX < <(create "$(bc KeelStrategy KeelStrategy)$(cast abi-encode 'c(address,address,uint256,uint256)' $MUSD "$VAULT" 2000 1000 | cut -c3-)")

echo "== KeelMarket"
ARGS=$(cast abi-encode 'c((address,address,address,address,address,address,address),((uint16,uint16,uint16)[3],(uint256,uint256,uint256,uint256),(uint256,uint256,uint256,uint256,uint256),address,uint256),uint256)' \
  "($MUSD,$BTC,$VE,$VOTER,$PRICE_FEED,$ORACLE,$STRAT)" \
  "([(5000,6500,500),(4500,6000,800),(4000,5500,1000)],(30000000000000000,40000000000000000,750000000000000000,800000000000000000),(995000000000000000,985000000000000000,40000000000000000,10000000000000000,604800),$ORACLE,10000000000000000000)" \
  $CONFIG_DELAY)
read -r MARKET MARKET_TX < <(create "$(bc KeelMarket KeelMarket)${ARGS:2}")

echo "== wire"
SET_MARKET_TX=$(tx "setMarket" "$STRAT" "setMarket(address)" "$MARKET" | awk '{print $3}')
SET_STRATEGY_TX=$(tx "setStrategy" "$VAULT" "setStrategy(address)" "$STRAT" | awk '{print $3}')

OLD=$(jq -c '{keelStrategy: .contracts.keelStrategy, keelMarket: .contracts.keelMarket, pegOracle: .contracts.pegOracle} | with_entries(select(.value != null))' <<<"$PREV")
jq -n --argjson prev "$PREV" --argjson old "$OLD" \
  --arg vault "$VAULT" --arg vaultImpl "$SMR_IMPL" --arg idle "$IDLE" --arg strategy "$STRAT" --arg market "$MARKET" --arg oracle "$ORACLE" \
  --arg vaultTx "$VAULT_TX" --arg vaultImplTx "$SMR_IMPL_TX" --arg strategyTx "$STRAT_TX" --arg marketTx "$MARKET_TX" --arg oracleTx "$ORACLE_TX" \
  --arg setMarketTx "$SET_MARKET_TX" --arg setStrategyTx "$SET_STRATEGY_TX" \
  --arg musd $MUSD --arg btc $BTC --arg ve $VE --arg voter $VOTER --arg priceFeed $PRICE_FEED --argjson delay $CONFIG_DELAY \
  '{chainId: 31611, explorer: "https://explorer.test.mezo.org",
    contracts: {vault: $vault, vaultImplementation: $vaultImpl, idleStrategy: $idle, keelStrategy: $strategy, keelMarket: $market, pegOracle: $oracle},
    mezo: {musd: $musd, btc: $btc, veBTC: $ve, voter: $voter, priceFeed: $priceFeed},
    params: {governance: "the vault owner, read live", configDelaySeconds: $delay, maxLentBps: 2000, reserveBps: 1000,
      risk: {btc: [5000, 6500, 500], veTimed: [4500, 6000, 800], vePermanent: [4000, 5500, 1000]},
      rates: {base: "3%", slope1: "4%", slope2: "75%", kink: "80%"},
      peg: {source: "MUSD/mUSDC basic pool quote(), 48 observations (~24h)", startBelow: "0.995", fullAt: "0.985", maxPremium: "4%", maxStep: "1%", interval: "7 days"},
      minLoan: "10 MUSD (testnet only; mainnet proposal is 100)"},
    txs: (($prev.txs // {}) + {vaultImplementation: $vaultImplTx, vaultProxy: $vaultTx, pegOracle: $oracleTx, keelStrategy: $strategyTx, keelMarket: $marketTx, setMarket: $setMarketTx, setStrategy: $setStrategyTx}),
    history: (($prev.history // []) + (if ($old | length) > 0 then [{note: "Replaced by the deployment above; its savings moved over with setStrategy.", contracts: $old}] else [] end))}' > "$OUT"
jq .contracts "$OUT"
