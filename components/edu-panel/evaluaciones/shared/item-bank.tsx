"use client"

// ═══════════════════════════════════════════════════════════════════════════
// Banco de ítems — Drawer lateral derecho
// ─────────────────────────────────────────────────────────────────────────
// Muestra los ítems guardados del usuario con filtros de tipo y búsqueda.
// Permite insertar ítems al editor activo (prueba o guía) y hacer drag &
// drop hacia las secciones del editor.
//
// Refs: Req 8.2, Req 8.4, Req 8.5
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react"
import {
  X, Library, Loader2, Search, BookOpen, Sparkles
} from "lucide-react"
import {
  cargarItemsDelBanco,
  type ItemBankEntry,
} from "@/lib/item-bank"
import {
  tipoCompatibleHaciaGuia,
  tipoCompatibleHaciaPrueba,
} from "@/lib/cross-mapping"
import { cn } from "@/lib/utils"
import { FabricaPreguntasModal } from "./fabrica-preguntas-modal"
import { getFeatureFlags } from "@/lib/feature-flags"

// ─── Props ────────────────────────────────────────────────────────────────

export interface ItemBankProps {
  open: boolean
  onClose: () => void
  /** Tipo de editor activo: determina qué tipos son compatibles para drop */
  editorTipo: "prueba" | "guia"
  /** Callback cuando el usuario quiere insertar un ítem del banco */
  onInsertarItem: (entry: ItemBankEntry) => void
  /** Asignatura activa para pre-filtrar */
  asignatura?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function getTipo(entry: ItemBankEntry): string {
  const p = entry.payload as { tipo?: unknown }
  return typeof p?.tipo === "string" ? p.tipo : "—"
}

function getEnunciado(entry: ItemBankEntry): string {
  const p = entry.payload as { enunciado?: unknown }
  return typeof p?.enunciado === "string" ? p.enunciado : ""
}

function esCompatible(tipo: string, editorTipo: "prueba" | "guia"): boolean {
  if (editorTipo === "prueba") return tipoCompatibleHaciaPrueba(tipo)
  return tipoCompatibleHaciaGuia(tipo)
}

function tooltipIncompatible(tipo: string, editorTipo: "prueba" | "guia"): string {
  return `Tipo '${tipo}' no es compatible con el editor de ${editorTipo === "prueba" ? "pruebas" : "guías"}`
}

const TIPO_LABELS: Record<string, string> = {
  seleccion_multiple: "Sel. múltiple",
  verdadero_falso: "V/F",
  completar: "Completar",
  respuesta_corta: "R. corta",
  ordenar: "Ordenar",
  pareados: "Pareados",
  desarrollo: "Desarrollo",
  abierta: "Abierta",
  encerrar: "Encerrar",
  marcar: "Marcar",
  colorear: "Colorear",
  dibujar: "Dibujar",
  investigar: "Investigar",
  sopa_letras: "Sopa letras",
}

const TIPO_COLORS: Record<string, string> = {
  seleccion_multiple: "bg-blue-100 text-blue-700",
  verdadero_falso: "bg-green-100 text-green-700",
  completar: "bg-pink-100 text-pink-700",
  respuesta_corta: "bg-cyan-100 text-cyan-700",
  ordenar: "bg-amber-100 text-amber-700",
  pareados: "bg-purple-100 text-purple-700",
  desarrollo: "bg-indigo-100 text-indigo-700",
  abierta: "bg-slate-100 text-slate-700",
  encerrar: "bg-rose-100 text-rose-700",
  marcar: "bg-orange-100 text-orange-700",
  colorear: "bg-yellow-100 text-yellow-700",
  dibujar: "bg-teal-100 text-teal-700",
  investigar: "bg-indigo-100 text-indigo-700",
  sopa_letras: "bg-lime-100 text-lime-700",
}

// ─── Componente ───────────────────────────────────────────────────────────

export function ItemBank({
  open,
  onClose,
  editorTipo,
  onInsertarItem,
  asignatura,
}: ItemBankProps) {
  const [items, setItems] = useState<ItemBankEntry[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filtroBusqueda, setFiltroBusqueda] = useState("")
  const [filtroTipo, setFiltroTipo] = useState("")
  const [filtroAsignatura, setFiltroAsignatura] = useState(asignatura || "")
  const [filtroCurso, setFiltroCurso] = useState("")
  const [filtroOa, setFiltroOa] = useState("")
  const [showFabricaModal, setShowFabricaModal] = useState(false)
  const [reloadTrigger, setReloadTrigger] = useState(0)
  const [featureFlags, setFeatureFlags] = useState<Record<string, any>>({})

  useEffect(() => {
    getFeatureFlags().then(setFeatureFlags).catch(console.error)
  }, [])

  const recargarBanco = () => setReloadTrigger(prev => prev + 1)

  // Sincronizar filtro de asignatura con la prop activa al abrir
  useEffect(() => {
    if (open && asignatura) {
      setFiltroAsignatura(asignatura)
    }
  }, [open, asignatura])

  // Cargar ítems al abrir o cuando cambian los filtros de base de datos o reloadTrigger
  useEffect(() => {
    if (!open) return
    let cancel = false
    setCargando(true)
    setError(null)
    cargarItemsDelBanco({
      asignatura: filtroAsignatura || undefined,
      curso: filtroCurso || undefined,
    })
      .then(data => {
        if (!cancel) {
          setItems(data)
          setCargando(false)
        }
      })
      .catch(e => {
        if (!cancel) {
          setError(e?.message || "Error al cargar el banco")
          setCargando(false)
        }
      })
    return () => { cancel = true }
  }, [open, filtroAsignatura, filtroCurso, reloadTrigger])

  // Filtros cliente
  const itemsFiltrados = items.filter(entry => {
    const tipo = getTipo(entry)
    const enunciado = getEnunciado(entry)
    const oas = entry.metadata?.oas ?? []

    if (filtroTipo && tipo !== filtroTipo) return false
    if (filtroOa) {
      const enMetadata = oas.map(o => o.toLowerCase()).includes(filtroOa.toLowerCase())
      const enPayload = (entry.payload as any)?.oaVinculado?.toLowerCase() === filtroOa.toLowerCase()
      if (!enMetadata && !enPayload) return false
    }
    if (filtroBusqueda) {
      const q = filtroBusqueda.toLowerCase()
      if (!enunciado.toLowerCase().includes(q)) return false
    }
    return true
  })

  // Tipos únicos para el select de filtro
  const tiposUnicos = Array.from(new Set(items.map(e => getTipo(e)))).filter(Boolean)

  if (!open) return null

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col",
          "border-l border-border bg-card shadow-2xl",
          "animate-in slide-in-from-right duration-200",
        )}
        role="dialog"
        aria-label="Banco de ítems"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Library className="h-4 w-4 text-primary" />
            <span className="text-[13px] font-extrabold uppercase tracking-wide text-foreground">
              Banco
            </span>
            {featureFlags["fabrica-preguntas"]?.active && (
              <button
                type="button"
                onClick={() => setShowFabricaModal(true)}
                className="ml-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md px-1.5 py-1 flex items-center gap-1 text-[10px] font-bold transition-all shadow-sm cursor-pointer"
              >
                <Sparkles className="h-2.5 w-2.5 text-white animate-pulse" />
                Fábrica IA
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar banco"
            className="rounded p-1 hover:bg-muted/40"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Filtros */}
        <div className="border-b border-border px-4 py-3 space-y-2">
          {/* Búsqueda */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={filtroBusqueda}
              onChange={e => setFiltroBusqueda(e.target.value)}
              placeholder="Buscar por enunciado…"
              className={cn(
                "h-8 w-full rounded border border-border bg-background pl-8 pr-3",
                "text-[12px] outline-none focus:border-primary",
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Asignatura */}
            <div>
              <label className="text-[10px] font-bold text-muted-foreground block mb-0.5">Asignatura</label>
              <select
                value={filtroAsignatura}
                onChange={e => setFiltroAsignatura(e.target.value)}
                className="h-8 w-full rounded border border-border bg-background px-2 text-[11px] outline-none focus:border-primary"
              >
                <option value="">Todas</option>
                <option value="Lenguaje">Lenguaje</option>
                <option value="Matemática">Matemática</option>
                <option value="Historia">Historia</option>
                <option value="Ciencias Naturales">Ciencias Naturales</option>
                <option value="Inglés">Inglés</option>
                <option value="Música">Música</option>
                <option value="Artes Visuales">Artes Visuales</option>
                <option value="Tecnología">Tecnología</option>
              </select>
            </div>

            {/* Curso */}
            <div>
              <label className="text-[10px] font-bold text-muted-foreground block mb-0.5">Curso</label>
              <select
                value={filtroCurso}
                onChange={e => setFiltroCurso(e.target.value)}
                className="h-8 w-full rounded border border-border bg-background px-2 text-[11px] outline-none focus:border-primary"
              >
                <option value="">Todos</option>
                <option value="1° Básico">1° Básico</option>
                <option value="2° Básico">2° Básico</option>
                <option value="3° Básico">3° Básico</option>
                <option value="4° Básico">4° Básico</option>
                <option value="5° Básico">5° Básico</option>
                <option value="6° Básico">6° Básico</option>
                <option value="7° Básico">7° Básico</option>
                <option value="8° Básico">8° Básico</option>
                <option value="I Medio">I Medio</option>
                <option value="II Medio">II Medio</option>
                <option value="III Medio">III Medio</option>
                <option value="IV Medio">IV Medio</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Tipo */}
            <div>
              <label className="text-[10px] font-bold text-muted-foreground block mb-0.5">Tipo</label>
              <select
                value={filtroTipo}
                onChange={e => setFiltroTipo(e.target.value)}
                className="h-8 w-full rounded border border-border bg-background px-2 text-[11px] outline-none focus:border-primary"
              >
                <option value="">Todos</option>
                {tiposUnicos.map(t => (
                  <option key={t} value={t}>{TIPO_LABELS[t] ?? t}</option>
                ))}
              </select>
            </div>

            {/* OA */}
            <div>
              <label className="text-[10px] font-bold text-muted-foreground block mb-0.5">Código OA</label>
              <input
                type="text"
                value={filtroOa}
                onChange={e => setFiltroOa(e.target.value)}
                placeholder="Ej. OA 01"
                className={cn(
                  "h-8 w-full rounded border border-border bg-background px-2",
                  "text-[11px] outline-none focus:border-primary",
                )}
              />
            </div>
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {cargando && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!cargando && error && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">
              {error}
            </div>
          )}

          {!cargando && !error && itemsFiltrados.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BookOpen className="h-8 w-8 text-muted-foreground/40" />
              <p className="mt-2 text-[12.5px] font-semibold text-muted-foreground">
                {items.length === 0
                  ? "El banco está vacío"
                  : "Sin resultados para los filtros aplicados"}
              </p>
              {items.length === 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Guarda ítems desde el editor usando el botón "Guardar al banco".
                </p>
              )}
            </div>
          )}

          {!cargando && !error && itemsFiltrados.map(entry => {
            const tipo = getTipo(entry)
            const enunciado = getEnunciado(entry)
            const oas = entry.metadata?.oas ?? []
            const origen = entry.metadata?.origen ?? "prueba"
            const compatible = esCompatible(tipo, editorTipo)
            const tipoLabel = TIPO_LABELS[tipo] ?? tipo
            const tipoColor = TIPO_COLORS[tipo] ?? "bg-muted text-muted-foreground"

            return (
              <div
                key={entry.id}
                draggable={true}
                onDragStart={e => {
                  e.dataTransfer.setData("item-bank-entry", JSON.stringify(entry))
                  e.dataTransfer.effectAllowed = "copy"
                }}
                className={cn(
                  "rounded-[10px] border border-border bg-background p-3 shadow-sm",
                  "cursor-grab active:cursor-grabbing",
                  !compatible && "opacity-60",
                )}
              >
                {/* Tipo + origen */}
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", tipoColor)}>
                    {tipoLabel}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    {origen === "prueba" ? "Prueba" : "Guía"}
                  </span>
                </div>

                {/* Enunciado truncado */}
                <p className="mb-1.5 text-[12px] text-foreground line-clamp-2">
                  {enunciado
                    ? enunciado.length > 120
                      ? enunciado.slice(0, 120) + "…"
                      : enunciado
                    : <span className="italic text-muted-foreground">Sin enunciado</span>
                  }
                </p>

                {/* OAs */}
                {oas.length > 0 && (
                  <p className="mb-2 text-[10.5px] text-muted-foreground">
                    OAs: {oas.slice(0, 3).join(", ")}{oas.length > 3 ? "…" : ""}
                  </p>
                )}

                {/* Botón insertar */}
                {compatible ? (
                  <button
                    type="button"
                    onClick={() => onInsertarItem(entry)}
                    className={cn(
                      "w-full rounded-[8px] border border-primary/40 bg-primary/10 px-3 py-1.5",
                      "text-[11px] font-bold text-primary transition-colors hover:bg-primary/20",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    )}
                  >
                    Insertar
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    title={tooltipIncompatible(tipo, editorTipo)}
                    aria-label={tooltipIncompatible(tipo, editorTipo)}
                    className={cn(
                      "w-full cursor-not-allowed rounded-[8px] border border-border bg-muted px-3 py-1.5",
                      "text-[11px] font-bold text-muted-foreground",
                    )}
                  >
                    Tipo incompatible con este editor
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <FabricaPreguntasModal
        isOpen={showFabricaModal}
        onClose={() => setShowFabricaModal(false)}
        onSuccess={recargarBanco}
        defaultAsignatura={filtroAsignatura}
      />
    </>
  )
}

export default ItemBank
