import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Cooling Solution',
    short_name: 'Cooling',
    description: 'Sistema de gestión para Cooling Solution HVAC',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b1220',
    theme_color: '#7c3aed',
    orientation: 'portrait',
    icons: [
      { src: '/logo.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/logo.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
