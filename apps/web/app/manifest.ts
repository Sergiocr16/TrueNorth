import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TrueNorth',
    short_name: 'TrueNorth',
    description: 'Tu plan de hoy, con el porqué de cada cosa.',
    start_url: '/hoy',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F3F4F8',
    theme_color: '#F3F4F8',
    lang: 'es',
    categories: ['productivity', 'business'],
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/192m', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/512m', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
