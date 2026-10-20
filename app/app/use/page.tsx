import type { Metadata } from 'next';
import { UseKeel } from './UseKeel';

export const metadata: Metadata = { title: 'Borrow & save — Keel' };

export default function Page() {
  return (
    <div className="wrap">
      <section className="first">
        <div className="kicker">Mezo testnet · your own wallet</div>
        <h1 style={{ marginTop: 18, maxWidth: '16ch', fontSize: 'clamp(36px, 5vw, 64px)' }}>Borrow MUSD without being redeemed.</h1>
        <p className="lede" style={{ marginTop: 20 }}>
          Lock BTC or deposit a veBTC NFT, borrow MUSD from idle savings, or save and earn what borrowers pay. Every button sends a
          real testnet transaction.
        </p>
        <p className="muted" style={{ fontSize: 15 }}>
          Need test BTC? <a href="https://faucet.test.mezo.org/">faucet.test.mezo.org</a>. No wallet? Try the{' '}
          <a href="/demo">no-wallet demo</a>.
        </p>
        <UseKeel />
      </section>
    </div>
  );
}
