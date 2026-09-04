import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from '../lib/auth';
import { PreferencesProvider } from '../lib/preferences';
import { StoreProvider } from '../lib/store';
import './globals.css';

export const metadata: Metadata = {
  title: 'TrueNorth',
  description: 'Tu plan de hoy, con el porqué de cada cosa.',
  applicationName: 'TrueNorth',
  appleWebApp: {
    capable: true,
    title: 'TrueNorth',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F3F4F8' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

/**
 * The theme is applied before paint so an installed app never flashes the wrong
 * ground colour on launch. Reading localStorage can throw outright, so the
 * whole thing is wrapped and simply does nothing when storage is unavailable.
 */
const themeBootstrap = `
(function () {
  try {
    var raw = localStorage.getItem('truenorth.preferences');
    if (!raw) return;
    var p = JSON.parse(raw);
    if (['light', 'warm', 'dark', 'midnight', 'ambar'].indexOf(p.theme) !== -1) {
      document.documentElement.setAttribute('data-theme', p.theme);
    }
    if (['violeta', 'naranja', 'rosa', 'grafito'].indexOf(p.accent) !== -1) {
      document.documentElement.setAttribute('data-accent', p.accent);
    }
    if (p.reduceTransparency) {
      document.documentElement.setAttribute('data-reduce-transparency', 'true');
    }
    if (p.locale) document.documentElement.lang = p.locale;
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <PreferencesProvider>
          <AuthProvider>
            <StoreProvider>{children}</StoreProvider>
          </AuthProvider>
        </PreferencesProvider>
      </body>
    </html>
  );
}
