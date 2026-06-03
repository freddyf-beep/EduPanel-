"use client"

// ═══════════════════════════════════════════════════════════════════════════
// GuiaEditor — Editor de Guías (body) sobre `DocumentEditor` shell
// ─────────────────────────────────────────────────────────────────────────
// El shell maneja estado, toolbar, modales, shortcuts, persistencia y
// UnsavedChangesGuard. Este archivo sólo aporta:
//
//   • El body específico de Guías (config + secciones con contenido + actividades).
//   • Las operaciones sobre secciones y actividades.
//   • Los handlers de drag&drop (banco, mover actividad, mover sección).
//   • La conversión JSON-IA → ActividadGuia.
//   • La creación de la copia PIE post-Adaptar.
//   • La acción especial "Sugerir prueba" (sólo para `evaluacion_formativa`).
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react"
import {
  BookOpen,
  Heart,
  Lightbulb,
  Music,
  Plus,
  Printer,
  RefreshCw,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react"

import { useActiveSubject } from "@/hooks/use-active-subject"
import { buildUrl, withAsignatura } from "@/lib/shared"
import {
  cargarGuia,
  eliminarGuia,
  duplicarGuia,
  nuevaGuia,
  nuevaSeccionGuia,
  nuevaActividadGuia,
  normalizarGuia,
  resolverMetadatosCurricularesGuia,
  cargarOAsParaGuia,
  type GuiaTemplate,
  type SeccionGuia,
  type ActividadGuia,
  type TipoActividadGuia,
} from "@/lib/guias"
import { guiaToPrueba, itemPruebaAActividadGuia } from "@/lib/cross-mapping"
import { guardarGuiaConSnapshot, guardarPruebaConSnapshot } from "@/lib/snapshots-hook"
import { abrirGuiaImprimible } from "@/lib/export/guia-pdf"
import { nuevaPrueba, type ItemPrueba } from "@/lib/pruebas"
import { ItemBankEntry } from "@/lib/item-bank"
import { guardarItemAlBanco } from "@/lib/item-bank"
import { useToast } from "@/components/ui/use-toast"

import {
  DocumentEditor,
  type DocumentEditorConfig,
  type DocumentEditorContext,
} from "@/components/edu-panel/evaluaciones/shared/document-editor"
import { Field, Section } from "@/components/edu-panel/evaluaciones/shared/editor-primitives"
import { BloquesEditor } from "../editor/bloques-editor"
import { ActividadGuiaEditor } from "../editor/actividad-guia-editor"
import { SelectorTipoItem } from "../editor/selector-tipo-item"
import { cn } from "@/lib/utils"

// ─── Props ──────────────────────────────────────────────────────────────────

interface Props {
  guiaId?: string
  cursoInicial?: string
  unidadIdInicial?: string
  unidadNombreInicial?: string
  onClose?: () => void
}

// ─── Componente ─────────────────────────────────────────────────────────────

export function GuiaEditor({
  guiaId,
  cursoInicial,
  unidadIdInicial,
  unidadNombreInicial,
  onClose,
}: Props) {
  const { asignatura } = useActiveSubject()
  const { toast } = useToast()

  const config = useMemo<DocumentEditorConfig<GuiaTemplate>>(
    () => ({
      variant: "guia",
      accent: "violet",
      snapshotTipo: "guias",
      showBloom: false,

      loadDocument: id => cargarGuia(id),
      saveWithSnapshot: doc => guardarGuiaConSnapshot(normalizarGuia(doc)),
      deleteDocument: id => eliminarGuia(id),
      duplicateDocument: doc => duplicarGuia(doc),
      createNew: (a, c) => {
        const n = nuevaGuia(a, c)
        n.secciones = [nuevaSeccionGuia(1)]
        return n
      },
      createPIECopy: (base, resultado, { id }) => ({
        ...(base as GuiaTemplate),
        id,
        nombre: resultado.nombre || `${(base as any).nombre} (PIE)`,
        instrucciones: resultado.instruccionesGenerales || (base as any).instrucciones,
        secciones: (resultado.secciones || []).map((sec: any, sIdx: number) => ({
          ...sec,
          id: sec.id || `sec_pie_${id}_${sIdx}`,
          orden: sIdx + 1,
        })),
        estado: "borrador",
        createdAt: undefined,
        updatedAt: undefined,
        puntajeMaximo: 0,
      }),

      notFoundMessage: "Guía no encontrada",
      counterText: doc => {
        const total = doc.secciones.reduce((a, s) => a + s.actividades.length, 0)
        return `${total} ${total === 1 ? "actividad" : "actividades"} · ${doc.tiempoMinutos || 0} min`
      },
      badge: doc => {
        const estado = doc.estado || "borrador"
        const label =
          estado === "lista" ? "Lista"
            : estado === "archivada" ? "Archivada"
              : "Borrador"
        const tone =
          estado === "lista" ? "success"
            : estado === "archivada" ? "neutral"
              : "warning"
        return { label, tone } as any
      },
      isLocked: () => false,
      lockedMessage: () => "",
      getBackUrl: a => buildUrl("/evaluaciones", withAsignatura({ tab: "guias" }, a)),
      getEditorUrl: (a, id) =>
        buildUrl("/evaluaciones", withAsignatura({ tab: "guias", view: "editor", guiaId: id }, a)),

      exportDocument: (doc, modo, { colegio, profesorNombre }) => {
        abrirGuiaImprimible({ guia: doc, colegio, profesorNombre, modo })
      },

      resolverCurriculo: doc => resolverMetadatosCurricularesGuia(doc),
      cargarOAs: (a, c, uid, oas) => cargarOAsParaGuia(a, c, uid, oas),

      convertToOther: async doc => guiaToPrueba(doc as GuiaTemplate),
      getOtherEditorUrl: (a, id) =>
        buildUrl("/evaluaciones", withAsignatura({ tab: "pruebas", view: "editor", pruebaId: id }, a)),
      convertOtherLabel: "Duplicar como prueba",
    }),
    [],
  )

  const handlers = useMemo(
    () => ({
      aplicarIA: (data: any, ctx: DocumentEditorContext<GuiaTemplate>) => {
        const guia = ctx.doc
        const construir = (sec: any, idx: number): SeccionGuia => {
          const s = nuevaSeccionGuia(guia.secciones.length + idx + 1)
          s.titulo = sec.titulo || s.titulo
          s.descripcion = sec.descripcion || s.descripcion
          s.contenido = sec.contenido || []
          s.actividades = (sec.actividades || [])
            .filter((a: any) => a && (a.enunciado || a.tipo))
            .map((a: any) => convertirActividadIA(a))
          return s
        }
        if (data.secciones && Array.isArray(data.secciones)) {
          ctx.updateDoc(p => ({
            ...p,
            secciones: [...p.secciones, ...data.secciones.map(construir)],
          }))
        } else if (data.seccion && typeof data.seccion === "object") {
          ctx.updateDoc(p => ({
            ...p,
            secciones: [...p.secciones, construir(data.seccion, 0)],
          }))
        }
        ctx.setPanelIA(false)
      },

      insertarItemDelBanco: (
        entry: ItemBankEntry,
        ctx: DocumentEditorContext<GuiaTemplate>,
      ) => {
        let payload: any = entry.payload
        if (entry.metadata.origen === "prueba") {
          const converted = itemPruebaAActividadGuia(payload as ItemPrueba)
          if (!converted) {
            ctx.flashMensaje("err", "El ítem no es compatible con el editor de guías", 3000)
            return
          }
          payload = converted
        }
        const actividadClonada = {
          ...payload,
          id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          puntaje: payload.puntaje || 1,
        } as ActividadGuia

        ctx.updateDoc(p => {
          const secciones = [...p.secciones]
          if (secciones.length === 0) secciones.push(nuevaSeccionGuia(1))
          secciones[0] = {
            ...secciones[0],
            actividades: [...secciones[0].actividades, actividadClonada],
          }
          return { ...p, secciones }
        })
        ctx.flashMensaje("ok", "Actividad insertada", 1500)
      },

      guardarItemEnBanco: async (
        act: ActividadGuia,
        ctx: DocumentEditorContext<GuiaTemplate>,
      ) => {
        const guia = ctx.doc
        try {
          await guardarItemAlBanco(act, {
            asignatura: guia.asignatura,
            curso: guia.curso || "",
            oas: act.oaVinculado ? [act.oaVinculado] : [],
            origen: "guia",
            autor: ctx.profesorNombre || "",
          })
          ctx.flashMensaje("ok", "Actividad guardada en el banco")
        } catch (e: any) {
          ctx.flashMensaje("err", e?.message || "Error al guardar en el banco", 3000)
        }
      },
    }),
    [],
  )

  return (
    <DocumentEditor<GuiaTemplate>
      config={config}
      id={guiaId}
      cursoInicial={cursoInicial}
      unidadIdInicial={unidadIdInicial}
      unidadNombreInicial={unidadNombreInicial}
      onClose={onClose}
      handlers={handlers}
    >
      {ctx => <GuiaEditorBody ctx={ctx} asignatura={asignatura} toast={toast} />}
    </DocumentEditor>
  )
}

// ─── Body ───────────────────────────────────────────────────────────────────

function GuiaEditorBody({
  ctx,
  asignatura,
  toast,
}: {
  ctx: DocumentEditorContext<GuiaTemplate>
  asignatura: string
  toast: ReturnType<typeof useToast>["toast"]
}) {
  const guia = ctx.doc
  const [mostrarConfig, setMostrarConfig] = useState(true)
  const [modoMusical, setModoMusical] = useState(
    guia.asignatura?.toLowerCase() === "música",
  )

  // ── Operaciones sobre secciones ──────────────────────────────────────
  const agregarSeccion = () => {
    ctx.updateDoc(p => ({
      ...p,
      secciones: [...p.secciones, nuevaSeccionGuia(p.secciones.length + 1)],
    }))
  }
  const updateSeccion = (id: string, parcial: Partial<SeccionGuia>) => {
    ctx.updateDoc(p => ({
      ...p,
      secciones: p.secciones.map(s => (s.id === id ? { ...s, ...parcial } : s)),
    }))
  }
  const moverSeccion = (id: string, dir: -1 | 1) => {
    ctx.updateDoc(p => {
      const idx = p.secciones.findIndex(s => s.id === id)
      const newIdx = idx + dir
      if (idx === -1 || newIdx < 0 || newIdx >= p.secciones.length) return p
      const next = [...p.secciones]
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      return { ...p, secciones: next.map((s, i) => ({ ...s, orden: i + 1 })) }
    })
  }
  const eliminarSeccion = (id: string) => {
    ctx.updateDoc(p => ({ ...p, secciones: p.secciones.filter(s => s.id !== id) }))
  }

  // ── Operaciones sobre actividades ───────────────────────────────────
  const agregarActividad = (seccionId: string, tipo: TipoActividadGuia) => {
    ctx.updateDoc(p => ({
      ...p,
      secciones: p.secciones.map(s =>
        s.id !== seccionId
          ? s
          : { ...s, actividades: [...s.actividades, nuevaActividadGuia(tipo)] },
      ),
    }))
  }
  const updateActividad = (seccionId: string, act: ActividadGuia) => {
    ctx.updateDoc(p => ({
      ...p,
      secciones: p.secciones.map(s =>
        s.id !== seccionId
          ? s
          : { ...s, actividades: s.actividades.map(a => (a.id === act.id ? act : a)) },
      ),
    }))
  }
  const moverActividad = (seccionId: string, actId: string, dir: -1 | 1) => {
    ctx.updateDoc(p => ({
      ...p,
      secciones: p.secciones.map(s => {
        if (s.id !== seccionId) return s
        const idx = s.actividades.findIndex(a => a.id === actId)
        const newIdx = idx + dir
        if (idx === -1 || newIdx < 0 || newIdx >= s.actividades.length) return s
        const next = [...s.actividades]
        ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
        return { ...s, actividades: next }
      }),
    }))
  }
  const eliminarActividad = (seccionId: string, actId: string) => {
    ctx.updateDoc(p => ({
      ...p,
      secciones: p.secciones.map(s =>
        s.id !== seccionId
          ? s
          : { ...s, actividades: s.actividades.filter(a => a.id !== actId) },
      ),
    }))
  }

  // ── Drag & drop ─────────────────────────────────────────────────────
  const handleSectionDrop = (e: React.DragEvent, targetSectionId: string) => {
    e.preventDefault()
    const bankData = e.dataTransfer.getData("item-bank-entry")
    if (bankData) {
      try {
        const entry = JSON.parse(bankData) as ItemBankEntry
        let payload: any = entry.payload
        if (entry.metadata.origen === "prueba") {
          const converted = itemPruebaAActividadGuia(payload as ItemPrueba)
          if (!converted) {
            ctx.flashMensaje("err", "El ítem no es compatible con el editor de guías", 3000)
            return
          }
          payload = converted
        }
        const act = {
          ...payload,
          id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          puntaje: payload.puntaje || 1,
        } as ActividadGuia
        ctx.updateDoc(p => ({
          ...p,
          secciones: p.secciones.map(s =>
            s.id !== targetSectionId
              ? s
              : { ...s, actividades: [...s.actividades, act] },
          ),
        }))
        ctx.flashMensaje("ok", "Actividad insertada", 1500)
      } catch {}
      return
    }
    const draggedId = e.dataTransfer.getData("application/x-item-id")
    const sourceSectionId = e.dataTransfer.getData("application/x-source-section-id")
    if (draggedId && sourceSectionId && sourceSectionId !== targetSectionId) {
      ctx.updateDoc(p => {
        const sourceSec = p.secciones.find(s => s.id === sourceSectionId)
        if (!sourceSec) return p
        const act = sourceSec.actividades.find(a => a.id === draggedId)
        if (!act) return p
        return {
          ...p,
          secciones: p.secciones.map(s => {
            if (s.id === sourceSectionId)
              return { ...s, actividades: s.actividades.filter(a => a.id !== draggedId) }
            if (s.id === targetSectionId)
              return { ...s, actividades: [...s.actividades, act] }
            return s
          }),
        }
      })
      return
    }
    const draggedSectionId = e.dataTransfer.getData("application/x-section-id")
    if (draggedSectionId && draggedSectionId !== targetSectionId) {
      ctx.updateDoc(p => {
        const idxDrag = p.secciones.findIndex(s => s.id === draggedSectionId)
        const idxTarget = p.secciones.findIndex(s => s.id === targetSectionId)
        if (idxDrag === -1 || idxTarget === -1) return p
        const next = [...p.secciones]
        const [d] = next.splice(idxDrag, 1)
        next.splice(idxTarget, 0, d)
        return { ...p, secciones: next.map((s, i) => ({ ...s, orden: i + 1 })) }
      })
    }
  }

  const handleActDropOnAct = (
    e: React.DragEvent,
    targetActId: string,
    targetSectionId: string,
  ) => {
    e.preventDefault()
    e.stopPropagation()
    const bankData = e.dataTransfer.getData("item-bank-entry")
    if (bankData) {
      try {
        const entry = JSON.parse(bankData) as ItemBankEntry
        const act = {
          ...entry.payload,
          id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          puntaje: (entry.payload as any).puntaje || 1,
        } as ActividadGuia
        ctx.updateDoc(p => ({
          ...p,
          secciones: p.secciones.map(s => {
            if (s.id !== targetSectionId) return s
            const idx = s.actividades.findIndex(a => a.id === targetActId)
            const actividades = [...s.actividades]
            if (idx === -1) actividades.push(act)
            else actividades.splice(idx, 0, act)
            return { ...s, actividades }
          }),
        }))
        ctx.flashMensaje("ok", "Actividad insertada", 1500)
      } catch {}
      return
    }
    const draggedId = e.dataTransfer.getData("application/x-item-id")
    const sourceSectionId = e.dataTransfer.getData("application/x-source-section-id")
    if (draggedId && sourceSectionId) {
      ctx.updateDoc(p => {
        const sourceSec = p.secciones.find(s => s.id === sourceSectionId)
        const targetSec = p.secciones.find(s => s.id === targetSectionId)
        if (!sourceSec || !targetSec) return p
        const act = sourceSec.actividades.find(a => a.id === draggedId)
        if (!act) return p
        if (sourceSectionId === targetSectionId) {
          const idxDrag = sourceSec.actividades.findIndex(a => a.id === draggedId)
          const idxTarget = sourceSec.actividades.findIndex(a => a.id === targetActId)
          if (idxDrag === -1 || idxTarget === -1) return p
          const actividades = [...sourceSec.actividades]
          const [d] = actividades.splice(idxDrag, 1)
          actividades.splice(idxTarget, 0, d)
          return {
            ...p,
            secciones: p.secciones.map(s =>
              s.id === sourceSectionId ? { ...s, actividades } : s,
            ),
          }
        } else {
          const idxTarget = targetSec.actividades.findIndex(a => a.id === targetActId)
          return {
            ...p,
            secciones: p.secciones.map(s => {
              if (s.id === sourceSectionId)
                return { ...s, actividades: s.actividades.filter(a => a.id !== draggedId) }
              if (s.id === targetSectionId) {
                const actividades = [...s.actividades]
                if (idxTarget === -1) actividades.push(act)
                else actividades.splice(idxTarget, 0, act)
                return { ...s, actividades }
              }
              return s
            }),
          }
        }
      })
    }
  }

  // ── "Sugerir prueba" (acción única de Guías) ────────────────────────
  const handleSugerirPrueba = async () => {
    try {
      const prueba = nuevaPrueba(guia.asignatura, guia.curso)
      prueba.nombre = `Prueba sugerida: ${guia.nombre || "Guía"}`
      prueba.unidadId = guia.unidadId
      prueba.unidadNombre = guia.unidadNombre
      if (guia.metadatosCurriculares) {
        prueba.metadatosCurriculares = {
          objetivos: [...(guia.metadatosCurriculares.objetivos || [])],
          indicadores: [...(guia.metadatosCurriculares.indicadores || [])],
          objetivosTransversales: [...(guia.metadatosCurriculares.objetivosTransversales || [])],
        }
      }
      if (guia.oas) prueba.oas = JSON.parse(JSON.stringify(guia.oas))
      prueba.docenteNombre = guia.docenteNombre
      prueba.tiempoMinutos = guia.tiempoMinutos
      await guardarPruebaConSnapshot(prueba)
      toast({
        title: "Prueba sugerida creada",
        description: "Se ha creado una prueba a partir de los OAs de esta guía.",
      })
    } catch (e: any) {
      ctx.flashMensaje("err", e?.message || "Error al sugerir prueba", 3000)
    }
  }

  const totalActividades = guia.secciones.reduce(
    (a, s) => a + s.actividades.length,
    0,
  )
  const puntajeTotal = guia.secciones.reduce(
    (a, s) => a + s.actividades.reduce((b, act) => b + (act.puntaje || 0), 0),
    0,
  )

  return (
    <>
      <Section
        title="Configuración"
        expanded={mostrarConfig}
        onToggle={() => setMostrarConfig(v => !v)}
        icon={Settings}
        accent="violet"
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Curso">
            <input
              value={guia.curso}
              onChange={e => ctx.updateDoc(p => ({ ...p, curso: e.target.value }))}
              placeholder="2°A"
              className="h-9 w-full rounded border border-border bg-background px-3 text-[13px]"
            />
          </Field>
          <Field label="Unidad">
            <select
              value={guia.unidadId || ""}
              onChange={e => {
                const u = ctx.unidadesCurso.find(
                  x => String(x.id) === e.target.value,
                )
                ctx.updateDoc(p => ({
                  ...p,
                  unidadId: e.target.value || undefined,
                  unidadNombre: u?.name,
                }))
              }}
              className="h-9 w-full rounded border border-border bg-background px-3 text-[13px]"
            >
              <option value="">— Sin unidad —</option>
              {ctx.unidadesCurso.map(u => (
                <option key={u.id} value={String(u.id)}>{u.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Tipo de guía">
            <select
              value={guia.tipoGuia || "aprendizaje"}
              onChange={e =>
                ctx.updateDoc(p => ({ ...p, tipoGuia: e.target.value as any }))
              }
              className="h-9 w-full rounded border border-border bg-background px-3 text-[13px]"
            >
              <option value="aprendizaje">Aprendizaje (didáctica)</option>
              <option value="refuerzo">Refuerzo</option>
              <option value="ejercitacion">Ejercitación</option>
              <option value="evaluacion_formativa">Evaluación formativa</option>
            </select>
          </Field>
          <Field label="Tiempo (min)">
            <input
              type="number"
              min={5}
              value={guia.tiempoMinutos || 45}
              onChange={e =>
                ctx.updateDoc(p => ({
                  ...p,
                  tiempoMinutos: Number(e.target.value) || 45,
                }))
              }
              className="h-9 w-full rounded border border-border bg-background px-3 text-[13px]"
            />
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={ctx.sincronizarConCurriculo}
            disabled={!guia.curso || !guia.unidadNombre}
            className={cn(
              "flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[11px] font-bold transition-colors",
              "border border-[var(--accent-guias)]/40 bg-[var(--accent-guias-soft)] text-[var(--accent-guias)]",
              "hover:opacity-90 disabled:opacity-50",
            )}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Sincronizar con currículum
          </button>
          {(guia.asignatura?.toLowerCase() === "música" ||
            asignatura?.toLowerCase() === "música") && (
            <button
              type="button"
              onClick={() => setModoMusical(v => !v)}
              aria-pressed={modoMusical}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[11px] font-bold transition-colors",
                modoMusical
                  ? "bg-violet-600 text-white"
                  : "border border-border bg-card text-foreground hover:bg-muted/60",
              )}
            >
              <Music className="h-3.5 w-3.5" />
              Modo Musical
            </button>
          )}
        </div>

        <div className="mt-4">
          <Field label="Objetivo de la guía (qué debe lograr el alumno)">
            <textarea
              value={guia.objetivo}
              onChange={e =>
                ctx.updateDoc(p => ({ ...p, objetivo: e.target.value }))
              }
              rows={2}
              placeholder="Identificar y reconocer los hábitos de vida saludable…"
              className="w-full resize-y rounded border border-border bg-background px-3 py-2 text-[13px]"
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Instrucciones para el alumno (una por línea)">
            <textarea
              value={guia.instrucciones.join("\n")}
              onChange={e =>
                ctx.updateDoc(p => ({
                  ...p,
                  instrucciones: e.target.value.split("\n"),
                }))
              }
              rows={4}
              className="w-full resize-y rounded border border-border bg-background px-3 py-2 text-[12.5px]"
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="OAs vinculados (uno por línea)">
            <textarea
              value={(guia.metadatosCurriculares?.objetivos || []).join("\n")}
              onChange={e =>
                ctx.updateDoc(p => ({
                  ...p,
                  metadatosCurriculares: {
                    ...(p.metadatosCurriculares || {
                      objetivos: [],
                      indicadores: [],
                      objetivosTransversales: [],
                    }),
                    objetivos: e.target.value
                      .split("\n")
                      .map(s => s.trim())
                      .filter(Boolean),
                  },
                }))
              }
              rows={3}
              placeholder="OA 1: ..."
              className="w-full resize-y rounded border border-border bg-background px-3 py-2 text-[11.5px]"
            />
          </Field>
        </div>
      </Section>

      {/* Secciones */}
      {guia.secciones.map((sec, idx) => {
        const puntosSec = sec.actividades.reduce(
          (a, x) => a + (x.puntaje || 0),
          0,
        )
        return (
          <div
            key={sec.id}
            onDragOver={e => e.preventDefault()}
            onDrop={e => handleSectionDrop(e, sec.id)}
            className="rounded-[14px] border border-[var(--accent-guias)]/20 bg-[var(--accent-guias-soft)]/40 p-4"
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span
                draggable={true}
                onDragStart={e => {
                  e.dataTransfer.setData("application/x-section-id", sec.id)
                  e.dataTransfer.effectAllowed = "move"
                }}
                className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--accent-guias)] text-[14px] font-extrabold text-white cursor-grab active:cursor-grabbing"
              >
                {sec.orden}
              </span>
              <input
                value={sec.titulo}
                onChange={e => updateSeccion(sec.id, { titulo: e.target.value })}
                placeholder="Título de la sección"
                className="flex-1 min-w-0 rounded border border-border bg-background px-2 py-1.5 text-[13px] font-bold outline-none"
              />
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-bold text-muted-foreground">
                {sec.actividades.length} act · {puntosSec} pts
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => moverSeccion(sec.id, -1)}
                  disabled={idx === 0}
                  className="h-7 w-7 rounded border border-border bg-card hover:bg-muted/40 disabled:opacity-40 font-bold"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moverSeccion(sec.id, 1)}
                  disabled={idx === guia.secciones.length - 1}
                  className="h-7 w-7 rounded border border-border bg-card hover:bg-muted/40 disabled:opacity-40 font-bold"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => eliminarSeccion(sec.id)}
                  className="h-7 w-7 rounded border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                  title="Eliminar sección"
                  aria-label="Eliminar sección"
                >
                  <Trash2 className="mx-auto h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <textarea
              value={sec.descripcion || ""}
              onChange={e =>
                updateSeccion(sec.id, { descripcion: e.target.value })
              }
              rows={2}
              placeholder="Descripción / objetivo de la sección"
              className="mb-3 w-full resize-y rounded border border-border bg-background px-3 py-2 text-[12.5px] italic outline-none"
            />

            <details className="mb-3 rounded border border-border bg-card/50" open>
              <summary className="cursor-pointer px-3 py-2 text-[11.5px] font-bold text-muted-foreground hover:bg-muted/30">
                + Contenido didáctico de la sección
              </summary>
              <div className="border-t border-border p-3">
                <BloquesEditor
                  bloques={sec.contenido || []}
                  onChange={c => updateSeccion(sec.id, { contenido: c })}
                  tipoDoc="guias"
                  docId={guia.id}
                  empty="Sin contenido. Añade texto, imágenes, tablas o separadores."
                />
              </div>
            </details>

            <div className="space-y-3">
              {sec.actividades.map((act, i) => (
                <ActividadGuiaEditor
                  key={act.id}
                  actividad={act}
                  numero={i + 1}
                  oasDisponibles={guia.oas || []}
                  tipoDoc="guias"
                  docId={guia.id}
                  onChange={a => updateActividad(sec.id, a)}
                  onDelete={() => eliminarActividad(sec.id, act.id)}
                  onMoveUp={() => moverActividad(sec.id, act.id, -1)}
                  onMoveDown={() => moverActividad(sec.id, act.id, 1)}
                  isFirst={i === 0}
                  isLast={i === sec.actividades.length - 1}
                  onDragStart={e => {
                    e.dataTransfer.setData("application/x-item-id", act.id)
                    e.dataTransfer.setData(
                      "application/x-source-section-id",
                      sec.id,
                    )
                    e.dataTransfer.effectAllowed = "move"
                  }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => handleActDropOnAct(e, act.id, sec.id)}
                  onSaveToBank={() =>
                    ctx.handlers.guardarItemEnBanco(act, ctx)
                  }
                />
              ))}

              <SelectorTipoItem
                modo="guia"
                onSelect={tipo => agregarActividad(sec.id, tipo)}
              />
            </div>
          </div>
        )
      })}

      <button
        type="button"
        onClick={agregarSeccion}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-[12px] border-2 border-dashed border-border bg-card px-4 py-4 text-[13px] font-bold text-muted-foreground transition-colors",
          "hover:border-[var(--accent-guias)] hover:text-[var(--accent-guias)]",
        )}
      >
        <Plus className="h-4 w-4" />
        Agregar sección
      </button>

      {/* Acciones especiales de Guías (sugerir prueba + exportar) */}
      <div className="rounded-[12px] border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-900/40 dark:bg-violet-950/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[12px] font-bold text-violet-800 dark:text-violet-300">
              Resumen de la guía
            </div>
            <div className="text-[11px] text-violet-700 dark:text-violet-400">
              {guia.secciones.length}{" "}
              {guia.secciones.length === 1 ? "sección" : "secciones"} ·{" "}
              {totalActividades}{" "}
              {totalActividades === 1 ? "actividad" : "actividades"} ·{" "}
              <b>{puntajeTotal} pts</b>
              {guia.tiempoMinutos ? ` · ${guia.tiempoMinutos} min` : ""}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {guia.tipoGuia === "evaluacion_formativa" && (
              <button
                type="button"
                onClick={handleSugerirPrueba}
                className="flex items-center gap-1.5 rounded-[8px] border border-violet-300 bg-white px-3 py-1.5 text-[11.5px] font-bold text-violet-700 hover:bg-violet-50 dark:bg-violet-900/40 dark:text-violet-200"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Sugerir prueba
              </button>
            )}
            <button
              type="button"
              onClick={() => ctx.exportar("para_alumno")}
              className="flex items-center gap-1.5 rounded-[8px] border border-violet-300 bg-white px-3 py-1.5 text-[11.5px] font-bold text-violet-700 hover:bg-violet-50 dark:bg-violet-900/40 dark:text-violet-200"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function convertirActividadIA(it: any): ActividadGuia {
  const tipo: TipoActividadGuia = it.tipo || "abierta"
  return {
    ...nuevaActividadGuia(tipo),
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    tipo,
    enunciado: it.enunciado || "",
    puntaje: it.puntaje,
    oaVinculado: it.oaVinculado,
  }
}
