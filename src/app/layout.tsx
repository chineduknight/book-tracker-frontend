import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Avuneri', template: '%s · Avuneri' },
  description:
    'Avuneri is a private library and reading companion: your books, your reading, your notes and your loans.',
  applicationName: 'Avuneri',
  // A private app: keep every page out of search engines (also X-Robots-Tag, next.config.ts).
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Lets content extend under the notch / home indicator; the shell pads with safe-area insets.
  viewportFit: 'cover',
  // Shrinks the layout when the on-screen keyboard opens, so the fixed bottom bar rises above it.
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f3ec' },
    { media: '(prefers-color-scheme: dark)', color: '#141311' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Every page renders per request: the CSP nonce is per request, and private pages must never be
  // prerendered or cached.
  await connection();
  return (
    <html lang="en">
      <body>
        <a
          href="#main-content"
          className="sr-only rounded-lg bg-accent px-4 py-3 font-medium text-on-accent focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
