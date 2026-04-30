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
}

export default nextConfig
