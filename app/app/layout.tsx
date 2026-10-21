import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { ThemeToggle } from '@/components/ThemeToggle';
import { KeelMark } from '@/components/KeelMark';

export const metadata: Metadata = {
  title: 'Keel — idle MUSD savings, lent outside redemptions',
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
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500&display=swap"
        />
        <script
          // Apply a saved theme before paint; fall back to the system setting.
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('keel-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body>
        <div className="wrap">
          <header className="bar">
            <Link href="/" className="mark" aria-label="Keel home">
              <KeelMark />
              Keel
            </Link>
            <nav className="nav">
              <Link href="/use">Borrow &amp; save</Link>
              <Link href="/demo">Demo</Link>
              <Link href="/proof">Proof</Link>
              <Link href="/data">Mezo data</Link>
              <a href="https://github.com/jenzylove/keel">Code</a>
              <ThemeToggle />
            </nav>
          </header>
        </div>
        <main>{children}</main>
        <div className="wrap">
          <footer className="footer">
            <span>Keel · built for the Mezo Buildathon · live product on Mezo testnet, readings from Mezo mainnet</span>
            <span className="mono">MIT</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
