"use client"

import { useEffect, useState } from "react"
import { useAdminGuard } from "@/hooks/use-admin-guard"
import {
  LayoutDashboard,
  Users,
  KeyRound,
  BookA,
  Activity,
  Loader2,
  RefreshCw,
  UserPlus,
  AlertCircle,
  TrendingUp,
} from "lucide-react"
import { apiFetch, ApiError } from "@/lib/api-client"

interface StatsResponse {
  usuarios: {
    total: number
    activos30d: number
    activos7d: number
    nuevos30d: number
    suspendidos: number
    hayMas: boolean
  }
  allowlist: { total: number }
  invitaciones: {
    total: number
    activas: number
    agotadas: number
    usosTotales: number
  }
  curriculum: {
    totalAsignaturas: number
    totalUnidades: number
    asignaturas: Array<{ id: string; asignatura?: string; unidades: number }>
  }
  seriePorDia: Array<{ dia: string; count: number }>
  generadoEn: number
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const body = error.body as { error?: unknown } | undefined
    return typeof body?.error === "string" ? body.error : error.message
  }
  return error instanceof Error ? error.message : fallback
}

export default function AdminDashboardPage() {
  const { isReady, isAdmin } = useAdminGuard()
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const fetchStats = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await apiFetch("/api/admin/stats")
      const data = (await res.json()) as StatsResponse
      setStats(data)
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudieron cargar las metricas."))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isReady && isAdmin) fetchStats()
  }, [isReady, isAdmin])

  if (!isReady) return <div className="p-8 text-muted-foreground text-sm">Cargando...</div>
  if (!isAdmin) return null

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold flex items-center gap-3 mb-2">
            <LayoutDashboard className="w-8 h-8 text-slate-800 dark:text-slate-200" />
            Dashboard General
          </h1>
          <p className="text-muted-foreground">
            Visión general del estado de EduPanel y métricas principales.
            {stats?.generadoEn && (
              <span className="ml-2 text-xs">
                · Actualizado a las {new Date(stats.generadoEn).toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="bg-slate-900 text-white font-bold px-4 py-2 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-sm shadow-sm disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Actualizar
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 p-4 rounded-lg flex items-center gap-2 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading && !stats ? (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-3">Cargando metricas...</p>
        </div>
      ) : stats ? (
        <>
          {/* Tarjetas principales */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <MetricCard
              title="Usuarios totales"
              value={String(stats.usuarios.total)}
              subtitle={`${stats.usuarios.suspendidos} suspendidos`}
              icon={Users}
              accent="text-blue-500 bg-blue-50 dark:bg-blue-950/30"
            />
            <MetricCard
              title="Activos (30d)"
              value={String(stats.usuarios.activos30d)}
              subtitle={`${stats.usuarios.activos7d} activos esta semana`}
              icon={Activity}
              accent="text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
            />
            <MetricCard
              title="Nuevos (30d)"
              value={String(stats.usuarios.nuevos30d)}
              subtitle={`${stats.allowlist.total} en allowlist`}
              icon={UserPlus}
              accent="text-purple-500 bg-purple-50 dark:bg-purple-950/30"
            />
            <MetricCard
              title="Invitaciones"
              value={String(stats.invitaciones.activas)}
              subtitle={`${stats.invitaciones.usosTotales} usos · ${stats.invitaciones.agotadas} agotadas`}
              icon={KeyRound}
              accent="text-pink-500 bg-pink-50 dark:bg-pink-950/30"
            />
          </div>

          {/* Curriculum + serie de registros */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-card border border-border rounded-xl shadow-sm p-6 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-muted-foreground" />
                  <h2 className="font-bold text-lg">Registros por día (últimos 30 días)</h2>
                </div>
                <span className="text-xs text-muted-foreground">
                  Total: {stats.usuarios.nuevos30d}
                </span>
              </div>
              <SerieGrafico data={stats.seriePorDia} />
            </div>

            <div className="bg-card border border-border rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <BookA className="w-5 h-5 text-muted-foreground" />
                <h2 className="font-bold text-lg">Currículum</h2>
              </div>
              <div className="flex items-baseline gap-3 mb-4">
                <span className="text-3xl font-extrabold">{stats.curriculum.totalAsignaturas}</span>
                <span className="text-sm text-muted-foreground">asignaturas · {stats.curriculum.totalUnidades} unidades</span>
              </div>
              <ul className="text-xs space-y-1 max-h-64 overflow-y-auto">
                {stats.curriculum.asignaturas.length === 0 ? (
                  <li className="text-muted-foreground italic">Sin datos cargados.</li>
                ) : (
                  stats.curriculum.asignaturas.map((a) => (
                    <li key={a.id} className="flex items-center justify-between border-b border-border/60 last:border-0 py-1">
                      <span className="truncate font-mono text-[11px]">{a.id}</span>
                      <span className="text-muted-foreground">{a.unidades} ud.</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent,
}: {
  title: string
  value: string
  subtitle: string
  icon: any
  accent: string
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col relative overflow-hidden">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${accent}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-sm font-semibold text-muted-foreground mb-1">{title}</div>
      <div className="text-2xl font-extrabold mb-1">{value}</div>
      <div className="text-xs text-muted-foreground">{subtitle}</div>
    </div>
  )
}

/** Mini grafico SVG de barras, sin dependencias externas. */
function SerieGrafico({ data }: { data: Array<{ dia: string; count: number }> }) {
  if (data.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic py-8 text-center">
        No hay registros nuevos en los últimos 30 días.
      </div>
    )
  }

  const max = Math.max(...data.map((d) => d.count), 1)
  const width = 560
  const height = 140
  const barWidth = (width - 20) / data.length - 2

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height + 30}`} className="w-full" preserveAspectRatio="none">
        {data.map((d, i) => {
          const barHeight = (d.count / max) * height
          const x = 10 + i * (barWidth + 2)
          const y = height - barHeight
          return (
            <g key={d.dia}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={2}
                className="fill-primary"
              />
              <title>{`${d.dia}: ${d.count} registro(s)`}</title>
            </g>
          )
        })}
        {/* etiquetas min/max fecha */}
        <text x={10} y={height + 20} className="fill-muted-foreground text-[9px]">
          {data[0]?.dia}
        </text>
        <text x={width - 10} y={height + 20} textAnchor="end" className="fill-muted-foreground text-[9px]">
          {data[data.length - 1]?.dia}
        </text>
      </svg>
    </div>
  )
}
