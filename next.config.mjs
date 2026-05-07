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
  webpack: (config, { dev, isServer }) => {
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
}

export default nextConfig
