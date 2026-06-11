/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Build estricto: si TS falla, el build falla. Antes estaba en true para
    // ocultar errores heredados — todos arreglados al 2026-04-29 (alfa cerrada).
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  // Next.js 16 usa Turbopack por defecto en producción.
  // Declaramos turbopack: {} para indicar que somos conscientes y no hay config especial.
  turbopack: {},
  webpack: (config, { dev }) => {
    if (dev) {
      // Limitar el cache de webpack en dev para evitar el leak de memoria
      // con módulos nativos pesados (pdfjs-dist, firebase-admin, mammoth, jszip)
      config.cache = {
        type: "filesystem",
        maxMemoryGenerations: 1,
      }
    }
    return config
  },
  // Redirects 308 desde el laboratorio Stitch al shell unificado de evaluaciones.
  // Next.js preserva automáticamente los query params entrantes cuando el `source`
  // no declara params propios, así `pruebaId`, `guiaId`, `curso`, `unidadId`,
  // `unidadNombre` y `asignatura` siguen viajando hacia `/evaluaciones`.
  // Refs: Req 11.1 – 11.7 (pruebas-guias-unificado).
  async redirects() {
    return [
      {
        source: "/dashboard-v2",
        destination: "/",
        permanent: true,
      },
      {
        source: "/actividades-v2",
        destination: "/actividades",
        permanent: true,
      },
      {
        source: "/calificaciones-v2",
        destination: "/calificaciones",
        permanent: true,
      },
      {
        source: "/cronograma-v2",
        destination: "/cronograma",
        permanent: true,
      },
      {
        source: "/libro-clases-v2",
        destination: "/libro-clases",
        permanent: true,
      },
      {
        source: "/modulos-v2",
        destination: "/modulos",
        permanent: true,
      },
      {
        source: "/perfil-360-v2",
        destination: "/perfil-360",
        permanent: true,
      },
      {
        source: "/soporte-v2",
        destination: "/soporte",
        permanent: true,
      },
      {
        source: "/ver-unidad-v3",
        destination: "/ver-unidad",
        permanent: true,
      },
      {
        source: "/evaluaciones-stitch",
        destination: "/evaluaciones?tab=pruebas",
        permanent: true,
      },
      {
        source: "/evaluaciones-stitch/pruebas",
        destination: "/evaluaciones?tab=pruebas",
        permanent: true,
      },
      {
        source: "/evaluaciones-stitch/guias",
        destination: "/evaluaciones?tab=guias",
        permanent: true,
      },
      {
        source: "/evaluaciones-stitch/editor-prueba",
        destination: "/evaluaciones?tab=pruebas&view=editor",
        permanent: true,
      },
      {
        source: "/evaluaciones-stitch/editor-guia-musica",
        destination: "/evaluaciones?tab=guias&view=editor",
        permanent: true,
      },
      {
        source: "/evaluaciones-stitch/crear-guia-ia",
        destination: "/evaluaciones?tab=guias&view=editor",
        permanent: true,
      },
      {
        source: "/evaluaciones-stitch/prototipos",
        destination: "/evaluaciones?tab=pruebas",
        permanent: true,
      },
    ]
  },
}

export default nextConfig
