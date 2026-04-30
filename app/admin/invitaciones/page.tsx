"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth/auth-context"
import { useRouter } from "next/navigation"
import { KeyRound, Plus, Trash2, Loader2, AlertCircle } from "lucide-react"
import { apiFetch, ApiError } from "@/lib/api-client"

interface Invitacion {
  id: string
  creadoPor: string
  creadoEn: any
  maxUsos: number
  usos: number
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    const body = error.body as { error?: unknown } | undefined
    return typeof body?.error === "string" ? body.error : error.message
  }
  return error instanceof Error ? error.message : fallback
}

export default function InvitacionesPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [invites, setInvites] = useState<Invitacion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // Form
  const [newCode, setNewCode] = useState("")
  const [maxUsos, setMaxUsos] = useState("1")
  const [creating, setCreating] = useState(false)

  const fetchInvites = async () => {
    if (!user) return
    setLoading(true)
    setError("")
    try {
      const res = await apiFetch("/api/invitaciones")
      const data = await res.json()
      setInvites(data.invitaciones || [])
    } catch (error) {
      setError(getApiErrorMessage(error, "No autorizado"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authLoading) {
      if (!user || user.email?.toLowerCase() !== "freddyfiguea@gmail.com") {
        router.replace("/")
      } else {
        fetchInvites()
      }
    }
  }, [user, authLoading, router])

  const handleCreate = async () => {
    if (!newCode.trim() || !user) return
    setCreating(true)
    try {
      await apiFetch("/api/invitaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: newCode.trim(), maxUsos })
      })
      setNewCode("")
      setMaxUsos("1")
      await fetchInvites()
    } catch (error) {
      alert(getApiErrorMessage(error, "Error al crear invitacion"))
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (codigo: string) => {
    if (!confirm(`¿Eliminar código ${codigo}?`) || !user) return
    try {
      await apiFetch(`/api/invitaciones?codigo=${codigo}`, {
        method: "DELETE",
      })
      await fetchInvites()
    } catch (error) {
      alert(getApiErrorMessage(error, "Error al eliminar"))
    }
  }

  const generateRandomCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    let result = "EDU-"
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setNewCode(result)
  }

  if (authLoading || (loading && !error)) {
    return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin w-5 h-5" /> Cargando...</div>
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold flex items-center gap-2 mb-2">
          <KeyRound className="w-6 h-6 text-primary" /> Códigos de Invitación
        </h1>
        <p className="text-muted-foreground text-sm">Crea códigos únicos para que otros usuarios puedan acceder a EduPanel.</p>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 mb-8 shadow-sm">
        <h2 className="text-sm font-bold mb-4">Crear nuevo código</h2>
        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Código</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={newCode}
                onChange={e => setNewCode(e.target.value.toUpperCase())}
                placeholder="Ej. EDU-XYZ123" 
                className="w-full border border-border rounded-lg px-3 py-2 text-sm uppercase"
              />
              <button 
                onClick={generateRandomCode}
                className="text-xs px-3 py-2 border border-border rounded-lg hover:bg-background bg-card"
              >
                Aleatorio
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Usos Máximos</label>
            <input 
              type="number" 
              min="1"
              value={maxUsos}
              onChange={e => setMaxUsos(e.target.value)}
              className="w-24 border border-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <button 
            onClick={handleCreate}
            disabled={creating || !newCode.trim()}
            className="bg-primary text-white font-bold px-4 py-2 rounded-lg hover:bg-pink-dark flex items-center gap-1.5 disabled:opacity-50 text-sm h-[38px]"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Crear
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
            <tr>
              <th className="px-5 py-3 font-semibold">Código</th>
              <th className="px-5 py-3 font-semibold">Usos</th>
              <th className="px-5 py-3 font-semibold">Estado</th>
              <th className="px-5 py-3 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {invites.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">
                  No hay códigos creados.
                </td>
              </tr>
            ) : (
              invites.map(inv => {
                const isAgotado = inv.usos >= inv.maxUsos
                return (
                  <tr key={inv.id} className="hover:bg-muted/30">
                    <td className="px-5 py-4 font-mono font-bold">{inv.id}</td>
                    <td className="px-5 py-4">
                      {inv.usos} / {inv.maxUsos}
                    </td>
                    <td className="px-5 py-4">
                      {isAgotado ? (
                        <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-bold">Agotado</span>
                      ) : (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">Activo</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button 
                        onClick={() => handleDelete(inv.id)}
                        className="text-muted-foreground hover:text-red-500 p-1"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
