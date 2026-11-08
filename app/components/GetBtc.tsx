'use client';

const MEZO_BRIDGE = 'https://mezo.org/overview';
const SWAP = 'https://app.uniswap.org/swap?outputCurrency=0x18084fbA666a33d37592fA2633fD49a74DD93a88';
const BRIDGE_DOCS = 'https://mezo.org/docs/users/getting-started/bridging';

/** How a new user gets BTC onto Mezo: free test BTC to try Keel now, or real
 *  BTC through Mezo's own bridge. Keel never holds funds in transit. With no
 *  faucet (mainnet) only the bridge path shows. */
export function GetBtc({ open, empty, onRefresh, faucet }: { open: boolean; empty: boolean; onRefresh?: () => void; faucet: string | null }) {
  return (
    <details className={`getbtc ${empty ? 'empty' : ''}`} open={open}>
      <summary>{empty ? 'This wallet has no BTC on Mezo yet. Here is how to get some.' : 'New to Mezo? How to get BTC'}</summary>
      <div className={`getbtc-paths ${faucet ? '' : 'one'}`}>
        {faucet && (
        <div>
          <h4>Try Keel now, free</h4>
          <ol>
            <li>Keel runs on Mezo testnet, so test BTC costs nothing.</li>
            <li>Get some from Mezo&apos;s faucet with this wallet&apos;s address.</li>
            <li>Come back and borrow. It takes about a minute.</li>
          </ol>
          <div className="getbtc-actions">
            <a className="btn small" href={faucet} target="_blank" rel="noreferrer">
              Get test BTC ↗
            </a>
            {onRefresh && (
              <button className="linkish" onClick={onRefresh}>
                I have it, refresh
              </button>
            )}
          </div>
        </div>
        )}
        <div>
          <h4>Bring real BTC to Mezo</h4>
          <ol>
            <li>
              On Ethereum, swap USDC or ETH for tBTC, WBTC or cbBTC.{' '}
              <a href={SWAP} target="_blank" rel="noreferrer">
                Swap ↗
              </a>
            </li>
            <li>
              Open Mezo&apos;s own bridge, connect the same wallet and deposit it. It arrives on Mezo as BTC.{' '}
              <a href={MEZO_BRIDGE} target="_blank" rel="noreferrer">
                Mezo bridge ↗
              </a>
            </li>
            <li>Wait 30 to 60 minutes, and keep a little BTC for gas.</li>
          </ol>
          <p className="getbtc-note">
            Bridging can&apos;t be undone, so check the address and that the destination is Mezo.{' '}
            <a href={BRIDGE_DOCS} target="_blank" rel="noreferrer">
              Mezo&apos;s guide ↗
            </a>
          </p>
          {!faucet && onRefresh && (
            <div className="getbtc-actions">
              <button className="linkish" onClick={onRefresh}>
                I have it, refresh
              </button>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
