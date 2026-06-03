"use client"

// ═══════════════════════════════════════════════════════════════════════════
// PruebasHub — Configuración de Pruebas para el shell `DocumentHub`
// ─────────────────────────────────────────────────────────────────────────
// Este archivo sólo aporta los datos y comportamientos específicos de las
// pruebas; todo el ciclo de vida (URL state, carga, métricas, filtrado,
// render del grid, modales) vive en `shared/document-hub.tsx`.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Copy,
  Edit2,
  Eye,
  FileCheck,
  FileText,
  Plus,
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
import { cargarGuias, type GuiaTemplate } from "@/lib/guias"
import { abrirPruebaImprimible } from "@/lib/export/prueba-pdf"
import { cargarInfoColegio } from "@/lib/perfil"

import {
  DocumentHub,
  type CardBuilder,
  type DocumentHubConfig,
  type DocumentHubCardHandlers,
} from "@/components/edu-panel/evaluaciones/shared/document-hub"
import {
  IAStructuredModalPrueba,
} from "@/components/edu-panel/evaluaciones/shared/ia-structured-modal-prueba"
import { PruebaImportModal } from "./prueba-import-modal"
import type {
  DocumentCardAction,
  DocumentCardBadge,
  DocumentCardMiniStat,
} from "@/components/edu-panel/evaluaciones/shared/document-card"

// ─── Constantes puras (no dependen de hooks) ────────────────────────────────

const FILTER_OPTIONS: Array<[string, string]> = [
  ["todas", "Todas"],
  ["sumativa", "Sumativas"],
  ["formativa", "Formativas"],
  ["diagnostica", "Diagnósticas"],
  ["borrador", "Borradores"],
]

const FILTER_MATCHER = (p: PruebaTemplate, active: string) => {
  if (active === "borrador") return (p.estado || "borrador") === "borrador"
  return (p.tipoEvaluacion || "sumativa") === active
}

const SEARCH_PLACEHOLDER = "Buscar prueba, unidad u OA..."

const SEARCH_PREDICATE = (p: PruebaTemplate, q: string) => {
  const haystack = [
    p.nombre || "",
    p.unidadNombre || "",
    ...(p.metadatosCurriculares?.objetivos || []),
  ]
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

const buildBadges = (p: PruebaTemplate): DocumentCardBadge[] => {
  const tipo = p.tipoEvaluacion || "sumativa"
  const tipoLabel =
    tipo === "sumativa" ? "Sumativa"
      : tipo === "formativa" ? "Formativa"
        : "Diagnóstica"

  const estado = p.estado || "borrador"
  const estadoLabel =
    estado === "lista" ? "Lista"
      : estado === "aplicada" ? "Aplicada"
        : estado === "archivada" ? "Archivada"
          : "Borrador"

  const estadoTone: DocumentCardBadge["tone"] =
    estado === "lista" ? "success"
      : estado === "aplicada" ? "primary"
        : estado === "archivada" ? "neutral"
          : "warning"

  return [
    { label: tipoLabel, tone: "primary" },
    { label: estadoLabel, tone: estadoTone },
  ]
}

const buildSubtitle = (p: PruebaTemplate) =>
  [p.curso, p.unidadNombre].filter(Boolean).join(" · ")

const buildMiniStats = (p: PruebaTemplate): DocumentCardMiniStat[] => {
  const totalItems = p.secciones.reduce((a, s) => a + s.items.length, 0)
  const stats: DocumentCardMiniStat[] = [
    { label: "Secs", value: p.secciones.length },
    { label: "Ítems", value: totalItems },
    { label: "Pts", value: p.puntajeMaximo },
  ]
  if (p.tiempoMinutos) stats.push({ label: "Min", value: p.tiempoMinutos })
  return stats
}

const buildActions = (
  _p: PruebaTemplate,
  h: DocumentHubCardHandlers,
): DocumentCardAction[] => [
  { label: "Editar", icon: Edit2, onClick: h.onEditar, tone: "primary" },
  { label: "Aplicar", icon: Users, onClick: h.onAplicar },
  { label: "Vista alumno", icon: Eye, onClick: h.onVistaAlumno },
  { label: "Pauta", icon: FileCheck, onClick: h.onPauta },
  { label: "Duplicar", icon: Copy, onClick: h.onDuplicar },
  { label: "Eliminar", icon: Trash2, onClick: h.onEliminar, tone: "danger" },
]

const cardBuilder: CardBuilder<PruebaTemplate> = {
  badges: buildBadges,
  subtitle: buildSubtitle,
  miniStats: buildMiniStats,
  actions: buildActions,
}

// ─── Componente ─────────────────────────────────────────────────────────────

export function PruebasHub() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { asignatura } = useActiveSubject()

  const goCrearManual = () => {
    const curso = searchParams.get("curso") || ""
    const unidadId = searchParams.get("unidadId") || undefined
    if (!curso) return
    router.push(
      buildUrl(
        "/evaluaciones",
        withAsignatura(
          { tab: "pruebas", view: "editor", curso, unidadId },
          asignatura,
        ),
      ),
    )
  }

  const goToEditor = (p: PruebaTemplate) => {
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

  const goToResults = (p: PruebaTemplate) => {
    router.push(
      buildUrl(
        "/evaluaciones",
        withAsignatura(
          { tab: "pruebas", view: "resultados", pruebaId: p.id },
          asignatura,
        ),
      ),
    )
  }

  const onOpenOther = (g: GuiaTemplate) => {
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

  const config = useMemo<DocumentHubConfig<PruebaTemplate>>(
    () => ({
      variant: "prueba",
      accent: "rose",
      title: "Pruebas",
      subtitle:
        "Evaluaciones sumativas, formativas y diagnósticas con corrección automática y exportación a PDF.",
      headerIcon: FileText,
      cardIcon: FileText,

      loadDocuments: (a, c) => cargarPruebas(a, c),
      loadOtherDocs: (a, c) => cargarGuias(a, c),
      deleteDocument: eliminarPrueba,
      duplicateDocument: duplicarPrueba,
      goToEditor,
      goToResults,
      exportDocument: async (p, modo) => {
        const colegio = await cargarInfoColegio().catch(() => null)
        abrirPruebaImprimible({ prueba: p, colegio, modo })
      },
      onOpenOther,

      primaryAction: {
        label: "Crear con IA",
        icon: Sparkles,
        onClick: () => {},
      },
      secondaryActions: [
        { label: "Crear manual", icon: Plus, onClick: goCrearManual },
        { kind: "openImport", label: "Importar Word", icon: Upload },
      ],

      computeMetrics: docs => [
        { label: "Total", value: docs.length },
        {
          label: "Listas para imprimir",
          value: docs.filter(p => p.estado === "lista").length,
        },
        {
          label: "Borradores",
          value: docs.filter(p => (p.estado || "borrador") === "borrador").length,
        },
        {
          label: "Vinculadas a OA",
          value: docs.filter(
            p => (p.metadatosCurriculares?.objetivos?.length || 0) > 0,
          ).length,
        },
      ],

      filterOptions: FILTER_OPTIONS,
      filterMatcher: FILTER_MATCHER,
      searchPlaceholder: SEARCH_PLACEHOLDER,
      searchPredicate: SEARCH_PREDICATE,
      cardBuilder,

      IAModal: IAStructuredModalPrueba,
      loadOAsForIA: async (a, c, uid) => {
        const oas = await cargarOAsParaPrueba(a, c, uid)
        return oas.map(oa => ({ code: oa.id, descripcion: oa.descripcion }))
      },
      ImportModal: PruebaImportModal,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [asignatura],
  )

  return <DocumentHub<PruebaTemplate> {...config} />
}
