import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { KeelMark } from '@/components/KeelMark';
import { addressUrl, deployed } from '@/lib/chains';
import { ConnectButton, WalletProvider } from '@/components/WalletProvider';
import { BarShade } from '@/components/BarShade';

export const metadata: Metadata = {
  title: 'Keel: borrow against your Bitcoin, never redeemed',
  description:
    "A drop-in strategy for Mezo's MUSD Savings Vault that lends its idle MUSD to BTC and veBTC holders, outside redemptions.",
  icons: { icon: '/favicon.svg' },
  metadataBase: new URL('https://keel-psi-seven.vercel.app'),
  openGraph: {
    title: 'Keel',
    description: "Idle MUSD savings, lent to BTC and veBTC holders outside Mezo's redemptions.",
    url: '/',
    siteName: 'Keel',
    type: 'website',
  },
  twitter: { card: 'summary', title: 'Keel', description: "Idle MUSD savings, lent outside Mezo's redemptions." },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap"
        />
      </head>
      <body>
        <WalletProvider>
        <BarShade />
        <div className="bar-shell">
          <header className="bar">
            <Link href="/" className="mark" aria-label="Keel home">
              <KeelMark />
              Keel
            </Link>
            <nav className="nav">
              <Link href="/app">App</Link>
              <Link href="/why">Why Keel</Link>
              <Link href="/proof">Proof</Link>
              <Link href="/data">Mezo data</Link>
              <a href="https://github.com/jenzylove/keel">Code</a>
            </nav>
            <div className="bar-right">
              <span className="net">Mezo testnet</span>
              <ConnectButton />
            </div>
          </header>
        </div>
        <main>{children}</main>
        <div className="wrap">
          <footer className="site-foot">
            <div className="foot-top">
              <div className="foot-brand">
                <Link href="/" className="mark" aria-label="Keel home">
                  <KeelMark />
                  Keel
                </Link>
                <p>Borrow against your Bitcoin without being redeemed. Savers earn the interest.</p>
                <Link className="btn" href="/app">
                  Open the app
                </Link>
              </div>
              <div className="foot-cols">
                <div>
                  <h4>Product</h4>
                  <Link href="/app">App</Link>
                  <Link href="/#live">Run a real loan</Link>
                  <Link href="/why">Why Keel</Link>
                </div>
                <div>
                  <h4>Proof</h4>
                  <Link href="/proof">Every transaction</Link>
                  <Link href="/data">Mezo data</Link>
                  <a href="https://github.com/jenzylove/keel">Code</a>
                </div>
                <div>
                  <h4>Testnet contracts</h4>
                  <a href={addressUrl(deployed.contracts.vault)}>Savings vault</a>
                  <a href={addressUrl(deployed.contracts.keelStrategy)}>KeelStrategy</a>
                  <a href={addressUrl(deployed.contracts.keelMarket)}>KeelMarket</a>
                </div>
              </div>
            </div>
            <div className="foot-word" aria-hidden="true">Keel</div>
            <div className="foot-bottom">
              <span>Built for the Mezo Buildathon · live on Mezo testnet, readings from Mezo mainnet</span>
              <span>MIT</span>
            </div>
          </footer>
        </div>
        </WalletProvider>
      </body>
    </html>
  );
}
