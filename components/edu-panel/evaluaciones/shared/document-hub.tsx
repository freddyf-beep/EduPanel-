"use client"

// ═══════════════════════════════════════════════════════════════════════════
// DocumentHub — Shell genérico para hubs de Pruebas y Guías
// ─────────────────────────────────────────────────────────────────────────
// Encapsula todo el ciclo de vida común a un hub de documentos evaluativos:
//
//   • URL state (curso, unidadId) lifteado de los search params.
//   • Carga de documentos propios + documentos del otro tipo (cobertura).
//   • Métricas, búsqueda normalizada y filtro por tipo (segmented).
//   • Confirmación de eliminación vía `window.confirm`.
//   • Render: CursoUnidadSelector → HubHeader → MetricsGrid → FilterBar
//     → grid de DocumentCard → modales IA / Importación.
//
// Las particularidades de cada variante (badge labels, mini-stats, action
// set, modal de importación, filtros adicionales) se inyectan vía el objeto
// `config` descrito por `DocumentHubConfig<T>`.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Search } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { useActiveSubject } from "@/hooks/use-active-subject"
import { cargarPlanCurso, type UnidadPlan } from "@/lib/curriculo"

import { CursoUnidadSelector } from "./curso-unidad-selector"
import { VerCoberturaButton } from "./ver-cobertura-button"
import { HubHeader } from "./hub-header"
import { MetricsGrid } from "./metrics-grid"
import { FilterBar } from "./filter-bar"
import {
  DocumentCard,
  type DocumentCardAction,
  type DocumentCardBadge,
  type DocumentCardMiniStat,
} from "./document-card"
import { EmptyState } from "./empty-state"
import { ErrorBanner } from "./error-banner"
import { HubSkeleton } from "./loading-skeleton"

// ─── Tipos públicos ─────────────────────────────────────────────────────────

export type DocumentHubVariant = "prueba" | "guia"
export type DocumentHubAccent = "rose" | "violet"

/** Campos mínimos que cualquier documento evaluativo debe exponer. */
export interface BaseDocumento {
  id: string
  nombre?: string
  estado?: string
  unidadId?: string
  unidadNombre?: string
  curso?: string
}

export interface DocumentHubCardHandlers {
  onEditar: () => void
  onAplicar: () => void
  onVistaAlumno: () => void
  onPauta: () => void
  onDuplicar: () => void
  onEliminar: () => void
}

export interface CardBuilder<T> {
  badges: (doc: T) => DocumentCardBadge[]
  subtitle: (doc: T) => string
  miniStats: (doc: T) => DocumentCardMiniStat[]
  numeroLabel?: (doc: T) => string | undefined
  objetivoPreview?: (doc: T) => string | undefined
  actions: (doc: T, handlers: DocumentHubCardHandlers) => DocumentCardAction[]
}

export interface HubAction {
  label: string
  icon: LucideIcon
  onClick: () => void
  disabled?: boolean
}

/**
 * Acción secundaria extendida. La variante `openImport` indica que el botón
 * debe abrir el modal de importación interno (sólo aplica si el config
 * provee `ImportModal`).
 */
export type SecondaryAction =
  | (HubAction & { kind?: "default" })
  | { kind: "openImport"; label: string; icon: LucideIcon; disabled?: boolean }

export interface IAModalCommonProps {
  open: boolean
  onClose: () => void
  /** @deprecated El modal ahora carga sus OAs internamente con `unidadId`. */
  oasDisponibles: Array<{ code: string; descripcion: string }>
  cursoLabel?: string
  unidadLabel?: string
  asignatura?: string
  curso?: string
  /** Unidad activa. El modal la usa para cargar los OAs correctos. */
  unidadId?: string
}

export interface ImportModalProps {
  curso: string
  abierto: boolean
  onClose: () => void
}

export interface ExtraFiltersRenderProps {
  /** Restablece todos los filtros (incluyendo los comunes). */
  resetAll: () => void
  /** `true` si hay al menos un filtro activo. */
  hasActiveFilters: boolean
}

export interface DocumentHubConfig<T extends BaseDocumento> {
  variant: DocumentHubVariant
  accent: DocumentHubAccent
  title: string
  subtitle: string
  headerIcon: LucideIcon
  cardIcon: LucideIcon

  /** Carga los documentos del tipo propio filtrados por asignatura+curso. */
  loadDocuments: (asignatura: string, curso: string) => Promise<T[]>
  /** Carga documentos del otro tipo (para el botón de cobertura). */
  loadOtherDocs: (asignatura: string, curso: string) => Promise<readonly unknown[]>
  /** Elimina el documento por id. */
  deleteDocument: (id: string) => Promise<void>
  /** Duplica el documento devolviendo la copia creada. */
  duplicateDocument: (doc: T) => Promise<T>
  /** Navega al editor del documento. */
  goToEditor: (doc: T) => void
  /** Navega a la vista de resultados/aplicación (pruebas). Opcional. */
  goToResults?: (doc: T) => void
  /** Exporta el documento a PDF (vista alumno / pauta). */
  exportDocument: (doc: T, modo: "para_alumno" | "con_pauta") => Promise<void> | void

  /** Acción primaria del header (ej. "Crear con IA"). */
  primaryAction: HubAction
  /** Acciones secundarias del header (ej. "Crear manual", "Importar Word"). */
  secondaryActions: SecondaryAction[]

  /** Calcula las métricas a partir de los documentos. */
  computeMetrics: (docs: T[]) => Array<{ label: string; value: number | string }>

  /** Opciones del segmented filter de tipo (key, label). */
  filterOptions: Array<[string, string]>
  /** Decide si un documento pasa el filtro activo. */
  filterMatcher: (doc: T, activeFilter: string) => boolean
  /** Placeholder del input de búsqueda. */
  searchPlaceholder: string
  /** Predicado de búsqueda opcional (default: nombre + unidadNombre). */
  searchPredicate?: (doc: T, normalizedQuery: string) => boolean
  /**
   * Predicado adicional aplicado DESPUÉS de los filtros comunes. Permite a
   * la variante añadir criterios propios (ej. filtro de estado / OA en
   * Guías) sin acoplarse al shell.
   */
  extraFilterPredicate?: (doc: T) => boolean

  /** Builder de los datos que consume `DocumentCard`. */
  cardBuilder: CardBuilder<T>

  /** Callback para navegar al editor del otro tipo (botón cobertura). */
  onOpenOther: (other: any) => void

  /** Modal de IA (siempre requerido). */
  IAModal: React.ComponentType<IAModalCommonProps>
  /** Loader de OAs para el modal IA. */
  loadOAsForIA: (
    asignatura: string,
    curso: string,
    unidadId: string,
  ) => Promise<Array<{ code: string; descripcion: string }>>

  /** Modal de importación opcional (ej. pruebas desde .docx). */
  ImportModal?: React.ComponentType<ImportModalProps>

  /** Slot para filtros adicionales debajo del FilterBar común. */
  extraFilters?: (props: ExtraFiltersRenderProps) => ReactNode
}

// ─── Helpers internos ───────────────────────────────────────────────────────

/** Normaliza una cadena: NFD + sin marcas combinantes + lowercase + trim. */
function normalizeQuery(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function defaultSearchPredicate<T extends BaseDocumento>(
  doc: T,
  normalizedQuery: string,
): boolean {
  const haystack = [doc.nombre || "", doc.unidadNombre || ""]
    .map(normalizeQuery)
    .join(" ")
  return haystack.includes(normalizedQuery)
}

// ─── Componente ─────────────────────────────────────────────────────────────

export function DocumentHub<T extends BaseDocumento>(
  config: DocumentHubConfig<T>,
) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { asignatura } = useActiveSubject()

  // URL state
  const cursoFromUrl = searchParams.get("curso") || ""
  const unidadIdFromUrl = searchParams.get("unidadId") || ""
  const [curso, setCurso] = useState<string>(cursoFromUrl)
  const [unidadId, setUnidadId] = useState<string>(unidadIdFromUrl)

  useEffect(() => {
    setCurso(cursoFromUrl)
  }, [cursoFromUrl])
  useEffect(() => {
    setUnidadId(unidadIdFromUrl)
  }, [unidadIdFromUrl])

  // Carga
  const [docs, setDocs] = useState<T[]>([])
  const [otherDocs, setOtherDocs] = useState<readonly unknown[]>([])
  const [unidades, setUnidades] = useState<UnidadPlan[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Búsqueda
  const [busqueda, setBusqueda] = useState("")
  const [busquedaNormalizada, setBusquedaNormalizada] = useState("")
  const [filtroTipo, setFiltroTipo] = useState<string>("todas")

  // Modales
  const [iaAbierto, setIaAbierto] = useState(false)
  const [importAbierto, setImportAbierto] = useState(false)
  const [oasParaIa, setOasParaIa] = useState<
    Array<{ code: string; descripcion: string }>
  >([])

  // ── Refresco de datos ──────────────────────────────────────────────────
  const refrescarRef = useRef<() => void>(undefined)
  refrescarRef.current = () => {
    if (!curso) {
      setDocs([])
      setOtherDocs([])
      setUnidades([])
      setError(null)
      return
    }
    setCargando(true)
    setError(null)
    config
      .loadDocuments(asignatura, curso)
      .then(setDocs)
      .catch((e: Error) =>
        setError(e?.message || "No pude cargar los documentos."),
      )
      .finally(() => setCargando(false))

    config
      .loadOtherDocs(asignatura, curso)
      .then(setOtherDocs)
      .catch(() => {})

    cargarPlanCurso(asignatura, curso)
      .then(plan => setUnidades(plan?.units || []))
      .catch(() => {})
  }

  useEffect(() => {
    refrescarRef.current?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asignatura, curso])

  const unidadActiva = useMemo(
    () => unidades.find(u => String(u.id) === String(unidadId)) || null,
    [unidades, unidadId],
  )

  // ── Carga de OAs para el modal IA ──────────────────────────────────────
  useEffect(() => {
    if (!iaAbierto) return
    if (!curso || !unidadId) {
      setOasParaIa([])
      return
    }
    let cancelled = false
    config
      .loadOAsForIA(asignatura, curso, unidadId)
      .then(oas => {
        if (cancelled) return
        const filtrados = oas
          .filter((oa: any) => oa.tipo !== "oat")
          .map((oa: any) => ({ code: oa.id, descripcion: oa.descripcion }))
        setOasParaIa(filtrados)
      })
      .catch(() => {
        if (!cancelled) setOasParaIa([])
      })
    return () => {
      cancelled = true
    }
  }, [iaAbierto, asignatura, curso, unidadId, config])

  // ── Métricas ───────────────────────────────────────────────────────────
  const metricas = useMemo(() => config.computeMetrics(docs), [config, docs])

  // ── Filtrado ───────────────────────────────────────────────────────────
  const searchPredicate = config.searchPredicate ?? defaultSearchPredicate
  const docsFiltrados = useMemo(() => {
    let r = docs
    if (unidadId) r = r.filter(d => String(d.unidadId || "") === String(unidadId))
    if (filtroTipo !== "todas") r = r.filter(d => config.filterMatcher(d, filtroTipo))
    const q = busquedaNormalizada
    if (q) r = r.filter(d => searchPredicate(d, q))
    if (config.extraFilterPredicate) r = r.filter(config.extraFilterPredicate)
    return r
  }, [
    docs,
    filtroTipo,
    busquedaNormalizada,
    unidadId,
    config,
    searchPredicate,
  ])

  const tieneFiltrosActivos =
    filtroTipo !== "todas" || !!busqueda.trim() || !!unidadId

  // ── Handlers ───────────────────────────────────────────────────────────
  const limpiarFiltrosComunes = () => {
    setBusqueda("")
    setBusquedaNormalizada("")
    setFiltroTipo("todas")
  }

  const handleDuplicar = async (doc: T) => {
    try {
      const copia = await config.duplicateDocument(doc)
      setDocs(prev => [copia as T, ...prev])
    } catch (e) {
      console.error(e)
      setError(
        e instanceof Error ? e.message : "No pude duplicar el documento.",
      )
    }
  }

  const handleEliminar = async (doc: T) => {
    const nombre = doc.nombre || "este documento"
    if (
      !window.confirm(
        `¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`,
      )
    ) {
      return
    }
    try {
      await config.deleteDocument(doc.id)
      setDocs(prev => prev.filter(d => d.id !== doc.id))
    } catch (e) {
      console.error(e)
      setError(
        e instanceof Error ? e.message : "No pude eliminar el documento.",
      )
    }
  }

  const handleExportar = (doc: T, modo: "para_alumno" | "con_pauta") => {
    return Promise.resolve(config.exportDocument(doc, modo)).catch(e => {
      console.error(e)
      setError(e instanceof Error ? e.message : "No pude exportar el documento.")
    })
  }

  const buildHandlers = (doc: T): DocumentHubCardHandlers => ({
    onEditar: () => config.goToEditor(doc),
    onAplicar: () => config.goToResults?.(doc),
    onVistaAlumno: () => void handleExportar(doc, "para_alumno"),
    onPauta: () => void handleExportar(doc, "con_pauta"),
    onDuplicar: () => void handleDuplicar(doc),
    onEliminar: () => void handleEliminar(doc),
  })

  // ── Render ─────────────────────────────────────────────────────────────
  const IAModal = config.IAModal
  const ImportModal = config.ImportModal

  return (
    <div className="space-y-4">
      <CursoUnidadSelector
        curso={curso}
        setCurso={setCurso}
        unidadId={unidadId}
        setUnidadId={setUnidadId}
        accent={config.accent}
        extra={
          <VerCoberturaButton
            unidad={unidadActiva}
            pruebas={config.variant === "prueba" ? (docs as any) : (otherDocs as any)}
            guias={config.variant === "guia" ? (docs as any) : (otherDocs as any)}
            onOpenPrueba={p =>
              config.variant === "prueba"
                ? config.goToEditor(p as unknown as T)
                : (config.onOpenOther as any)(p)
            }
            onOpenGuia={g =>
              config.variant === "guia"
                ? config.goToEditor(g as unknown as T)
                : (config.onOpenOther as any)(g)
            }
            accent={config.accent}
          />
        }
      />

      <HubHeader
        accent={config.accent}
        icon={config.headerIcon}
        title={config.title}
        subtitle={config.subtitle}
        primary={{
          label: config.primaryAction.label,
          icon: config.primaryAction.icon,
          // El botón primario del hub siempre abre el modal IA.
          onClick: () => setIaAbierto(true),
          disabled: !curso || config.primaryAction.disabled,
        }}
        secondary={config.secondaryActions.map(a => {
          if ("kind" in a && a.kind === "openImport") {
            return {
              label: a.label,
              icon: a.icon,
              onClick: () => setImportAbierto(true),
              disabled: !curso || a.disabled,
            }
          }
          return {
            ...a,
            disabled: !curso || a.disabled,
          }
        })}
      />

      {docs.length > 0 && (
        <MetricsGrid accent={config.accent} items={metricas} />
      )}

      {docs.length > 0 && (
        <div className="space-y-3">
          <FilterBar
            accent={config.accent}
            q={busqueda}
            setQ={setBusqueda}
            onNormalizedChange={setBusquedaNormalizada}
            filters={config.filterOptions}
            active={filtroTipo}
            setActive={setFiltroTipo}
            placeholder={config.searchPlaceholder}
          />
          {config.extraFilters?.({
            resetAll: limpiarFiltrosComunes,
            hasActiveFilters: tieneFiltrosActivos,
          })}
        </div>
      )}

      {error && (
        <ErrorBanner
          message={error}
          onRetry={() => {
            setError(null)
            refrescarRef.current?.()
          }}
          onDismiss={() => setError(null)}
        />
      )}

      {cargando ? (
        <HubSkeleton accent={config.accent} />
      ) : docs.length === 0 ? (
        <EmptyState
          accent={config.accent}
          icon={config.cardIcon}
          title={
            curso
              ? `Aún no hay documentos para ${curso}`
              : "Selecciona un curso para empezar"
          }
          text="Crea tu primer documento con IA, manualmente o importa uno existente."
          action={
            curso
              ? {
                  label: config.primaryAction.label,
                  icon: config.primaryAction.icon,
                  onClick: () => setIaAbierto(true),
                }
              : undefined
          }
          secondaryAction={
            curso && config.secondaryActions[0]
              ? (() => {
                  const a = config.secondaryActions[0]
                  if ("kind" in a && a.kind === "openImport") {
                    return {
                      label: a.label,
                      icon: a.icon,
                      onClick: () => setImportAbierto(true),
                    }
                  }
                  return {
                    label: a.label,
                    icon: a.icon,
                    onClick: a.onClick,
                  }
                })()
              : undefined
          }
        />
      ) : docsFiltrados.length === 0 ? (
        <EmptyState
          accent={config.accent}
          icon={Search}
          title="No hay documentos que coincidan"
          text="Ajusta tu búsqueda o limpia los filtros para ver todos los documentos del curso."
          action={
            tieneFiltrosActivos
              ? { label: "Limpiar filtros", onClick: limpiarFiltrosComunes }
              : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {docsFiltrados.map(doc => {
            const card = config.cardBuilder
            const numeroLabel = card.numeroLabel?.(doc)
            const objetivoPreview = card.objetivoPreview?.(doc)
            return (
              <DocumentCard
                key={doc.id}
                variant={config.variant}
                accent={config.accent}
                icon={config.cardIcon}
                badges={card.badges(doc)}
                title={doc.nombre || "Sin nombre"}
                subtitle={card.subtitle(doc)}
                numeroLabel={numeroLabel}
                objetivoPreview={objetivoPreview}
                miniStats={card.miniStats(doc)}
                actions={card.actions(doc, buildHandlers(doc))}
                onClick={() => config.goToEditor(doc)}
              />
            )
          })}
        </div>
      )}

      <IAModal
        open={iaAbierto}
        onClose={() => setIaAbierto(false)}
        oasDisponibles={oasParaIa}
        cursoLabel={curso}
        unidadLabel={unidadActiva?.name}
        asignatura={asignatura}
        curso={curso}
        unidadId={unidadId}
      />

      {ImportModal && (
        <ImportModal
          curso={curso}
          abierto={importAbierto}
          onClose={() => {
            setImportAbierto(false)
            refrescarRef.current?.()
          }}
        />
      )}
    </div>
  )
}
