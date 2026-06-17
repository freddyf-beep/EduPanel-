"use client"

import { useCallback, useEffect, useState } from "react"
import Image from "next/image"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts"
import {
  Cpu, DollarSign, Users, Activity, Search,
  AlertCircle, Pencil, Loader2, RefreshCw,
  Check, X, Brain, Zap, TrendingUp, BarChart3,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { apiFetch, ApiError } from "@/lib/api-client"

// ─── Types ───────────────────────────────────────────────────────────────────

interface GlobalStats {
  tokens: number
  prompts: number
  cost: number
  docentes_activos: number
}

interface DocenteStat {
  uid: string
  name: string
  email: string
  photoURL: string
  prompts: number
  tokens_input: number
  tokens_output: number
  tokens: number
  cost: number
  limit: number
  last_used: string | null
  month?: string
  status: "active" | "warning" | "exceeded"
}

interface TendenciaPunto {
  date: string
  tokens: number
  cost: number
}

const GLOBAL_BUDGET_DEFAULT = 20.0

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function fmtDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })
}

function fmtMonth(month: string | null) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return "Mes actual"
  return new Date(`${month}-01T12:00:00`).toLocaleDateString("es-CL", {
    month: "long",
    year: "numeric",
  })
}

function getApiErrorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) {
    const body = err.body as { error?: unknown } | undefined
    return typeof body?.error === "string" ? body.error : err.message
  }
  return err instanceof Error ? err.message : fallback
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ConsumoIAView() {
  const [global, setGlobal] = useState<GlobalStats>({ tokens: 0, prompts: 0, cost: 0, docentes_activos: 0 })
  const [docentes, setDocentes] = useState<DocenteStat[]>([])
  const [tendencia, setTendencia] = useState<TendenciaPunto[]>([])
  const [month, setMonth] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [editingUid, setEditingUid] = useState<string | null>(null)
  const [tempLimit, setTempLimit] = useState("")
  const [savingUid, setSavingUid] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await apiFetch("/api/admin/consumo-ia")
      const data = await res.json()
      setGlobal(data.global ?? { tokens: 0, prompts: 0, cost: 0, docentes_activos: 0 })
      setDocentes(data.por_docente || [])
      setTendencia(data.tendencia || [])
      setMonth(typeof data.month === "string" ? data.month : null)
    } catch (err) {
      setError(getApiErrorMessage(err, "Error al cargar datos de consumo IA."))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) void fetchData()
    })
    return () => {
      cancelled = true
    }
  }, [fetchData])

  const handleSaveLimit = async (uid: string) => {
    const limitNum = parseFloat(tempLimit)
    if (isNaN(limitNum) || limitNum < 0) return
    setSavingUid(uid)
    try {
      await apiFetch("/api/admin/consumo-ia", {
        method: "PATCH",
        body: JSON.stringify({ uid, limit: limitNum }),
      })
      setDocentes((prev) => prev.map((d) => d.uid === uid ? { ...d, limit: limitNum } : d))
      setEditingUid(null)
    } catch (err) {
      alert(getApiErrorMessage(err, "Error al actualizar límite."))
    } finally {
      setSavingUid(null)
    }
  }

  const filteredDocentes = docentes.filter((d) => {
    const t = searchTerm.toLowerCase()
    return d.name.toLowerCase().includes(t) || d.email.toLowerCase().includes(t)
  })

  const totalCost = global?.cost ?? 0
  const spendPct = Math.min((totalCost / GLOBAL_BUDGET_DEFAULT) * 100, 100)
  const hasData = docentes.length > 0
  const monthLabel = fmtMonth(month)

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center shadow-lg shadow-fuchsia-500/20">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-[22px] font-extrabold tracking-tight">Consumo de IA</h1>
              <p className="text-[13px] text-muted-foreground">
                Costo estimado de IA · consumo mensual por docente
              </p>
            </div>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 border border-border bg-card px-4 py-2.5 rounded-xl font-semibold text-[13px] hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            Actualizar
          </button>
        </div>

        {/* ── Error banner ── */}
        {error && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 p-4 rounded-xl flex items-center gap-3 text-[13px]">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* ── Metric Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Gasto */}
          <div className="col-span-2 lg:col-span-1 relative overflow-hidden bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 text-white shadow-lg shadow-blue-500/20">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
            <div className="absolute -right-2 -bottom-6 w-32 h-32 rounded-full bg-white/5" />
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <DollarSign className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-bold bg-white/20 px-2 py-1 rounded-lg flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> {monthLabel}
                </span>
              </div>
              <div className="text-[11px] font-bold uppercase tracking-wider opacity-80 mb-1">Gasto Acumulado</div>
              <div className="text-[28px] font-extrabold leading-none">
                {loading ? "—" : `$${totalCost.toFixed(4)}`}
              </div>
              <div className="text-[12px] opacity-70 mt-1">dólares USD este mes</div>
            </div>
          </div>

          {/* Tokens */}
          <div className="relative overflow-hidden bg-gradient-to-br from-fuchsia-600 to-violet-700 rounded-2xl p-5 text-white shadow-lg shadow-fuchsia-500/20">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
            <div className="relative">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center mb-4">
                <Cpu className="w-5 h-5" />
              </div>
              <div className="text-[11px] font-bold uppercase tracking-wider opacity-80 mb-1">Tokens Totales</div>
              <div className="text-[28px] font-extrabold leading-none">
                {loading ? "—" : fmtTokens(global.tokens)}
              </div>
              <div className="text-[12px] opacity-70 mt-1">entrada + salida</div>
            </div>
          </div>

          {/* Docentes */}
          <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-5 text-white shadow-lg shadow-emerald-500/20">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
            <div className="relative">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center mb-4">
                <Users className="w-5 h-5" />
              </div>
              <div className="text-[11px] font-bold uppercase tracking-wider opacity-80 mb-1">Docentes Activos</div>
              <div className="text-[28px] font-extrabold leading-none">
                {loading ? "—" : global.docentes_activos}
              </div>
              <div className="text-[12px] opacity-70 mt-1">de {docentes.length} con acceso a IA</div>
            </div>
          </div>

          {/* Presupuesto */}
          <div className="relative bg-card border border-border rounded-2xl p-5 shadow-sm overflow-hidden">
            {/* top bar */}
            <div className="absolute top-0 left-0 w-full h-1 bg-secondary">
              <div
                className={cn("h-full transition-all duration-700 rounded-full", spendPct > 80 ? "bg-red-500" : "bg-amber-500")}
                style={{ width: `${spendPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between mb-4 mt-1">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <Activity className="w-5 h-5 text-amber-600" />
              </div>
              <span className={cn("text-[12px] font-bold tabular-nums", spendPct > 80 ? "text-red-600" : "text-muted-foreground")}>
                {spendPct.toFixed(1)}%
              </span>
            </div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Presupuesto Global</div>
            <div className="text-[26px] font-extrabold">${GLOBAL_BUDGET_DEFAULT.toFixed(2)} USD</div>
            <div className="text-[12px] text-muted-foreground mt-1">límite mensual de referencia</div>
          </div>
        </div>

        {/* ── Interacciones totales chip ── */}
        <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
          <div className="flex items-center gap-1.5 bg-card border border-border rounded-xl px-3 py-2 font-semibold">
            <Zap className="w-4 h-4 text-amber-500" />
            {loading ? "—" : global.prompts} interacciones totales
          </div>
          {hasData && (
            <div className="flex items-center gap-1.5 bg-card border border-border rounded-xl px-3 py-2 font-semibold">
              <BarChart3 className="w-4 h-4 text-blue-500" />
              Costo promedio por interacción: ${global.prompts > 0 ? (totalCost / global.prompts).toFixed(4) : "0.0000"} USD
            </div>
          )}
        </div>

        {/* ── Gráfico ── */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-[15px] font-bold">Tendencia de Consumo</h3>
              <p className="text-[12px] text-muted-foreground mt-0.5">Gasto diario acumulado en USD</p>
            </div>
          </div>
          {loading ? (
            <div className="h-[220px] flex items-center justify-center text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando datos...
            </div>
          ) : tendencia.length > 0 ? (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={tendencia} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ec4899" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="opacity-[0.07]" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }} tickFormatter={(v) => `$${v}`} />
                  <RechartsTooltip
                    contentStyle={{ borderRadius: "12px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", boxShadow: "0 8px 30px rgba(0,0,0,0.12)" }}
                    labelStyle={{ fontWeight: "700", marginBottom: "4px", fontSize: "12px" }}
                    formatter={(value: number) => [`$${value.toFixed(6)} USD`, "Costo"]}
                    itemStyle={{ fontSize: "12px" }}
                  />
                  <Area type="monotone" dataKey="cost" stroke="#ec4899" strokeWidth={2.5} fillOpacity={1} fill="url(#costGrad)" dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: "#ec4899" }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[220px] flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center">
                <BarChart3 className="w-7 h-7 opacity-40" />
              </div>
              <p className="text-[13px]">Los datos de tendencia aparecerán aquí cuando los docentes usen la IA</p>
            </div>
          )}
        </div>

        {/* ── Tabla por Docente ── */}
        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">

          {/* Tabla header */}
          <div className="px-6 py-5 border-b border-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-[15px] font-bold">Consumo por Docente</h3>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                {hasData
                  ? `${filteredDocentes.length} docentes · Pasa el cursor sobre "Límite / Mes" para editar`
                  : "Los docentes aparecerán aquí cuando comiencen a usar la IA"}
              </p>
            </div>
            {hasData && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar docente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-secondary border-none rounded-xl text-[13px] outline-none focus:ring-2 focus:ring-primary/20 transition-all w-56"
                />
              </div>
            )}
          </div>

          {/* Loading */}
          {loading ? (
            <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="w-7 h-7 animate-spin text-fuchsia-500" />
              <p className="text-[13px]">Cargando estadísticas...</p>
            </div>
          ) : !hasData ? (
            /* ── Empty state elegante ── */
            <div className="py-16 flex flex-col items-center gap-4 text-muted-foreground">
              <div className="relative">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-fuchsia-500/10 to-violet-500/10 border border-fuchsia-500/20 flex items-center justify-center">
                  <Brain className="w-10 h-10 text-fuchsia-500/40" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-xl bg-amber-400 flex items-center justify-center shadow-md">
                  <Zap className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
              <div className="text-center">
                <p className="font-bold text-[15px] text-foreground mb-1">Sin actividad de IA aún</p>
                <p className="text-[13px] max-w-sm leading-relaxed">
                  Cuando los docentes comiencen a usar las herramientas de IA (planificador, agente, rúbricas), su consumo aparecerá aquí automáticamente.
                </p>
              </div>
              <div className="flex items-center gap-2 text-[12px] bg-secondary/80 px-4 py-2.5 rounded-xl">
                <div className="w-2 h-2 rounded-full bg-fuchsia-500 animate-pulse" />
                Monitoreo activo · Actualizando en tiempo real
              </div>
            </div>
          ) : (
            /* ── Tabla con datos ── */
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    {[
                      { label: "Docente", cls: "w-[240px]" },
                      { label: "Interacciones", cls: "text-center" },
                      { label: "Tokens entrada", cls: "text-center" },
                      { label: "Tokens salida", cls: "text-center" },
                      { label: "Gasto USD", cls: "" },
                      { label: "Límite / Mes", cls: "" },
                      { label: "Último uso", cls: "" },
                      { label: "Estado", cls: "" },
                    ].map((h) => (
                      <th key={h.label} className={cn("px-5 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap bg-secondary/30", h.cls)}>
                        {h.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredDocentes.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-10 text-center text-[13px] text-muted-foreground">
                        No se encontraron docentes con ese criterio.
                      </td>
                    </tr>
                  ) : filteredDocentes.map((d) => {
                    const pct = d.limit > 0 ? Math.min((d.cost / d.limit) * 100, 100) : 0
                    return (
                      <tr key={d.uid} className="hover:bg-secondary/20 transition-colors group">

                        {/* Docente */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            {d.photoURL
                              ? (
                                <Image
                                  src={d.photoURL}
                                  alt=""
                                  width={36}
                                  height={36}
                                  className="w-9 h-9 rounded-xl border border-border object-cover flex-shrink-0"
                                />
                              )
                              : <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0">
                                  {d.name.charAt(0).toUpperCase()}
                                </div>
                            }
                            <div className="min-w-0">
                              <div className="font-bold text-[13px] truncate">{d.name}</div>
                              <div className="text-[11px] text-muted-foreground truncate">{d.email}</div>
                            </div>
                          </div>
                        </td>

                        {/* Interacciones */}
                        <td className="px-5 py-4 text-center">
                          <span className="text-[14px] font-bold tabular-nums">{d.prompts}</span>
                        </td>

                        {/* Tokens entrada */}
                        <td className="px-5 py-4 text-center">
                          <span className="text-[13px] font-medium text-muted-foreground tabular-nums">{fmtTokens(d.tokens_input)}</span>
                        </td>

                        {/* Tokens salida */}
                        <td className="px-5 py-4 text-center">
                          <span className="text-[13px] font-medium text-muted-foreground tabular-nums">{fmtTokens(d.tokens_output)}</span>
                        </td>

                        {/* Gasto */}
                        <td className="px-5 py-4">
                          <div className="font-bold text-[14px] tabular-nums">${d.cost.toFixed(4)}</div>
                          <div className="mt-1.5 w-24 h-1.5 bg-secondary rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all", d.status === "exceeded" ? "bg-red-500" : d.status === "warning" ? "bg-amber-500" : "bg-fuchsia-500")}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </td>

                        {/* Límite editable */}
                        <td className="px-5 py-4">
                          {editingUid === d.uid ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-muted-foreground text-[12px]">$</span>
                              <input
                                type="number" step="0.5" min="0"
                                value={tempLimit}
                                onChange={(e) => setTempLimit(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") handleSaveLimit(d.uid); if (e.key === "Escape") setEditingUid(null) }}
                                className="w-16 px-2 py-1 text-[12px] border-2 border-primary rounded-lg outline-none bg-background"
                                autoFocus
                              />
                              <button onClick={() => handleSaveLimit(d.uid)} disabled={savingUid === d.uid} className="text-green-600 hover:text-green-500 disabled:opacity-40 transition-colors">
                                {savingUid === d.uid ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                              </button>
                              <button onClick={() => setEditingUid(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 group/limit">
                              <span className="font-semibold text-[13px] tabular-nums">${d.limit.toFixed(2)}</span>
                              <button
                                onClick={() => { setEditingUid(d.uid); setTempLimit(d.limit.toString()) }}
                                className="opacity-0 group-hover/limit:opacity-100 p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-primary transition-all"
                                title="Editar límite mensual"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Último uso */}
                        <td className="px-5 py-4">
                          <span className="text-[13px] text-muted-foreground whitespace-nowrap">{fmtDate(d.last_used)}</span>
                        </td>

                        {/* Estado */}
                        <td className="px-5 py-4">
                          {d.status === "active" && (
                            <span className="inline-flex items-center gap-1.5 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-full text-[11px] font-bold">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Normal
                            </span>
                          )}
                          {d.status === "warning" && (
                            <span className="inline-flex items-center gap-1.5 bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded-full text-[11px] font-bold">
                              <AlertCircle className="w-3 h-3" /> Cerca del límite
                            </span>
                          )}
                          {d.status === "exceeded" && (
                            <span className="inline-flex items-center gap-1.5 bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 px-2.5 py-1 rounded-full text-[11px] font-bold">
                              <AlertCircle className="w-3 h-3" /> Excedido
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

    </div>
  )
}
