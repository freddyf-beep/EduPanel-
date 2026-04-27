import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'EduPanel',
    short_name: 'EduPanel',
    description: 'Plataforma inteligente de planificación docente.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#f43f5e', // Color rosado/violeta principal
    icons: [
      {
        src: '/logos/logo-3.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/logos/logo-3.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
