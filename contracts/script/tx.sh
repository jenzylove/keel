#!/usr/bin/env bash
# tx <label> <to> <sig> [args...]  — sends a testnet transaction, waits for the
# receipt, prints "label ok|REVERTED <hash>". Extra cast flags via TX_FLAGS.
tx() {
  local label=$1; shift
  local h st
  h=$(cast send "$@" ${TX_FLAGS:-} --rpc-url "$MEZO_TESTNET_RPC" --private-key "${TX_PK:-$DEPLOYER_PK}" --legacy --async 2>&1) || { echo "$label FAILED-TO-SEND $(echo "$h" | grep -oE 'data: "0x[0-9a-f]*"|revert[^,]*' | head -1)"; return 1; }
  for _ in $(seq 1 30); do
    if st=$(cast receipt "$h" status --rpc-url "$MEZO_TESTNET_RPC" 2>/dev/null); then
      if [[ "$st" == 1* || "$st" == true* ]]; then echo "$label ok $h"; return 0; fi
      echo "$label REVERTED $h"; return 1
    fi
    sleep 2
  done
  echo "$label NO-RECEIPT $h"; return 1
}
