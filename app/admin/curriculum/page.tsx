"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAdminGuard } from "@/hooks/use-admin-guard"
import {
  BookA,
  Upload,
  FileJson,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Trash2,
  Eye,
  ChevronRight,
  ChevronDown,
  Plus,
  ArrowLeft,
} from "lucide-react"
import { apiFetch, ApiError } from "@/lib/api-client"

interface AsignaturaItem {
  id: string
  asignatura: string | null
  nivel: string | null
  esParvularia: boolean
  actualizadoEn: number | null
  unidades: number
}

interface UnidadDetalle {
  id: string
  numero_unidad: number
  nombre_unidad: string
  proposito: string
  conocimientos: string[]
  habilidades: string[]
  actitudes: string[]
  oas: number
  actividades: number
  evaluaciones: number
}

interface DetalleResponse {
  id: string
  asignatura?: string
  nivel?: string
  esParvularia?: boolean
  unidades: UnidadDetalle[]
}

const NIVELES_DISPONIBLES = [
  "Párvulos",
  "1ro Básico",
  "2do Básico",
  "3ro Básico",
  "4to Básico",
  "5to Básico",
  "6to Básico",
  "7mo Básico",
  "8vo Básico",
  "1ro Medio",
  "2do Medio",
  "3ro Medio",
  "4to Medio",
]

const ASIGNATURAS_COMUNES = [
  "Música",
  "Lenguaje",
  "Matemática",
  "Ciencias Naturales",
  "Historia",
  "Educación Física",
  "Inglés",
  "Artes Visuales",
  "Tecnología",
  "Corporalidad y Movimiento",
]

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const body = error.body as { error?: unknown } | undefined
    return typeof body?.error === "string" ? body.error : error.message
  }
  return error instanceof Error ? error.message : fallback
}

export default function AdminCurriculumPage() {
  const { isReady, isAdmin } = useAdminGuard()
  const [items, setItems] = useState<AsignaturaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [detalleAbierto, setDetalleAbierto] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<DetalleResponse | null>(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)

  const fetchList = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await apiFetch("/api/admin/curriculum")
      const data = await res.json()
      setItems(data.items || [])
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo cargar el listado."))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isReady || !isAdmin) return
    void Promise.resolve().then(fetchList)
  }, [isReady, isAdmin, fetchList])

  const abrirDetalle = async (docId: string) => {
    setDetalleAbierto(docId)
    setDetalle(null)
    setCargandoDetalle(true)
    try {
      const res = await apiFetch(`/api/admin/curriculum/${docId}`)
      const data = await res.json()
      setDetalle(data)
    } catch (err) {
      alert(getErrorMessage(err, "No se pudo cargar el detalle."))
      setDetalleAbierto(null)
    } finally {
      setCargandoDetalle(false)
    }
  }

  const cerrarDetalle = () => {
    setDetalleAbierto(null)
    setDetalle(null)
  }

  const eliminarAsignatura = async (docId: string) => {
    if (!confirm(`⚠️ Eliminar PERMANENTEMENTE la asignatura "${docId}" con todas sus unidades, OAs, actividades y evaluaciones? Esta acción no se puede deshacer.`)) return
    try {
      await apiFetch(`/api/admin/curriculum/${docId}`, { method: "DELETE" })
      await fetchList()
      if (detalleAbierto === docId) cerrarDetalle()
    } catch (err) {
      alert(getErrorMessage(err, "Error al eliminar."))
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (i) =>
        i.id.toLowerCase().includes(q) ||
        (i.asignatura || "").toLowerCase().includes(q) ||
        (i.nivel || "").toLowerCase().includes(q),
    )
  }, [items, query])

  if (!isReady) return <div className="p-8 text-muted-foreground text-sm">Cargando...</div>
  if (!isAdmin) return null

  // Vista detalle
  if (detalleAbierto) {
    return (
      <div className="max-w-5xl mx-auto">
        <button
          onClick={cerrarDetalle}
          className="mb-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Volver al listado
        </button>

        {cargandoDetalle || !detalle ? (
          <div className="py-20 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : (
          <div>
            <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-extrabold mb-1">
                  {detalle.asignatura || detalle.id}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {detalle.nivel && <span className="mr-2">{detalle.nivel}</span>}
                  <span className="font-mono text-xs">{detalle.id}</span>
                  {detalle.esParvularia && (
                    <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 rounded text-xs font-bold">
                      Parvularia
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={() => eliminarAsignatura(detalle.id)}
                className="bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900 font-semibold px-4 py-2 rounded-lg hover:bg-red-100 flex items-center gap-2 text-sm"
              >
                <Trash2 className="w-4 h-4" /> Eliminar asignatura
              </button>
            </div>

            <div className="space-y-3">
              {detalle.unidades.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground bg-card border border-border rounded-xl">
                  Sin unidades cargadas.
                </div>
              ) : (
                detalle.unidades.map((u) => (
                  <div key={u.id} className="bg-card border border-border rounded-xl p-5">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <div className="text-xs font-bold text-muted-foreground">
                          Unidad {u.numero_unidad}
                        </div>
                        <h3 className="font-bold text-lg">{u.nombre_unidad}</h3>
                      </div>
                      <div className="flex gap-1 text-xs flex-shrink-0">
                        <Badge>{u.oas} OA</Badge>
                        <Badge>{u.actividades} act.</Badge>
                        <Badge>{u.evaluaciones} eval.</Badge>
                      </div>
                    </div>
                    {u.proposito && (
                      <p className="text-sm text-muted-foreground mb-3">{u.proposito}</p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <MiniList titulo="Conocimientos" items={u.conocimientos} />
                      <MiniList titulo="Habilidades" items={u.habilidades} />
                      <MiniList titulo="Actitudes" items={u.actitudes} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Vista listado
  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold flex items-center gap-3 mb-2">
            <BookA className="w-8 h-8 text-slate-800 dark:text-slate-200" />
            Gestión del Currículum
          </h1>
          <p className="text-muted-foreground">
            Sube, actualiza o elimina asignaturas completas del currículum oficial.
          </p>
        </div>
        <button
          onClick={fetchList}
          disabled={loading}
          className="bg-slate-900 text-white font-bold px-4 py-2 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-sm shadow-sm disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refrescar
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 p-4 rounded-lg flex items-center gap-2 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      <UploadCard onUploaded={fetchList} />

      {/* Listado */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/20">
          <input
            type="text"
            placeholder="Buscar por asignatura, nivel o id..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {loading ? (
          <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin mb-4" />
            Cargando asignaturas...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            {items.length === 0 ? "No hay currículum cargado." : "No hay resultados para la búsqueda."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-5 py-3 font-semibold">Asignatura / Nivel</th>
                  <th className="px-5 py-3 font-semibold">ID Firestore</th>
                  <th className="px-5 py-3 font-semibold">Unidades</th>
                  <th className="px-5 py-3 font-semibold">Actualizado</th>
                  <th className="px-5 py-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-bold">{item.asignatura || "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.nivel || "—"}
                        {item.esParvularia && (
                          <span className="ml-2 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold">
                            Parvularia
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-muted-foreground">{item.id}</td>
                    <td className="px-5 py-4 font-bold">{item.unidades}</td>
                    <td className="px-5 py-4 text-xs text-muted-foreground">
                      {item.actualizadoEn ? new Date(item.actualizadoEn).toLocaleString() : "—"}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => abrirDetalle(item.id)}
                          className="p-2 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          title="Ver detalle"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => eliminarAsignatura(item.id)}
                          className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                          title="Eliminar asignatura"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-0.5 bg-muted rounded text-xs font-semibold">
      {children}
    </span>
  )
}

function MiniList({ titulo, items }: { titulo: string; items: string[] }) {
  return (
    <div className="bg-muted/30 rounded-lg p-3 border border-border">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
        {titulo}
      </div>
      {items.length === 0 ? (
        <div className="text-muted-foreground italic">—</div>
      ) : (
        <ul className="space-y-0.5">
          {items.slice(0, 4).map((it, i) => (
            <li key={i} className="truncate">• {it}</li>
          ))}
          {items.length > 4 && (
            <li className="text-muted-foreground italic">+{items.length - 4} más</li>
          )}
        </ul>
      )}
    </div>
  )
}

// ── Upload ──────────────────────────────────────────────────────────────────

interface UploadCardProps {
  onUploaded: () => void
}

function UploadCard({ onUploaded }: UploadCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [asignatura, setAsignatura] = useState("")
  const [nivel, setNivel] = useState("")
  const [forceParvularia, setForceParvularia] = useState(false)
  const [fileData, setFileData] = useState<any>(null)
  const [fileName, setFileName] = useState("")
  const [uploading, setUploading] = useState(false)
  const [dryRunResult, setDryRunResult] = useState<any>(null)
  const [uploadStatus, setUploadStatus] = useState<{ success: boolean; message: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setFileData(null)
    setFileName("")
    setDryRunResult(null)
    setUploadStatus(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setUploadStatus(null)
    setDryRunResult(null)

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string)
        setFileData(json)
      } catch (err) {
        setUploadStatus({ success: false, message: "El archivo no es un JSON válido." })
        setFileData(null)
      }
    }
    reader.readAsText(file)
  }

  const previewDryRun = async () => {
    if (!asignatura || !nivel || !fileData) return
    setUploading(true)
    setUploadStatus(null)
    try {
      const res = await apiFetch("/api/admin/curriculum", {
        method: "POST",
        body: JSON.stringify({ asignatura, nivel, data: fileData, forceParvularia, dryRun: true }),
      })
      const data = await res.json()
      setDryRunResult(data)
    } catch (err) {
      setUploadStatus({ success: false, message: getErrorMessage(err, "Error en preview.") })
    } finally {
      setUploading(false)
    }
  }

  const confirmUpload = async () => {
    if (!asignatura || !nivel || !fileData) return
    setUploading(true)
    setUploadStatus(null)
    try {
      const res = await apiFetch("/api/admin/curriculum", {
        method: "POST",
        body: JSON.stringify({ asignatura, nivel, data: fileData, forceParvularia }),
      })
      const data = await res.json()
      const r = data.result
      setUploadStatus({
        success: true,
        message: `✅ ${r.unidadesEscritas} unidades · ${r.oasEscritos} OA · ${r.actividadesEscritas} actividades · ${r.evaluacionesEscritas} evaluaciones escritas.`,
      })
      setAsignatura("")
      setNivel("")
      reset()
      onUploaded()
    } catch (err) {
      setUploadStatus({ success: false, message: getErrorMessage(err, "Error al subir.") })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm mb-6 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between p-5 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Plus className="w-5 h-5" />
          </div>
          <div className="text-left">
            <div className="font-bold">Subir nuevo currículum</div>
            <div className="text-xs text-muted-foreground">
              Carga un JSON del MINEDUC para una asignatura y nivel.
            </div>
          </div>
        </div>
        {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
      </button>

      {expanded && (
        <div className="border-t border-border p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                Asignatura
              </label>
              <input
                type="text"
                list="asig-sugerencias"
                value={asignatura}
                onChange={(e) => setAsignatura(e.target.value)}
                placeholder="Música, Lenguaje..."
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
              />
              <datalist id="asig-sugerencias">
                {ASIGNATURAS_COMUNES.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                Nivel
              </label>
              <select
                value={nivel}
                onChange={(e) => setNivel(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
              >
                <option value="">Selecciona nivel...</option>
                {NIVELES_DISPONIBLES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={forceParvularia}
              onChange={(e) => setForceParvularia(e.target.checked)}
            />
            Forzar formato Parvularia (niveles → unidades)
          </label>

          <label
            className={`
              border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors
              ${uploading ? "bg-muted border-muted-foreground/30" : "border-border hover:border-primary hover:bg-primary/5"}
            `}
          >
            <FileJson className="w-7 h-7 text-muted-foreground mb-2" />
            <span className="text-sm font-bold block mb-1">
              {fileName || "Seleccionar archivo .json"}
            </span>
            <span className="text-xs text-muted-foreground">
              Soporta arrays, { "{unidad: [...]}" } o { "{unidades: [...]}" }
            </span>
            <input
              ref={inputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileSelect}
              disabled={uploading}
            />
          </label>

          {dryRunResult && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl p-4 text-sm">
              <div className="font-bold mb-2 text-blue-900 dark:text-blue-300">
                Vista previa — se escribirá en <span className="font-mono text-xs">curriculo/{dryRunResult.docId}</span>
              </div>
              <div className="text-xs text-blue-800 dark:text-blue-400 mb-3">
                {dryRunResult.preview.totalUnidades} unidades detectadas
                {dryRunResult.preview.isParvularia && " · formato Parvularia"}
              </div>
              <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                {dryRunResult.preview.unidades.map((u: any, i: number) => (
                  <li key={i} className="flex items-center justify-between border-b border-blue-200/30 py-1">
                    <span>
                      <b>Ud {u.numero ?? "?"}:</b> {u.nombre || "(sin nombre)"}
                    </span>
                    <span className="text-blue-700 dark:text-blue-400">
                      {u.oas} OA · {u.actividades} act · {u.evaluaciones} eval
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {uploadStatus && (
            <div
              className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
                uploadStatus.success
                  ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900"
                  : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900"
              }`}
            >
              {uploadStatus.success ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              )}
              {uploadStatus.message}
            </div>
          )}

          <div className="flex flex-wrap gap-2 justify-end">
            <button
              onClick={reset}
              disabled={uploading || !fileData}
              className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50"
            >
              Limpiar
            </button>
            <button
              onClick={previewDryRun}
              disabled={uploading || !asignatura || !nivel || !fileData}
              className="px-4 py-2 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              Vista previa
            </button>
            <button
              onClick={confirmUpload}
              disabled={uploading || !asignatura || !nivel || !fileData}
              className="px-4 py-2 text-sm bg-primary text-white font-bold rounded-lg hover:bg-pink-dark disabled:opacity-50 flex items-center gap-2"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Confirmar y subir
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
