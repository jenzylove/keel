import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { ThemeToggle } from '@/components/ThemeToggle';
import { KeelMark } from '@/components/KeelMark';
import { addressUrl, deployed } from '@/lib/chains';
import { ConnectButton, WalletProvider } from '@/components/WalletProvider';

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,500..900&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap"
        />
        <script
          // Apply a saved theme before paint. Dark is the default.
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('keel-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body>
        <WalletProvider>
        <div className="wrap">
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
              <ThemeToggle />
            </nav>
            <div className="bar-right">
              <span className="net">Mezo testnet</span>
              <ConnectButton />
            </div>
          </header>
        </div>
        <main>{children}</main>
        <div className="wrap">
          <footer className="footer">
            <span>Keel · built for the Mezo Buildathon · live product on Mezo testnet, readings from Mezo mainnet</span>
            <span className="mono">MIT</span>
            <span style={{ flexBasis: '100%' }}>
              <Link href="/proof">Proof</Link> · <Link href="/why">Why Keel</Link> · <Link href="/data">Mezo data</Link> ·{' '}
              <a href="https://github.com/jenzylove/keel">Code</a> · <a href={addressUrl(deployed.contracts.vault)}>Savings vault</a> ·{' '}
              <a href={addressUrl(deployed.contracts.keelStrategy)}>KeelStrategy</a> ·{' '}
              <a href={addressUrl(deployed.contracts.keelMarket)}>KeelMarket</a>
            </span>
          </footer>
        </div>
        </WalletProvider>
      </body>
    </html>
  );
}
