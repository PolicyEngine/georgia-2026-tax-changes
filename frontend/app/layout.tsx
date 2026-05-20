import Script from 'next/script';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Providers from '@/components/Providers';

const GA_ID = 'G-2YHG89FY0N';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
});

const SITE_URL = 'https://policyengine.org/us/georgia-2026-tax-changes';

export const metadata: Metadata = {
  title: 'Georgia 2026 Tax Changes Calculator',
  description:
    "See how Georgia's 2026 tax changes (HB463: 4.99% flat rate, higher standard deduction and dependent exemption, new overtime + tip exclusions) affect your household and the state.",
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: 'Georgia 2026 Tax Changes Calculator',
    description:
      "See how Georgia's 2026 tax changes (HB463: 4.99% flat rate, higher standard deduction and dependent exemption, new overtime + tip exclusions) affect your household and the state.",
    url: SITE_URL,
    siteName: 'PolicyEngine',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Georgia 2026 Tax Changes Calculator',
    description:
      "See how Georgia's 2026 tax changes (HB463: 4.99% flat rate, higher standard deduction and dependent exemption, new overtime + tip exclusions) affect your household and the state.",
  },
  other: {
    'theme-color': '#2C7A7B', // CSS var not supported in meta tags, matches --theme-color
  },
  icons: {
    icon: '/favicon.svg',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className}>
      <head>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}
        </Script>
      </head>
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
