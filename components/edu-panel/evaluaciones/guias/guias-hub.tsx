"use client"

// ═══════════════════════════════════════════════════════════════════════════
// GuiasHub — Configuración de Guías para el shell `DocumentHub`
// ─────────────────────────────────────────────────────────────────────────
// Este archivo sólo aporta los datos y comportamientos específicos de las
// guías; todo el ciclo de vida (URL state, carga, métricas, filtrado,
// render del grid, modales) vive en `shared/document-hub.tsx`.
//
// Aporta además los filtros adicionales (`filtroEstado`, `filtroOA`) que
// Pruebas no tiene, vía el slot `extraFilters` + `extraFilterPredicate`.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  BookOpen,
  ClipboardList,
  Copy,
  Edit2,
  Eye,
  Plus,
  Printer,
  Sparkles,
  Trash2,
} from "lucide-react"

import { useActiveSubject } from "@/hooks/use-active-subject"
import { buildUrl, withAsignatura } from "@/lib/shared"
import {
  cargarGuias,
  cargarOAsParaGuia,
  duplicarGuia,
  eliminarGuia,
  type GuiaTemplate,
} from "@/lib/guias"
import { cargarPruebas, type PruebaTemplate } from "@/lib/pruebas"
import { abrirGuiaImprimible } from "@/lib/export/guia-pdf"
import { cargarInfoColegio } from "@/lib/perfil"

import {
  DocumentHub,
  type CardBuilder,
  type DocumentHubConfig,
  type DocumentHubCardHandlers,
} from "@/components/edu-panel/evaluaciones/shared/document-hub"
import {
  IAStructuredModalGuia,
} from "@/components/edu-panel/evaluaciones/shared/ia-structured-modal-guia"
import type {
  DocumentCardAction,
  DocumentCardBadge,
  DocumentCardMiniStat,
} from "@/components/edu-panel/evaluaciones/shared/document-card"

// ─── Constantes puras ───────────────────────────────────────────────────────

const FILTER_OPTIONS: Array<[string, string]> = [
  ["todas", "Todas"],
  ["aprendizaje", "Aprendizaje"],
  ["refuerzo", "Refuerzo"],
  ["ejercitacion", "Ejercitación"],
  ["evaluacion_formativa", "Eval. formativa"],
]

const FILTER_MATCHER = (g: GuiaTemplate, active: string) =>
  (g.tipoGuia || "aprendizaje") === active

const SEARCH_PLACEHOLDER = "Buscar guía, objetivo o unidad..."

const SEARCH_PREDICATE = (g: GuiaTemplate, q: string) => {
  const haystack = [g.nombre || "", g.objetivo || "", g.unidadNombre || ""]
    .map(normalizeQuery)
    .join(" ")
  return haystack.includes(q)
}

function normalizeQuery(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

// ─── Card builder ───────────────────────────────────────────────────────────

const buildBadges = (g: GuiaTemplate): DocumentCardBadge[] => [
  { label: g.tipoGuia || "aprendizaje", tone: "primary" },
  {
    label: g.estado || "borrador",
    tone: g.estado === "lista" ? "success" : "neutral",
  },
]

const buildSubtitle = (g: GuiaTemplate) =>
  g.curso + (g.unidadNombre ? " · " + g.unidadNombre : "")

const buildNumeroLabel = (g: GuiaTemplate) => g.numeroGuia

const buildObjetivoPreview = (g: GuiaTemplate) => g.objetivo

const buildMiniStats = (g: GuiaTemplate): DocumentCardMiniStat[] => {
  const totalAct = g.secciones.reduce((a, s) => a + s.actividades.length, 0)
  return [
    { label: "Sec.", value: g.secciones.length },
    { label: "Act.", value: totalAct },
    { label: "Pts", value: g.puntajeMaximo || 0 },
    { label: "Min", value: g.tiempoMinutos || 0 },
  ]
}

const buildActions = (
  _g: GuiaTemplate,
  h: DocumentHubCardHandlers,
): DocumentCardAction[] => [
  { label: "Editar", icon: Edit2, onClick: h.onEditar, tone: "primary" },
  { label: "Vista alumno", icon: Eye, onClick: h.onVistaAlumno },
  { label: "Pauta", icon: BookOpen, onClick: h.onPauta },
  { label: "Imprimir", icon: Printer, onClick: h.onVistaAlumno },
  { label: "Duplicar", icon: Copy, onClick: h.onDuplicar },
  { label: "Eliminar", icon: Trash2, onClick: h.onEliminar, tone: "danger" },
]

const cardBuilder: CardBuilder<GuiaTemplate> = {
  badges: buildBadges,
  subtitle: buildSubtitle,
  numeroLabel: buildNumeroLabel,
  objetivoPreview: buildObjetivoPreview,
  miniStats: buildMiniStats,
  actions: buildActions,
}

// ─── Componente ─────────────────────────────────────────────────────────────

type FiltroEstado = "todas" | "borrador" | "lista" | "archivada"

const ESTADOS: Array<{ key: FiltroEstado; label: string }> = [
  { key: "todas", label: "Todos los estados" },
  { key: "borrador", label: "Borradores" },
  { key: "lista", label: "Listas" },
  { key: "archivada", label: "Archivadas" },
]

export function GuiasHub() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { asignatura } = useActiveSubject()

  // Filtros adicionales que no entran en el segmented común
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todas")
  const [filtroOA, setFiltroOA] = useState<string | null>(null)
  const [oasDisponibles, setOasDisponibles] = useState<string[]>([])

  // Carga de OAs presentes en las guías del curso actual
  const curso = searchParams.get("curso") || ""
  useEffect(() => {
    if (!curso) {
      setOasDisponibles([])
      return
    }
    let cancelled = false
    cargarGuias(asignatura, curso)
      .then(guias => {
        if (cancelled) return
        const set = new Set<string>()
        guias.forEach(g =>
          g.secciones.forEach(s =>
            s.actividades.forEach(a => {
              if (a.oaVinculado) set.add(a.oaVinculado)
            }),
          ),
        )
        setOasDisponibles(Array.from(set).sort())
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [asignatura, curso])

  const goCrearManual = () => {
    const unidadId = searchParams.get("unidadId") || undefined
    router.push(
      buildUrl(
        "/evaluaciones",
        withAsignatura(
          { tab: "guias", view: "editor", curso, unidadId },
          asignatura,
        ),
      ),
    )
  }

  const goToEditor = (g: GuiaTemplate) => {
    router.push(
      buildUrl(
        "/evaluaciones",
        withAsignatura(
          { tab: "guias", view: "editor", guiaId: g.id },
          asignatura,
        ),
      ),
    )
  }

  const onOpenOther = (p: PruebaTemplate) => {
    router.push(
      buildUrl(
        "/evaluaciones",
        withAsignatura(
          { tab: "pruebas", view: "editor", pruebaId: p.id },
          asignatura,
        ),
      ),
    )
  }

  const extraFilterPredicate = (g: GuiaTemplate) => {
    if (filtroEstado !== "todas" && (g.estado || "borrador") !== filtroEstado) {
      return false
    }
    if (filtroOA) {
      return g.secciones.some(s =>
        s.actividades.some(a => a.oaVinculado === filtroOA),
      )
    }
    return true
  }

  const config = useMemo<DocumentHubConfig<GuiaTemplate>>(
    () => ({
      variant: "guia",
      accent: "violet",
      title: "Guías",
      subtitle:
        "Material didáctico imprimible: contenido, actividades, cierre y vínculo curricular.",
      headerIcon: ClipboardList,
      cardIcon: ClipboardList,

      loadDocuments: (a, c) => cargarGuias(a, c),
      loadOtherDocs: (a, c) => cargarPruebas(a, c),
      deleteDocument: eliminarGuia,
      duplicateDocument: duplicarGuia,
      goToEditor,
      exportDocument: async (g, modo) => {
        const colegio = await cargarInfoColegio().catch(() => null)
        abrirGuiaImprimible({ guia: g, colegio, modo })
      },
      onOpenOther,

      primaryAction: {
        label: "Crear con IA",
        icon: Sparkles,
        onClick: () => {},
      },
      secondaryActions: [
        { label: "Crear manual", icon: Plus, onClick: goCrearManual },
      ],

      computeMetrics: docs => [
        { label: "Total", value: docs.length },
        {
          label: "Con contenido",
          value: docs.filter(g => g.secciones.some(s => s.contenido.length > 0)).length,
        },
        {
          label: "Con actividades",
          value: docs.filter(g => g.secciones.some(s => s.actividades.length > 0)).length,
        },
        { label: "Listas", value: docs.filter(g => g.estado === "lista").length },
      ],

      filterOptions: FILTER_OPTIONS,
      filterMatcher: FILTER_MATCHER,
      searchPlaceholder: SEARCH_PLACEHOLDER,
      searchPredicate: SEARCH_PREDICATE,
      extraFilterPredicate,
      cardBuilder,

      IAModal: IAStructuredModalGuia,
      loadOAsForIA: async (a, c, uid) => {
        const oas = await cargarOAsParaGuia(a, c, uid)
        return oas.map(oa => ({ code: oa.id, descripcion: oa.descripcion }))
      },
      extraFilters: () => (
        <GuiasExtraFilters
          filtroEstado={filtroEstado}
          setFiltroEstado={setFiltroEstado}
          filtroOA={filtroOA}
          setFiltroOA={setFiltroOA}
          oasDisponibles={oasDisponibles}
        />
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [asignatura, filtroEstado, filtroOA, oasDisponibles],
  )

  return <DocumentHub<GuiaTemplate> {...config} />
}

// ─── Filtros extra (estado + OA) ─────────────────────────────────────────────

function GuiasExtraFilters({
  filtroEstado,
  setFiltroEstado,
  filtroOA,
  setFiltroOA,
  oasDisponibles,
}: {
  filtroEstado: FiltroEstado
  setFiltroEstado: (v: FiltroEstado) => void
  filtroOA: string | null
  setFiltroOA: (v: string | null) => void
  oasDisponibles: string[]
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {ESTADOS.map(e => {
          const active = filtroEstado === e.key
          return (
            <button
              key={e.key}
              onClick={() => setFiltroEstado(e.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                active
                  ? "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {e.label}
            </button>
          )
        })}
      </div>
      {oasDisponibles.length > 0 && (
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-2">
            OA vinculado
          </label>
          <select
            value={filtroOA || ""}
            onChange={e => setFiltroOA(e.target.value || null)}
            className="w-full h-9 rounded border border-border bg-background px-3 text-xs"
          >
            <option value="">Todos los OAs</option>
            {oasDisponibles.map(oa => (
              <option key={oa} value={oa}>
                {oa}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
