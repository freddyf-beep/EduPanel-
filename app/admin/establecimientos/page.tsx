"use client"

import { useAuth } from "@/components/auth/auth-context"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { Building2, Plus, Search } from "lucide-react"

// Temporal para validación de admin
const DEFAULT_ADMIN_EMAILS = ["udefret34@gmail.com", "freddyfiguea@gmail.com"]
function isAdminEmail(email: string | null | undefined): boolean {
  const key = (email ?? "").toLowerCase().trim()
  if (!key) return false
  const configured = [
    ...DEFAULT_ADMIN_EMAILS,
    ...(process.env.NEXT_PUBLIC_ADMIN_EMAIL || "").split(","),
  ].map((item) => item.toLowerCase().trim()).filter(Boolean)
  return configured.includes(key)
}

export default function AdminEstablecimientosPage() {
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
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold flex items-center gap-3 mb-2">
            <Building2 className="w-8 h-8 text-slate-800 dark:text-slate-200" />
            Establecimientos
          </h1>
          <p className="text-muted-foreground">Gestiona los colegios o instituciones que usan EduPanel.</p>
        </div>
        <button className="bg-slate-900 text-white font-bold px-4 py-2 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-sm shadow-sm">
          <Plus className="w-4 h-4" />
          Añadir Colegio
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/20">
          <div className="relative w-full max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por RBD o nombre del colegio..."
              className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        <div className="p-12 text-center">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-bold mb-2">Gestor de Instituciones en Construcción</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Aquí podrás configurar los periodos escolares, escalas de notas y administradores institucionales (UTP) por cada colegio.
          </p>
        </div>
      </div>
    </div>
  )
}
