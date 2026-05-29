"use client"

import { useEffect, useState } from "react"
import { useAdminGuard } from "@/hooks/use-admin-guard"
import { apiFetch, ApiError } from "@/lib/api-client"
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Database,
  FolderArchive,
  Loader2,
  Play,
  RefreshCw,
  Server,
  ShieldCheck,
} from "lucide-react"

interface BackupConfig {
  executionTarget: "local" | "ssh"
  outDir: string
  retentionDays: number
  keepPlainJson: boolean
  remoteConfigured: boolean
  remoteEnabledByDefault: boolean
  remoteUser: string | null
  remoteHost: string | null
  remotePort: string | null
  remoteDir: string | null
  hasIdentityFile: boolean
  sshConfigured: boolean
  sshHostAlias: string | null
  sshRunnerDir: string | null
}

interface BackupRunRecord {
  ok: boolean
  trigger: string
  startedAt: string
  finishedAt: string
  durationMs?: number
  format?: string
  projectId?: string
  collectionCount?: number
  documentCount?: number
  localJsonPath?: string | null
  localArchivePath?: string | null
  checksumPath?: string | null
  checksum?: string | null
  keepPlainJson?: boolean
  removedByRetention?: string[]
  remote?: {
    host?: string
    user?: string
    dir?: string
    files?: string[]
  } | null
  message?: string
}

interface BackupStatus {
  version: number
  updatedAt: string | null
  running: {
    pid: number
    startedAt: string
    trigger: string
    outDir: string
    remoteRequested: boolean
  } | null
  lastSuccess: BackupRunRecord | null
  lastFailure: BackupRunRecord | null
}

interface RecentBackupArtifact {
  baseName: string
  archiveName: string
  archivePath: string
  checksumName: string | null
  checksumPath: string | null
  sizeBytes: number
  modifiedAt: string
}

interface ScheduledTaskSummary {
  installed: boolean
  taskName: string
  state: string | null
  lastRunTime: string | null
  nextRunTime: string | null
  lastTaskResult: number | null
  action: string | null
  trigger: string | null
}

interface BackupDashboardResponse {
  config: BackupConfig
  schedule: ScheduledTaskSummary
  status: BackupStatus
  recentBackups: RecentBackupArtifact[]
  serverTime: string
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const body = error.body as { error?: unknown } | undefined
    return typeof body?.error === "string" ? body.error : error.message
  }
  return error instanceof Error ? error.message : fallback
}

function formatDate(value?: string | null): string {
  if (!value) return "Sin dato"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return "Sin dato"
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes <= 0) return `${seconds}s`
  return `${minutes}m ${seconds}s`
}

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function AdminMantenimientoPage() {
  const { isReady, isAdmin } = useAdminGuard()
  const [data, setData] = useState<BackupDashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [runningManual, setRunningManual] = useState(false)
  const [error, setError] = useState("")
  const [actionMessage, setActionMessage] = useState("")

  const fetchDashboard = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }

    try {
      setError("")
      const res = await apiFetch("/api/admin/backups")
      const payload = (await res.json()) as BackupDashboardResponse
      setData(payload)
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudo cargar el estado de respaldos."))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRunBackup = async () => {
    setRunningManual(true)
    setActionMessage("")
    try {
      const res = await apiFetch("/api/admin/backups", {
        method: "POST",
        body: JSON.stringify({}),
      })
      const payload = (await res.json()) as { message?: string }
      setActionMessage(payload.message || "Respaldo iniciado.")
      window.setTimeout(() => {
        void fetchDashboard({ silent: true })
      }, 1200)
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudo iniciar el respaldo."))
    } finally {
      setRunningManual(false)
    }
  }

  useEffect(() => {
    if (isReady && isAdmin) {
      void fetchDashboard()
    }
  }, [isReady, isAdmin])

  useEffect(() => {
    if (!isReady || !isAdmin || !data) return
    const delay = data.status.running ? 5000 : 30000
    const timer = window.setTimeout(() => {
      void fetchDashboard({ silent: true })
    }, delay)
    return () => window.clearTimeout(timer)
  }, [isReady, isAdmin, data?.status.running, data?.status.updatedAt])

  if (!isReady) return <div className="p-8 text-muted-foreground text-sm">Cargando...</div>
  if (!isAdmin) return null

  const latest = data?.status.lastSuccess
  const latestFailure = data?.status.lastFailure
  const running = data?.status.running

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold flex items-center gap-3 mb-2">
            <Database className="w-8 h-8 text-slate-800 dark:text-slate-200" />
            Respaldo de Firestore
          </h1>
          <p className="text-muted-foreground">
            Respaldo automatico cada 1 hora y disparo manual desde admin.
            {data?.serverTime ? (
              <span className="ml-2 text-xs">Ultima lectura: {formatDate(data.serverTime)}</span>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void fetchDashboard({ silent: true })}
            disabled={refreshing || loading}
            className="border border-border bg-card font-semibold px-4 py-2 rounded-lg hover:bg-muted flex items-center gap-2 text-sm disabled:opacity-50"
          >
            {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Actualizar
          </button>
          <button
            onClick={handleRunBackup}
            disabled={runningManual || !!running}
            className="bg-slate-900 text-white font-bold px-4 py-2 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-sm disabled:opacity-50"
          >
            {runningManual || running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? "Respaldo en curso" : "Respaldar ahora"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-6 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 p-4 rounded-lg flex items-center gap-2 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      ) : null}

      {actionMessage ? (
        <div className="mb-6 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300 p-4 rounded-lg flex items-center gap-2 text-sm">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          {actionMessage}
        </div>
      ) : null}

      {latestFailure && !running ? (
        <div className="mb-6 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300 p-4 rounded-lg flex items-center gap-2 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          Ultimo fallo: {latestFailure.message || "Error sin detalle"}.
          <span className="text-xs">Termino: {formatDate(latestFailure.finishedAt)}</span>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-3">Cargando estado de respaldos...</p>
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <InfoCard
              title="Automatico"
              value={data.schedule.installed ? "Activo" : "No instalado"}
              subtitle={
                data.schedule.installed
                  ? `Siguiente ejecucion: ${formatDate(data.schedule.nextRunTime)}`
                  : "Falta registrar la tarea horaria"
              }
              icon={Clock3}
              accent="text-blue-600 bg-blue-50 dark:bg-blue-950/30"
            />
            <InfoCard
              title="Ultimo respaldo"
              value={latest ? formatDate(latest.finishedAt) : "Sin respaldos"}
              subtitle={
                latest
                  ? `${latest.documentCount || 0} docs · ${latest.collectionCount || 0} colecciones`
                  : "Aun no hay historial exitoso"
              }
              icon={FolderArchive}
              accent="text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30"
            />
            <InfoCard
              title="Ejecucion"
              value={data.config.executionTarget === "ssh" ? "Ubuntu" : "Windows local"}
              subtitle={
                data.config.executionTarget === "ssh"
                  ? `${data.config.sshHostAlias || "Sin alias"} · runner remoto`
                  : "El scheduler corre en este equipo"
              }
              icon={Server}
              accent="text-amber-600 bg-amber-50 dark:bg-amber-950/30"
            />
            <InfoCard
              title="Retencion local"
              value={data.config.retentionDays > 0 ? `${data.config.retentionDays} dias` : "Sin poda"}
              subtitle={data.config.keepPlainJson ? "Guarda JSON y GZ" : "Guarda solo GZ"}
              icon={ShieldCheck}
              accent="text-violet-600 bg-violet-50 dark:bg-violet-950/30"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
            <section className="bg-card border border-border rounded-xl shadow-sm p-6 xl:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <Database className="w-5 h-5 text-muted-foreground" />
                <h2 className="font-bold text-lg">Estado operativo</h2>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <DetailRow label="Tarea programada" value={data.schedule.taskName} />
                <DetailRow label="Estado scheduler" value={data.schedule.state || "Sin dato"} />
                <DetailRow label="Ultima ejecucion scheduler" value={formatDate(data.schedule.lastRunTime)} />
                <DetailRow label="Proxima ejecucion" value={formatDate(data.schedule.nextRunTime)} />
                <DetailRow label="Ultimo resultado" value={String(data.schedule.lastTaskResult ?? "Sin dato")} />
                <DetailRow label="Trigger" value={data.schedule.trigger || "Sin dato"} />
                <DetailRow label="Carpeta de backups" value={data.config.outDir} mono />
                <DetailRow
                  label={data.config.executionTarget === "ssh" ? "Runner SSH" : "Copia remota"}
                  value={
                    data.config.executionTarget === "ssh"
                      ? `${data.config.sshHostAlias || "Sin alias"}:${data.config.sshRunnerDir || "Sin ruta"}`
                      : data.config.remoteConfigured
                        ? `${data.config.remoteUser}@${data.config.remoteHost}:${data.config.remoteDir}`
                        : "No configurado"
                  }
                  mono
                />
              </dl>

              <div className="mt-5 pt-5 border-t border-border">
                {running ? (
                  <div className="flex items-start gap-3 text-sm">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-600 mt-0.5" />
                    <div>
                      <div className="font-semibold">Hay un respaldo corriendo ahora mismo.</div>
                      <div className="text-muted-foreground mt-1">
                        Inicio: {formatDate(running.startedAt)} · Origen: {running.trigger} · PID: {running.pid}
                      </div>
                    </div>
                  </div>
                ) : latest ? (
                  <div className="text-sm text-muted-foreground">
                    Ultimo respaldo exitoso: {latest.projectId || "Sin proyecto"} · demora {formatDuration(latest.durationMs)} · archivo{" "}
                    <span className="font-mono text-[12px]">{latest.localArchivePath || "Sin ruta"}</span>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Todavia no hay un respaldo exitoso registrado.</div>
                )}
              </div>
            </section>

            <section className="bg-card border border-border rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <Play className="w-5 h-5 text-muted-foreground" />
                <h2 className="font-bold text-lg">Disparo manual</h2>
              </div>

              <p className="text-sm text-muted-foreground mb-4">
                {data.config.executionTarget === "ssh"
                  ? "El boton dispara el mismo runner que esta instalado en Ubuntu. No depende de que este encendido este Windows."
                  : "El boton ejecuta el mismo script del scheduler local."}
              </p>

              <button
                onClick={handleRunBackup}
                disabled={runningManual || !!running}
                className="w-full bg-slate-900 text-white font-bold px-4 py-3 rounded-lg hover:bg-slate-800 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
              >
                {runningManual || running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {running ? "Esperando fin del respaldo actual" : "Lanzar respaldo manual"}
              </button>

              <div className="mt-4 text-xs text-muted-foreground space-y-2">
                <div>Modo de ejecucion: {data.config.executionTarget === "ssh" ? "Runner Ubuntu por SSH" : "Local Windows"}</div>
                <div>JSON plano local: {data.config.keepPlainJson ? "Se conserva" : "Se elimina tras comprimir"}</div>
                <div>Poda local: {data.config.retentionDays > 0 ? `cada corrida mantiene ${data.config.retentionDays} dias` : "desactivada"}</div>
              </div>
            </section>
          </div>

          <section className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-lg">Respaldos recientes</h2>
                <p className="text-sm text-muted-foreground">
                  {data.config.executionTarget === "ssh"
                    ? "Ultimos archivos detectados en la carpeta de backups del Ubuntu."
                    : "Ultimos archivos detectados en la carpeta local."}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Archivo</th>
                    <th className="px-6 py-3 font-semibold">Tamano</th>
                    <th className="px-6 py-3 font-semibold">Modificado</th>
                    <th className="px-6 py-3 font-semibold">Checksum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.recentBackups.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                        No se encontraron respaldos todavia.
                      </td>
                    </tr>
                  ) : (
                    data.recentBackups.map((backup) => (
                      <tr key={backup.baseName} className="hover:bg-muted/20 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-medium">{backup.archiveName}</div>
                          <div className="text-xs text-muted-foreground font-mono mt-1">{backup.archivePath}</div>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">{formatBytes(backup.sizeBytes)}</td>
                        <td className="px-6 py-4 text-muted-foreground">{formatDate(backup.modifiedAt)}</td>
                        <td className="px-6 py-4 text-muted-foreground">{backup.checksumName || "Sin .sha256"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}

function InfoCard({
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
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${accent}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-sm font-semibold text-muted-foreground mb-1">{title}</div>
      <div className="text-xl font-extrabold mb-1">{value}</div>
      <div className="text-xs text-muted-foreground">{subtitle}</div>
    </div>
  )
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={mono ? "font-mono text-[12px] break-all" : "font-medium"}>{value}</div>
    </div>
  )
}
