"use client"

import { useEffect, useMemo, useState } from "react"
import { useAdminGuard } from "@/hooks/use-admin-guard"
import {
  Users,
  Search,
  Loader2,
  Mail,
  Calendar,
  Activity,
  Trash2,
  ShieldOff,
  Shield,
  Building,
  RefreshCw,
  Download,
  AlertCircle,
  Eye,
  Crown,
  Key,
  UserPlus,
  UserMinus,
  Copy,
  Database,
  ArrowLeft,
  CheckCircle2,
  X,
  Brain,
  Pencil,
  Check,
} from "lucide-react"
import { apiFetch, ApiError } from "@/lib/api-client"

interface FirebaseUser {
  uid: string
  email: string
  displayName: string
  photoURL: string
  creationTime: string
  lastSignInTime: string
  disabled: boolean
  emailVerified: boolean
  isAdmin: boolean
  inAllowlist: boolean
  allowlistSource: string | null
}

type FilterMode = "todos" | "activos7d" | "activos30d" | "nuevos30d" | "sin_acceso" | "allowlist" | "admins" | "suspendidos"

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const body = error.body as { error?: unknown } | undefined
    return typeof body?.error === "string" ? body.error : error.message
  }
  return error instanceof Error ? error.message : fallback
}

export default function AdminUsuariosPage() {
  const { isReady, isAdmin } = useAdminGuard()
  const [usuarios, setUsuarios] = useState<FirebaseUser[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [filter, setFilter] = useState<FilterMode>("todos")
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [sortBy, setSortBy] = useState<"lastSignIn" | "created" | "name">("lastSignIn")
  const [detalleUid, setDetalleUid] = useState<string | null>(null)

  const fetchUsuarios = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await apiFetch("/api/admin/usuarios")
      const data = await res.json()
      setUsuarios(data.usuarios || [])
    } catch (err) {
      setError(getApiErrorMessage(err, "Error al cargar usuarios."))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isReady && isAdmin) fetchUsuarios()
  }, [isReady, isAdmin])

  // ── Acciones ────────────────────────────────────────────────────────────
  const runAction = async (key: string, fn: () => Promise<void>) => {
    setActionLoading(key)
    try {
      await fn()
    } finally {
      setActionLoading(null)
    }
  }

  const handleDeleteUser = (u: FirebaseUser) =>
    runAction(`delete-${u.uid}`, async () => {
      const name = u.displayName || u.email
      if (!confirm(`🚨 ELIMINACIÓN PERMANENTE de "${name}" y TODOS sus datos (planificaciones, clases, etc.).\n\n¿Confirmas?`)) return
      try {
        await apiFetch(`/api/admin/usuarios/${u.uid}`, { method: "DELETE" })
        setUsuarios((prev) => prev.filter((x) => x.uid !== u.uid))
      } catch (err) {
        alert(getApiErrorMessage(err, "Error al eliminar."))
      }
    })

  const handleToggleStatus = (u: FirebaseUser) =>
    runAction(`status-${u.uid}`, async () => {
      const newStatus = !u.disabled
      try {
        await apiFetch(`/api/admin/usuarios/${u.uid}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "updateAuth", disabled: newStatus }),
        })
        setUsuarios((prev) => prev.map((x) => (x.uid === u.uid ? { ...x, disabled: newStatus } : x)))
      } catch (err) {
        alert(getApiErrorMessage(err, "Error al cambiar estado."))
      }
    })

  const handleAssignSchool = (u: FirebaseUser) =>
    runAction(`school-${u.uid}`, async () => {
      const colegio = prompt(`Colegio/RBD para ${u.email}:`)
      if (colegio === null) return
      try {
        await apiFetch(`/api/admin/usuarios/${u.uid}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "assignColegio", colegio }),
        })
        alert(`Colegio actualizado a "${colegio}".`)
      } catch (err) {
        alert(getApiErrorMessage(err, "Error al asignar colegio."))
      }
    })

  const handleAddToAllowlist = (u: FirebaseUser) =>
    runAction(`allowlist-add-${u.uid}`, async () => {
      try {
        await apiFetch(`/api/admin/usuarios/${u.uid}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "addToAllowlist" }),
        })
        setUsuarios((prev) => prev.map((x) => (x.uid === u.uid ? { ...x, inAllowlist: true, allowlistSource: "admin_manual" } : x)))
      } catch (err) {
        alert(getApiErrorMessage(err, "Error al agregar a allowlist."))
      }
    })

  const handleRemoveFromAllowlist = (u: FirebaseUser) =>
    runAction(`allowlist-rm-${u.uid}`, async () => {
      if (!confirm(`Remover a ${u.email} de la allowlist? El usuario perderá acceso inmediato.`)) return
      try {
        await apiFetch(`/api/admin/usuarios/${u.uid}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "removeFromAllowlist" }),
        })
        setUsuarios((prev) => prev.map((x) => (x.uid === u.uid ? { ...x, inAllowlist: false, allowlistSource: null } : x)))
      } catch (err) {
        alert(getApiErrorMessage(err, "Error al remover."))
      }
    })

  const handleToggleAdmin = (u: FirebaseUser) =>
    runAction(`admin-${u.uid}`, async () => {
      const makeAdmin = !u.isAdmin
      const action = makeAdmin ? "Promover a admin" : "Remover rol admin"
      if (!confirm(`${action} a ${u.email}?`)) return
      try {
        await apiFetch(`/api/admin/usuarios/${u.uid}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "toggleAdmin", makeAdmin }),
        })
        setUsuarios((prev) => prev.map((x) => (x.uid === u.uid ? { ...x, isAdmin: makeAdmin } : x)))
      } catch (err) {
        alert(getApiErrorMessage(err, "Error al cambiar rol."))
      }
    })

  const handleResetData = (u: FirebaseUser) =>
    runAction(`reset-${u.uid}`, async () => {
      if (!confirm(`⚠️ Borrar TODAS las planificaciones, clases y datos de "${u.email}", PERO mantener la cuenta. ¿Confirmas?`)) return
      try {
        const res = await apiFetch(`/api/admin/usuarios/${u.uid}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "resetData" }),
        })
        const data = await res.json()
        alert(`✅ ${data.eliminados} documentos eliminados.`)
      } catch (err) {
        alert(getApiErrorMessage(err, "Error al resetear datos."))
      }
    })

  // ── Filtros ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    const ahora = Date.now()
    const d30 = ahora - 30 * 86400000
    const d7 = ahora - 7 * 86400000

    const pass = (u: FirebaseUser): boolean => {
      if (term) {
        const matches = u.email?.toLowerCase().includes(term) || u.displayName?.toLowerCase().includes(term)
        if (!matches) return false
      }
      const lastSign = u.lastSignInTime ? Date.parse(u.lastSignInTime) : 0
      const created = u.creationTime ? Date.parse(u.creationTime) : 0

      switch (filter) {
        case "activos7d":
          return lastSign >= d7
        case "activos30d":
          return lastSign >= d30
        case "nuevos30d":
          return created >= d30
        case "sin_acceso":
          return !u.inAllowlist && !u.isAdmin
        case "allowlist":
          return u.inAllowlist
        case "admins":
          return u.isAdmin
        case "suspendidos":
          return u.disabled
        default:
          return true
      }
    }

    const sorted = usuarios.filter(pass).sort((a, b) => {
      if (sortBy === "name") return (a.displayName || "").localeCompare(b.displayName || "")
      if (sortBy === "created") return Date.parse(b.creationTime || "0") - Date.parse(a.creationTime || "0")
      return Date.parse(b.lastSignInTime || "0") - Date.parse(a.lastSignInTime || "0")
    })
    return sorted
  }, [usuarios, searchTerm, filter, sortBy])

  const exportCSV = () => {
    const headers = ["UID", "Email", "Nombre", "Creado", "Ultimo login", "Activo", "Admin", "Allowlist"]
    const rows = filtered.map((u) => [
      u.uid,
      u.email,
      u.displayName || "",
      u.creationTime,
      u.lastSignInTime,
      u.disabled ? "No" : "Si",
      u.isAdmin ? "Si" : "No",
      u.inAllowlist ? "Si" : "No",
    ])
    const csv = "\uFEFF" + [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `edupanel-usuarios-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (!isReady) return <div className="p-8 text-muted-foreground text-sm">Cargando...</div>
  if (!isAdmin) return null

  if (detalleUid) {
    return <UserDetailPane uid={detalleUid} onClose={() => setDetalleUid(null)} onRefresh={fetchUsuarios} />
  }

  const filterCounts = {
    todos: usuarios.length,
    activos7d: usuarios.filter((u) => u.lastSignInTime && Date.parse(u.lastSignInTime) >= Date.now() - 7 * 86400000).length,
    activos30d: usuarios.filter((u) => u.lastSignInTime && Date.parse(u.lastSignInTime) >= Date.now() - 30 * 86400000).length,
    nuevos30d: usuarios.filter((u) => u.creationTime && Date.parse(u.creationTime) >= Date.now() - 30 * 86400000).length,
    sin_acceso: usuarios.filter((u) => !u.inAllowlist && !u.isAdmin).length,
    allowlist: usuarios.filter((u) => u.inAllowlist).length,
    admins: usuarios.filter((u) => u.isAdmin).length,
    suspendidos: usuarios.filter((u) => u.disabled).length,
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold flex items-center gap-3 mb-2">
            <Users className="w-8 h-8 text-slate-800 dark:text-slate-200" />
            Gestión de Usuarios
          </h1>
          <p className="text-muted-foreground">
            Total: {usuarios.length} usuarios · Viendo {filtered.length}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCSV}
            disabled={loading}
            className="border border-border bg-card font-semibold px-4 py-2 rounded-lg hover:bg-muted flex items-center gap-2 text-sm"
          >
            <Download className="w-4 h-4" /> CSV
          </button>
          <button
            onClick={fetchUsuarios}
            disabled={loading}
            className="bg-slate-900 text-white font-bold px-4 py-2 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-sm disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refrescar
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 p-4 rounded-lg flex items-center gap-2 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Filtros tipo chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        <FilterChip active={filter === "todos"} onClick={() => setFilter("todos")} label={`Todos (${filterCounts.todos})`} />
        <FilterChip active={filter === "activos7d"} onClick={() => setFilter("activos7d")} label={`Activos 7d (${filterCounts.activos7d})`} />
        <FilterChip active={filter === "activos30d"} onClick={() => setFilter("activos30d")} label={`Activos 30d (${filterCounts.activos30d})`} />
        <FilterChip active={filter === "nuevos30d"} onClick={() => setFilter("nuevos30d")} label={`Nuevos 30d (${filterCounts.nuevos30d})`} />
        <FilterChip active={filter === "allowlist"} onClick={() => setFilter("allowlist")} label={`En allowlist (${filterCounts.allowlist})`} />
        <FilterChip active={filter === "sin_acceso"} onClick={() => setFilter("sin_acceso")} label={`Sin acceso (${filterCounts.sin_acceso})`} />
        <FilterChip active={filter === "admins"} onClick={() => setFilter("admins")} label={`Admins (${filterCounts.admins})`} />
        <FilterChip active={filter === "suspendidos"} onClick={() => setFilter("suspendidos")} label={`Suspendidos (${filterCounts.suspendidos})`} />
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-3 items-center bg-muted/20">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por nombre o email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-background"
          >
            <option value="lastSignIn">Último login</option>
            <option value="created">Creación</option>
            <option value="name">Nombre</option>
          </select>
        </div>

        {loading ? (
          <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin mb-4" />
            Cargando usuarios...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-5 py-3 font-semibold">Usuario</th>
                  <th className="px-5 py-3 font-semibold">Roles</th>
                  <th className="px-5 py-3 font-semibold">Actividad</th>
                  <th className="px-5 py-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">
                      No hay resultados.
                    </td>
                  </tr>
                ) : (
                  filtered.map((u) => <UserRow key={u.uid} u={u} actionLoading={actionLoading}
                    onView={() => setDetalleUid(u.uid)}
                    onDelete={() => handleDeleteUser(u)}
                    onToggleStatus={() => handleToggleStatus(u)}
                    onAssignSchool={() => handleAssignSchool(u)}
                    onToggleAdmin={() => handleToggleAdmin(u)}
                    onAddAllowlist={() => handleAddToAllowlist(u)}
                    onRemoveAllowlist={() => handleRemoveFromAllowlist(u)}
                    onResetData={() => handleResetData(u)}
                  />)
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
        active
          ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white"
          : "bg-card border-border text-muted-foreground hover:bg-muted"
      }`}
    >
      {label}
    </button>
  )
}

function UserRow({
  u,
  actionLoading,
  onView,
  onDelete,
  onToggleStatus,
  onAssignSchool,
  onToggleAdmin,
  onAddAllowlist,
  onRemoveAllowlist,
  onResetData,
}: {
  u: FirebaseUser
  actionLoading: string | null
  onView: () => void
  onDelete: () => void
  onToggleStatus: () => void
  onAssignSchool: () => void
  onToggleAdmin: () => void
  onAddAllowlist: () => void
  onRemoveAllowlist: () => void
  onResetData: () => void
}) {
  return (
    <tr className={`hover:bg-muted/30 transition-colors ${u.disabled ? "opacity-60" : ""}`}>
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          {u.photoURL ? (
            <img src={u.photoURL} alt={u.displayName || "Avatar"} className="w-10 h-10 rounded-full border border-border object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs">
              {u.displayName?.charAt(0) || u.email?.charAt(0) || "U"}
            </div>
          )}
          <div>
            <div className="font-bold text-foreground flex items-center gap-1.5">
              {u.displayName || "Sin nombre"}
              {u.isAdmin && <Crown className="w-3 h-3 text-amber-500" />}
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Mail className="w-3 h-3" /> {u.email}
            </div>
          </div>
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="flex flex-col gap-1">
          <StatusBadge
            type={u.disabled ? "danger" : "success"}
            icon={u.disabled ? ShieldOff : Shield}
            label={u.disabled ? "Suspendido" : "Activo"}
          />
          {u.inAllowlist && (
            <StatusBadge type="info" icon={Key} label={u.allowlistSource === "admin_manual" ? "Allowlist (manual)" : "Allowlist"} />
          )}
          {!u.inAllowlist && !u.isAdmin && <StatusBadge type="warning" icon={UserMinus} label="Sin acceso" />}
        </div>
      </td>
      <td className="px-5 py-4 text-muted-foreground text-xs">
        <div className="flex items-center gap-1.5 mb-1">
          <Calendar className="w-3 h-3" />
          Creado: {u.creationTime ? new Date(u.creationTime).toLocaleDateString() : "—"}
        </div>
        <div className="flex items-center gap-1.5">
          <Activity className="w-3 h-3" />
          Login: {u.lastSignInTime ? new Date(u.lastSignInTime).toLocaleDateString() : "Nunca"}
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center justify-end gap-1 flex-wrap">
          <IconButton title="Ver detalle" onClick={onView} disabled={actionLoading !== null} icon={<Eye className="w-4 h-4" />} color="slate" />
          {!u.inAllowlist ? (
            <IconButton
              title="Agregar a allowlist"
              onClick={onAddAllowlist}
              disabled={actionLoading !== null}
              loading={actionLoading === `allowlist-add-${u.uid}`}
              icon={<UserPlus className="w-4 h-4" />}
              color="emerald"
            />
          ) : (
            <IconButton
              title="Remover de allowlist"
              onClick={onRemoveAllowlist}
              disabled={actionLoading !== null}
              loading={actionLoading === `allowlist-rm-${u.uid}`}
              icon={<UserMinus className="w-4 h-4" />}
              color="amber"
            />
          )}
          <IconButton
            title={u.isAdmin ? "Remover rol admin" : "Promover a admin"}
            onClick={onToggleAdmin}
            disabled={actionLoading !== null}
            loading={actionLoading === `admin-${u.uid}`}
            icon={<Crown className={`w-4 h-4 ${u.isAdmin ? "text-amber-500" : ""}`} />}
            color="amber"
          />
          <IconButton
            title="Asignar colegio"
            onClick={onAssignSchool}
            disabled={actionLoading !== null}
            loading={actionLoading === `school-${u.uid}`}
            icon={<Building className="w-4 h-4" />}
            color="blue"
          />
          <IconButton
            title={u.disabled ? "Reactivar" : "Suspender"}
            onClick={onToggleStatus}
            disabled={actionLoading !== null}
            loading={actionLoading === `status-${u.uid}`}
            icon={u.disabled ? <Shield className="w-4 h-4 text-green-600" /> : <ShieldOff className="w-4 h-4 text-amber-600" />}
            color="slate"
          />
          <IconButton
            title="Resetear datos (mantiene cuenta)"
            onClick={onResetData}
            disabled={actionLoading !== null}
            loading={actionLoading === `reset-${u.uid}`}
            icon={<Database className="w-4 h-4" />}
            color="amber"
          />
          <IconButton
            title="Eliminar usuario y TODOS sus datos"
            onClick={onDelete}
            disabled={actionLoading !== null}
            loading={actionLoading === `delete-${u.uid}`}
            icon={<Trash2 className="w-4 h-4" />}
            color="red"
          />
        </div>
      </td>
    </tr>
  )
}

function IconButton({
  title, onClick, disabled, loading, icon, color,
}: {
  title: string
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  icon: React.ReactNode
  color: "slate" | "red" | "blue" | "emerald" | "amber"
}) {
  const colors: Record<string, string> = {
    slate: "text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800",
    red: "text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30",
    blue: "text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30",
    emerald: "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30",
    amber: "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30",
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`p-2 rounded-lg transition-colors disabled:opacity-40 ${colors[color]}`}
      title={title}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
    </button>
  )
}

function StatusBadge({ type, icon: Icon, label }: { type: "success" | "danger" | "info" | "warning"; icon: any; label: string }) {
  const classes: Record<string, string> = {
    success: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400",
    danger: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
    info: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold w-fit ${classes[type]}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  )
}

// ── Panel de detalle ────────────────────────────────────────────────────────

interface UserDetail {
  auth: {
    uid: string
    email: string
    emailVerified: boolean
    displayName: string
    photoURL: string
    creationTime: string
    lastSignInTime: string
    disabled: boolean
    providerData?: Array<{ providerId: string; email?: string; displayName?: string }>
    customClaims: Record<string, any>
  }
  perfil: {
    main: any
    colegio: any
    preferencias: any
  }
  horario: any
  conteos: Record<string, number>
  allowlist: any
  ai: {
    tokens_input: number
    tokens_output: number
    tokens: number
    prompts: number
    cost: number
    limit: number
    last_used: string | null
  } | null
}

function UserDetailPane({ uid, onClose, onRefresh }: { uid: string; onClose: () => void; onRefresh: () => void }) {
  const [detalle, setDetalle] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [copiedToken, setCopiedToken] = useState(false)
  const [editingLimit, setEditingLimit] = useState(false)
  const [tempLimit, setTempLimit] = useState("")
  const [savingLimit, setSavingLimit] = useState(false)

  const fetch = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await apiFetch(`/api/admin/usuarios/${uid}`)
      const data = await res.json()
      setDetalle(data)
    } catch (err) {
      setError(getApiErrorMessage(err, "Error al cargar detalle."))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetch()
  }, [uid])

  const generarImpersonationToken = async () => {
    if (!confirm("Generar un token de impersonación? Úsalo solo para debug. El token permite iniciar sesión como este usuario.")) return
    try {
      const res = await apiFetch(`/api/admin/usuarios/${uid}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "generateImpersonationToken" }),
      })
      const data = await res.json()
      await navigator.clipboard.writeText(data.token)
      setCopiedToken(true)
      setTimeout(() => setCopiedToken(false), 3000)
    } catch (err) {
      alert(getApiErrorMessage(err, "Error al generar token."))
    }
  }

  const handleSaveAiLimit = async () => {
    const limitNum = parseFloat(tempLimit)
    if (isNaN(limitNum) || limitNum < 0) return
    setSavingLimit(true)
    try {
      await apiFetch(`/api/admin/usuarios/${uid}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "updateAiLimit", limit: limitNum }),
      })
      setDetalle((prev) => prev ? {
        ...prev,
        ai: prev.ai
          ? { ...prev.ai, limit: limitNum }
          : { tokens_input: 0, tokens_output: 0, tokens: 0, prompts: 0, cost: 0, limit: limitNum, last_used: null }
      } : prev)
      setEditingLimit(false)
    } catch (err) {
      alert(getApiErrorMessage(err, "Error al guardar límite."))
    } finally {
      setSavingLimit(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <button onClick={onClose} className="mb-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Volver
        </button>
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (error || !detalle) {
    return (
      <div className="max-w-4xl mx-auto">
        <button onClick={onClose} className="mb-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Volver
        </button>
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 p-4 rounded-lg flex items-center gap-2 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error || "No se pudo cargar el detalle."}
        </div>
      </div>
    )
  }

  const { auth: a, perfil, horario, conteos, allowlist, ai } = detalle
  const totalContenido = Object.values(conteos).reduce((acc, n) => acc + n, 0)
  const aiPct = ai && ai.limit > 0 ? Math.min((ai.cost / ai.limit) * 100, 100) : 0
  const aiStatus = ai && ai.cost >= ai.limit ? "exceeded" : ai && ai.cost >= ai.limit * 0.8 ? "warning" : "active"

  return (
    <div className="max-w-5xl mx-auto">
      <button onClick={onClose} className="mb-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Volver al listado
      </button>

      {/* Header */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start gap-4">
          {a.photoURL ? (
            <img src={a.photoURL} alt="" className="w-20 h-20 rounded-full border-2 border-border" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-2xl">
              {a.displayName?.charAt(0) || a.email?.charAt(0) || "U"}
            </div>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-extrabold">{a.displayName || "Sin nombre"}</h1>
              {a.customClaims?.admin && <StatusBadge type="warning" icon={Crown} label="Admin" />}
              {a.disabled ? <StatusBadge type="danger" icon={ShieldOff} label="Suspendido" /> : <StatusBadge type="success" icon={Shield} label="Activo" />}
              {a.emailVerified && <StatusBadge type="info" icon={CheckCircle2} label="Verificado" />}
            </div>
            <div className="text-sm text-muted-foreground mt-1">{a.email}</div>
            <div className="text-xs text-muted-foreground font-mono mt-1">{a.uid}</div>
          </div>
          <button
            onClick={generarImpersonationToken}
            className="text-xs border border-border rounded-lg px-3 py-2 hover:bg-muted flex items-center gap-1.5"
            title="Generar token de impersonación (copia al portapapeles)"
          >
            {copiedToken ? (
              <>
                <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Copiado
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" /> Impersonar
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tres columnas: Metadata / Perfil / Uso */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <h2 className="font-bold mb-3 flex items-center gap-2 text-sm">
            <Key className="w-4 h-4 text-muted-foreground" /> Metadata Auth
          </h2>
          <dl className="text-xs space-y-2">
            <Row label="Creado" value={a.creationTime ? new Date(a.creationTime).toLocaleString() : "—"} />
            <Row label="Último login" value={a.lastSignInTime ? new Date(a.lastSignInTime).toLocaleString() : "Nunca"} />
            <Row label="Providers" value={(a.providerData || []).map((p) => p.providerId).join(", ") || "—"} />
            <Row label="Custom claims" value={Object.keys(a.customClaims).length > 0 ? JSON.stringify(a.customClaims) : "—"} />
            <Row
              label="Allowlist"
              value={
                allowlist
                  ? `${allowlist.source || "alfa"}${allowlist.codigoUsado ? ` · ${allowlist.codigoUsado}` : ""}`
                  : "No está"
              }
            />
          </dl>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <h2 className="font-bold mb-3 flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-muted-foreground" /> Perfil
          </h2>
          {perfil.main ? (
            <dl className="text-xs space-y-2">
              <Row label="Tipo" value={perfil.main.tipoProfesor || "—"} />
              <Row label="Especialidad" value={perfil.main.especialidad || "—"} />
              <Row label="Estudios" value={perfil.main.estudios || "—"} />
              <Row label="Colegio" value={perfil.colegio?.nombre || "—"} />
            </dl>
          ) : (
            <div className="text-xs text-muted-foreground italic">Sin perfil completado.</div>
          )}
          {perfil.preferencias?.asignaturasHabilitadas && (
            <div className="mt-3 pt-3 border-t border-border">
              <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Asignaturas habilitadas</div>
              <div className="flex flex-wrap gap-1">
                {perfil.preferencias.asignaturasHabilitadas.map((a: string) => (
                  <span key={a} className="px-1.5 py-0.5 bg-muted rounded text-[10px]">{a}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <h2 className="font-bold mb-3 flex items-center gap-2 text-sm">
            <Database className="w-4 h-4 text-muted-foreground" /> Uso de Contenido
          </h2>
          <div className="text-2xl font-extrabold mb-1">{totalContenido}</div>
          <div className="text-xs text-muted-foreground mb-3">documentos en Firestore</div>
          <dl className="text-xs space-y-1 max-h-40 overflow-y-auto">
            {Object.entries(conteos).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-0.5">
                <span className="font-mono text-[11px]">{k}</span>
                <span className="font-semibold">{v}</span>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* Tarjeta de Inteligencia Artificial */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold flex items-center gap-2 text-sm">
            <Brain className="w-4 h-4 text-fuchsia-500" /> Consumo de Inteligencia Artificial
          </h2>
          {ai && (
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
              aiStatus === "exceeded" ? "bg-red-100 text-red-700" :
              aiStatus === "warning" ? "bg-amber-100 text-amber-700" :
              "bg-green-100 text-green-700"
            }`}>
              {aiStatus === "exceeded" ? "Límite Excedido" : aiStatus === "warning" ? "Cerca del límite" : "Normal"}
            </span>
          )}
        </div>

        {!ai ? (
          <div className="text-xs text-muted-foreground italic">Este usuario no ha usado la IA aún.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-secondary/50 rounded-xl p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Interacciones</div>
              <div className="text-[22px] font-extrabold">{ai.prompts}</div>
            </div>
            <div className="bg-secondary/50 rounded-xl p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Tokens Totales</div>
              <div className="text-[22px] font-extrabold">
                {ai.tokens >= 1_000_000 ? `${(ai.tokens / 1_000_000).toFixed(2)}M` : `${(ai.tokens / 1_000).toFixed(1)}k`}
              </div>
            </div>
            <div className="bg-secondary/50 rounded-xl p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Gasto USD</div>
              <div className="text-[22px] font-extrabold">${ai.cost.toFixed(4)}</div>
            </div>
            <div className="bg-secondary/50 rounded-xl p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 flex items-center justify-between">
                <span>Límite / Mes</span>
                {!editingLimit && (
                  <button onClick={() => { setEditingLimit(true); setTempLimit(ai.limit.toString()) }} className="text-muted-foreground hover:text-primary">
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
              </div>
              {editingLimit ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[12px] text-muted-foreground">$</span>
                  <input
                    type="number" step="0.5" min="0" value={tempLimit}
                    onChange={(e) => setTempLimit(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveAiLimit(); if (e.key === "Escape") setEditingLimit(false) }}
                    className="w-16 px-2 py-1 text-[13px] border border-primary rounded outline-none"
                    autoFocus
                  />
                  <button onClick={handleSaveAiLimit} disabled={savingLimit} className="text-green-600 hover:text-green-700 disabled:opacity-40">
                    {savingLimit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </button>
                  <button onClick={() => setEditingLimit(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="text-[22px] font-extrabold">${ai.limit.toFixed(2)}</div>
              )}
            </div>
          </div>
        )}

        {ai && (
          <div className="mt-4">
            <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
              <span>Uso del presupuesto mensual</span>
              <span>{aiPct.toFixed(1)}%</span>
            </div>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  aiStatus === "exceeded" ? "bg-red-500" : aiStatus === "warning" ? "bg-amber-500" : "bg-fuchsia-500"
                }`}
                style={{ width: `${aiPct}%` }}
              />
            </div>
            {ai.last_used && (
              <p className="text-[11px] text-muted-foreground mt-2">
                Último uso: {new Date(ai.last_used).toLocaleString("es-CL")}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground font-semibold flex-shrink-0">{label}</dt>
      <dd className="text-right break-all">{value}</dd>
    </div>
  )
}
