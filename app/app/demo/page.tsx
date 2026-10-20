import type { Metadata } from 'next';
import { DemoRunner } from './DemoRunner';

export const metadata: Metadata = { title: 'Demo — Keel' };

export default function Page() {
  return (
    <div className="wrap">
      <section className="first">
        <div className="kicker">No wallet, no sign-up · real testnet transactions</div>
        <h1 style={{ marginTop: 18, maxWidth: '16ch', fontSize: 'clamp(36px, 5vw, 64px)' }}>Watch a loan go round once.</h1>
        <p className="lede" style={{ marginTop: 20 }}>
          Press the button and Keel&apos;s demo wallet does it for real on Mezo testnet. It locks BTC, borrows MUSD from the
          savings vault&apos;s idle money, repays with interest that goes to savers, and gets its BTC back. Each step links to the
          explorer.
        </p>
        <DemoRunner />
      </section>
    </div>
  );
}
