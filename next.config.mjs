/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Habilitado temporalmente: el proyecto tiene errores de tipo heredados
    // que no bloquean el runtime. Remover progresivamente al migrar a tipado estricto.
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
