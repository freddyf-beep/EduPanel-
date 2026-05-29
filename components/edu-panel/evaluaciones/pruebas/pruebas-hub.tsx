"use client"

// ═══════════════════════════════════════════════════════════════════════════
// PruebasHub — Hub unificado de Pruebas
// ─────────────────────────────────────────────────────────────────────────
// Compone los componentes shared del flujo unificado:
//   • CursoUnidadSelector (sticky bar) — task 2.2
//   • HubHeader (accent rose) con acciones IA / manual / Word — task 1.9
//   • MetricsGrid con las 4 métricas de Req 2.3 — task 1.7
//   • FilterBar con búsqueda normalizada y segmented control — task 1.8
//   • DocumentCard variant="prueba" para cada prueba — task 1.10
//   • EmptyState (sin docs / sin coincidencias) — task 1.3
//   • ErrorBanner para errores de carga — task 1.5
//   • HubSkeleton durante la carga — task 1.4
//   • IAStructuredModalPrueba para "Crear con IA" — task 5.1
//   • PruebaImportModal para "Importar Word" — task 5.5
//
// El hub mantiene el contrato actual con `lib/pruebas.ts`:
//   - `cargarPruebas(asignatura, curso)` para cargar el listado.
//   - `eliminarPrueba(id)` y `duplicarPrueba(p)` desde las acciones de card.
//   - `abrirPruebaImprimible({...})` para Vista alumno y Pauta.
// No se modifican firmas ni interfaces de `lib/pruebas.ts`.
//
// Refs: Req 2.1, Req 2.2, Req 2.3, Req 2.4, Req 2.5, Req 2.6, Req 2.7,
//       Req 2.8, Req 2.9, Req 2.10, Req 2.11, Req 2.12, Req 2.13, Req 2.14,
//       Req 2.15, Req 2.16, Req 2.17, Req 2.18
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Copy,
  Edit2,
  Eye,
  FileCheck,
  FileText,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Users,
} from "lucide-react"

import { useActiveSubject } from "@/hooks/use-active-subject"
import { buildUrl, withAsignatura } from "@/lib/shared"
import {
  cargarPruebas,
  cargarOAsParaPrueba,
  duplicarPrueba,
  eliminarPrueba,
  type PruebaTemplate,
} from "@/lib/pruebas"
import { cargarPlanCurso, type UnidadPlan } from "@/lib/curriculo"
import { cargarGuias, type GuiaTemplate } from "@/lib/guias"
import { abrirPruebaImprimible } from "@/lib/export/prueba-pdf"
import { cargarInfoColegio } from "@/lib/perfil"

import { CursoUnidadSelector } from "@/components/edu-panel/evaluaciones/shared/curso-unidad-selector"
import { VerCoberturaButton } from "@/components/edu-panel/evaluaciones/shared/ver-cobertura-button"
import { HubHeader } from "@/components/edu-panel/evaluaciones/shared/hub-header"
import { MetricsGrid } from "@/components/edu-panel/evaluaciones/shared/metrics-grid"
import { FilterBar } from "@/components/edu-panel/evaluaciones/shared/filter-bar"
import {
  DocumentCard,
  type DocumentCardAction,
  type DocumentCardBadge,
} from "@/components/edu-panel/evaluaciones/shared/document-card"
import { EmptyState } from "@/components/edu-panel/evaluaciones/shared/empty-state"
import { ErrorBanner } from "@/components/edu-panel/evaluaciones/shared/error-banner"
import { HubSkeleton } from "@/components/edu-panel/evaluaciones/shared/loading-skeleton"
import {
  IAStructuredModalPrueba,
  type IAStructuredModalPruebaParams,
} from "@/components/edu-panel/evaluaciones/shared/ia-structured-modal-prueba"
import { PruebaImportModal } from "./prueba-import-modal"

// ─── Constantes ─────────────────────────────────────────────────────────────

type FiltroTipo =
  | "todas"
  | "sumativa"
  | "formativa"
  | "diagnostica"
  | "borrador"

const FILTROS: Array<[FiltroTipo, string]> = [
  ["todas", "Todas"],
  ["sumativa", "Sumativas"],
  ["formativa", "Formativas"],
  ["diagnostica", "Diagnósticas"],
  ["borrador", "Borradores"],
]

/** Normaliza una cadena para búsqueda: NFD + sin marcas combinantes + lowercase. */
function normalizeQuery(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

// ─── Componente principal ──────────────────────────────────────────────────

export function PruebasHub() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { asignatura } = useActiveSubject()

  // Estado lifteado desde URL params para el selector sticky.
  // El componente CursoUnidadSelector empuja los cambios al URL; aquí los
  // leemos como source of truth y les damos setters controlados que también
  // los reflejan localmente para evitar parpadeos durante la transición de
  // navegación.
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

  // Listado y estados de carga
  const [pruebas, setPruebas] = useState<PruebaTemplate[]>([])
  const [unidades, setUnidades] = useState<UnidadPlan[]>([])
  const [guias, setGuias] = useState<GuiaTemplate[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filtros y búsqueda
  const [busqueda, setBusqueda] = useState("")
  const [busquedaNormalizada, setBusquedaNormalizada] = useState("")
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>("todas")

  // Modales de creación
  const [importAbierto, setImportAbierto] = useState(false)
  const [iaAbierto, setIaAbierto] = useState(false)
  const [oasDisponibles, setOasDisponibles] = useState<
    Array<{ code: string; descripcion: string }>
  >([])

  // ─── Carga de pruebas ────────────────────────────────────────────────────
  const refrescarRef = useRef<() => void>(undefined)
  refrescarRef.current = () => {
    if (!curso) {
      setPruebas([])
      setUnidades([])
      setGuias([])
      setError(null)
      return
    }
    setCargando(true)
    setError(null)
    cargarPruebas(asignatura, curso)
      .then(setPruebas)
      .catch((e: Error) =>
        setError(e?.message || "No pude cargar las pruebas."),
      )
      .finally(() => setCargando(false))

    cargarPlanCurso(asignatura, curso)
      .then((plan) => setUnidades(plan?.units || []))
      .catch(() => {})

    cargarGuias(asignatura, curso)
      .then(setGuias)
      .catch(() => {})
  }

  useEffect(() => {
    refrescarRef.current?.()
  }, [asignatura, curso])

  const unidadActiva = useMemo(() => {
    return unidades.find((u) => String(u.id) === String(unidadId)) || null
  }, [unidades, unidadId])

  // ─── Carga de OAs sugeridos para el modal IA ─────────────────────────────
  // Se dispara al abrir el modal cuando hay unidad activa. Si la carga falla
  // o no hay unidad, el modal mostrará "No hay OAs definidos en esta unidad."
  useEffect(() => {
    if (!iaAbierto) return
    if (!curso || !unidadId) {
      setOasDisponibles([])
      return
    }
    let cancelled = false
    cargarOAsParaPrueba(asignatura, curso, unidadId)
      .then((oas) => {
        if (cancelled) return
        const filtrados = oas
          .filter((oa) => oa.tipo !== "oat")
          .map((oa) => ({ code: oa.id, descripcion: oa.descripcion }))
        setOasDisponibles(filtrados)
      })
      .catch(() => {
        if (!cancelled) setOasDisponibles([])
      })
    return () => {
      cancelled = true
    }
  }, [iaAbierto, asignatura, curso, unidadId])

  // ─── Métricas (Req 2.3) ──────────────────────────────────────────────────
  const metricas = useMemo(() => {
    const total = pruebas.length
    const listas = pruebas.filter((p) => p.estado === "lista").length
    const borradores = pruebas.filter(
      (p) => (p.estado || "borrador") === "borrador",
    ).length
    const vinculadas = pruebas.filter(
      (p) => (p.metadatosCurriculares?.objetivos?.length || 0) > 0,
    ).length
    return { total, listas, borradores, vinculadas }
  }, [pruebas])

  // ─── Filtrado en cliente (Req 2.5–2.7) ──────────────────────────────────
  const pruebasFiltradas = useMemo(() => {
    let r = pruebas

    // Filtro por unidad activa (Req 2.7).
    if (unidadId) {
      r = r.filter((p) => String(p.unidadId || "") === String(unidadId))
    }

    // Segmented filter (Req 2.6).
    if (filtroTipo === "borrador") {
      r = r.filter((p) => (p.estado || "borrador") === "borrador")
    } else if (filtroTipo !== "todas") {
      r = r.filter((p) => (p.tipoEvaluacion || "sumativa") === filtroTipo)
    }

    // Búsqueda normalizada contra nombre, unidadNombre y OAs (Req 2.5).
    const q = busquedaNormalizada
    if (q) {
      r = r.filter((p) => {
        const haystack = [
          p.nombre || "",
          p.unidadNombre || "",
          ...(p.metadatosCurriculares?.objetivos || []),
        ]
          .map(normalizeQuery)
          .join(" ")
        return haystack.includes(q)
      })
    }

    return r
  }, [pruebas, filtroTipo, busquedaNormalizada, unidadId])

  const tieneFiltrosActivos =
    filtroTipo !== "todas" || !!busqueda.trim() || !!unidadId

  // ─── Handlers ────────────────────────────────────────────────────────────

  const irACrearManual = () => {
    if (!curso) return
    router.push(
      buildUrl(
        "/evaluaciones",
        withAsignatura(
          { tab: "pruebas", view: "editor", curso, unidadId: unidadId || undefined },
          asignatura,
        ),
      ),
    )
  }

  const irAEditor = (prueba: PruebaTemplate) => {
    router.push(
      buildUrl(
        "/evaluaciones",
        withAsignatura(
          { tab: "pruebas", view: "editor", pruebaId: prueba.id },
          asignatura,
        ),
      ),
    )
  }

  const irAResultados = (prueba: PruebaTemplate) => {
    router.push(
      buildUrl(
        "/evaluaciones",
        withAsignatura(
          { tab: "pruebas", view: "resultados", pruebaId: prueba.id },
          asignatura,
        ),
      ),
    )
  }

  const exportar = async (
    prueba: PruebaTemplate,
    modo: "para_alumno" | "con_pauta",
  ) => {
    const colegio = await cargarInfoColegio().catch(() => null)
    abrirPruebaImprimible({ prueba, colegio, modo })
  }

  const handleDuplicar = async (prueba: PruebaTemplate) => {
    try {
      const copia = await duplicarPrueba(prueba)
      setPruebas((prev) => [copia, ...prev])
    } catch (e) {
      console.error(e)
      setError(
        e instanceof Error ? e.message : "No pude duplicar la prueba.",
      )
    }
  }

  const handleEliminar = async (prueba: PruebaTemplate) => {
    const nombre = prueba.nombre || "esta prueba"
    if (
      !window.confirm(
        `¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`,
      )
    ) {
      return
    }
    try {
      await eliminarPrueba(prueba.id)
      setPruebas((prev) => prev.filter((p) => p.id !== prueba.id))
    } catch (e) {
      console.error(e)
      setError(
        e instanceof Error ? e.message : "No pude eliminar la prueba.",
      )
    }
  }

  // handleIASubmit removido para usar la generación de IA real en el modal.

  const limpiarFiltros = () => {
    setBusqueda("")
    setBusquedaNormalizada("")
    setFiltroTipo("todas")
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Selector sticky de curso + unidad (encima del HubHeader) */}
      <CursoUnidadSelector
        curso={curso}
        setCurso={setCurso}
        unidadId={unidadId}
        setUnidadId={setUnidadId}
        accent="rose"
        extra={
          <VerCoberturaButton
            unidad={unidadActiva}
            pruebas={pruebas}
            guias={guias}
            onOpenPrueba={irAEditor}
            onOpenGuia={(g) => {
              router.push(
                buildUrl(
                  "/evaluaciones",
                  withAsignatura(
                    { tab: "guias", view: "editor", guiaId: g.id },
                    asignatura,
                  ),
                ),
              )
            }}
            accent="rose"
          />
        }
      />

      {/* Header del hub con acciones de creación */}
      <HubHeader
        accent="rose"
        icon={FileText}
        title="Pruebas"
        subtitle="Evaluaciones sumativas, formativas y diagnósticas con corrección automática y exportación a PDF."
        primary={{
          label: "Crear con IA",
          icon: Sparkles,
          onClick: () => setIaAbierto(true),
          disabled: !curso,
        }}
        secondary={[
          {
            label: "Crear manual",
            icon: Plus,
            onClick: irACrearManual,
            disabled: !curso,
          },
          {
            label: "Importar Word",
            icon: Upload,
            onClick: () => setImportAbierto(true),
            disabled: !curso,
          },
        ]}
      />

      {/* Métricas (Req 2.3) */}
      <MetricsGrid
        accent="rose"
        items={[
          { label: "Total", value: metricas.total },
          { label: "Listas para imprimir", value: metricas.listas },
          { label: "Borradores", value: metricas.borradores },
          { label: "Vinculadas a OA", value: metricas.vinculadas },
        ]}
      />

      {/* Filtros y búsqueda */}
      <FilterBar
        accent="rose"
        q={busqueda}
        setQ={setBusqueda}
        onNormalizedChange={setBusquedaNormalizada}
        filters={FILTROS}
        active={filtroTipo}
        setActive={(v) => setFiltroTipo(v as FiltroTipo)}
        placeholder="Buscar prueba, unidad u OA..."
      />

      {/* Error banner (Req 13.3) */}
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

      {/* Listado / loading / empty */}
      {cargando ? (
        <HubSkeleton accent="rose" />
      ) : pruebasFiltradas.length === 0 ? (
        pruebas.length === 0 ? (
          // Sin documentos para el curso (Req 2.17).
          <EmptyState
            accent="rose"
            icon={FileText}
            title={
              curso
                ? `Aún no hay pruebas para ${curso}`
                : "Selecciona un curso para empezar"
            }
            text="Crea tu primera prueba con IA, manualmente o importa un .docx existente. Vincula los OAs y deja que el sistema calcule los puntajes automáticamente."
            action={
              curso
                ? {
                    label: "Crear con IA",
                    icon: Sparkles,
                    onClick: () => setIaAbierto(true),
                  }
                : undefined
            }
            secondaryAction={
              curso
                ? {
                    label: "Crear manual",
                    icon: Plus,
                    onClick: irACrearManual,
                  }
                : undefined
            }
          />
        ) : (
          // Hay pruebas pero los filtros no devuelven coincidencias (Req 2.18).
          <EmptyState
            accent="rose"
            icon={Search}
            title="No hay pruebas que coincidan"
            text="Ajusta tu búsqueda o limpia los filtros para ver todas las pruebas del curso."
            action={
              tieneFiltrosActivos
                ? { label: "Limpiar filtros", onClick: limpiarFiltros }
                : undefined
            }
          />
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pruebasFiltradas.map((p) => (
            <DocumentCard
              key={p.id}
              variant="prueba"
              accent="rose"
              icon={FileText}
              badges={buildBadges(p)}
              title={p.nombre || "Sin nombre"}
              subtitle={buildSubtitle(p)}
              miniStats={buildMiniStats(p)}
              actions={buildActions(p, {
                onEditar: () => irAEditor(p),
                onAplicar: () => irAResultados(p),
                onVistaAlumno: () => exportar(p, "para_alumno"),
                onPauta: () => exportar(p, "con_pauta"),
                onDuplicar: () => handleDuplicar(p),
                onEliminar: () => handleEliminar(p),
              })}
              onClick={() => irAEditor(p)}
            />
          ))}
        </div>
      )}

      {/* Modal IA (tarea 5.1) */}
      <IAStructuredModalPrueba
        open={iaAbierto}
        onClose={() => setIaAbierto(false)}
        oasDisponibles={oasDisponibles}
        cursoLabel={curso}
        unidadLabel={unidadActiva?.name}
        asignatura={asignatura}
        curso={curso}
      />

      {/* Modal de importación Word (Req 4.8) */}
      <PruebaImportModal
        curso={curso}
        abierto={importAbierto}
        onClose={() => {
          setImportAbierto(false)
          refrescarRef.current?.()
        }}
      />
    </div>
  )
}

// ─── Helpers de mapeo a DocumentCard ────────────────────────────────────────

function buildBadges(p: PruebaTemplate): DocumentCardBadge[] {
  const tipo = p.tipoEvaluacion || "sumativa"
  const tipoLabel =
    tipo === "sumativa"
      ? "Sumativa"
      : tipo === "formativa"
        ? "Formativa"
        : "Diagnóstica"

  const estado = p.estado || "borrador"
  const estadoLabel =
    estado === "lista"
      ? "Lista"
      : estado === "aplicada"
        ? "Aplicada"
        : estado === "archivada"
          ? "Archivada"
          : "Borrador"

  const estadoTone: DocumentCardBadge["tone"] =
    estado === "lista"
      ? "success"
      : estado === "aplicada"
        ? "primary"
        : estado === "archivada"
          ? "neutral"
          : "warning"

  return [
    { label: tipoLabel, tone: "primary" },
    { label: estadoLabel, tone: estadoTone },
  ]
}

function buildSubtitle(p: PruebaTemplate): string {
  return [p.curso, p.unidadNombre].filter(Boolean).join(" · ")
}

function buildMiniStats(p: PruebaTemplate) {
  const totalItems = p.secciones.reduce((a, s) => a + s.items.length, 0)
  const stats: Array<{ label: string; value: number | string }> = [
    { label: "Secs", value: p.secciones.length },
    { label: "Ítems", value: totalItems },
    { label: "Pts", value: p.puntajeMaximo },
  ]
  if (p.tiempoMinutos) {
    stats.push({ label: "Min", value: p.tiempoMinutos })
  }
  return stats
}

interface CardActionHandlers {
  onEditar: () => void
  onAplicar: () => void
  onVistaAlumno: () => void
  onPauta: () => void
  onDuplicar: () => void
  onEliminar: () => void
}

function buildActions(
  _p: PruebaTemplate,
  h: CardActionHandlers,
): DocumentCardAction[] {
  return [
    { label: "Editar", icon: Edit2, onClick: h.onEditar, tone: "primary" },
    { label: "Aplicar", icon: Users, onClick: h.onAplicar },
    { label: "Vista alumno", icon: Eye, onClick: h.onVistaAlumno },
    { label: "Pauta", icon: FileCheck, onClick: h.onPauta },
    { label: "Duplicar", icon: Copy, onClick: h.onDuplicar },
    { label: "Eliminar", icon: Trash2, onClick: h.onEliminar, tone: "danger" },
  ]
}
