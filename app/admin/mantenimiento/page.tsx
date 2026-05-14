"use client"

import { useAuth } from "@/components/auth/auth-context"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { Database, AlertTriangle, Terminal, Play } from "lucide-react"

// Temporal para validación de admin
const DEFAULT_ADMIN_EMAILS = ["freddyfigueroagea@gmail.com", "freddyfiguea@gmail.com"]
function isAdminEmail(email: string | null | undefined): boolean {
  const key = (email ?? "").toLowerCase().trim()
  if (!key) return false
  const configured = [
    ...DEFAULT_ADMIN_EMAILS,
    ...(process.env.NEXT_PUBLIC_ADMIN_EMAIL || "").split(","),
  ].map((item) => item.toLowerCase().trim()).filter(Boolean)
  return configured.includes(key)
}

export default function AdminMantenimientoPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading) {
      if (!user || !isAdminEmail(user.email)) {
        router.replace("/")
      }
    }
  }, [user, loading, router])

  if (loading) return <div className="p-8 text-muted-foreground text-sm">Cargando...</div>
  if (!user || !isAdminEmail(user.email)) return null

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold flex items-center gap-3 mb-2">
          <Database className="w-8 h-8 text-slate-800 dark:text-slate-200" />
          Mantenimiento de Base de Datos
        </h1>
        <p className="text-muted-foreground">Ejecuta scripts de migración, limpia datos huérfanos o realiza tareas de mantenimiento avanzadas.</p>
      </div>

      <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-8 flex gap-4 text-red-800 shadow-sm dark:bg-red-950/20 dark:border-red-900/50 dark:text-red-400">
        <AlertTriangle className="w-6 h-6 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-bold mb-1">Zona de Peligro</h3>
          <p className="text-sm">Las acciones en esta sección pueden modificar la base de datos de forma irreversible. Úsalas con extrema precaución y asegúrate de tener respaldos si es necesario.</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Script de migración de perfiles */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col sm:flex-row gap-5 items-start sm:items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Terminal className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-bold text-sm">Migración de Perfiles V2</h3>
            </div>
            <p className="text-xs text-muted-foreground">Ejecuta el script para migrar los perfiles antiguos a la nueva estructura PerfilV2Shell de todos los usuarios.</p>
          </div>
          <button className="bg-slate-900 text-white font-bold px-4 py-2 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-sm flex-shrink-0">
            <Play className="w-4 h-4" />
            Ejecutar Script
          </button>
        </div>

        {/* Script limpiar datos */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col sm:flex-row gap-5 items-start sm:items-center justify-between opacity-50">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Terminal className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-bold text-sm">Limpieza de Planificaciones Huérfanas</h3>
            </div>
            <p className="text-xs text-muted-foreground">Elimina las planificaciones que no están vinculadas a ningún usuario activo.</p>
          </div>
          <button disabled className="bg-slate-900 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 text-sm flex-shrink-0 cursor-not-allowed">
            Próximamente
          </button>
        </div>
      </div>
    </div>
  )
}
