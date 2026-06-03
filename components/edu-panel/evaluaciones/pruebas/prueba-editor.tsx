"use client"

// ═══════════════════════════════════════════════════════════════════════════
// PruebaEditor — Editor de Pruebas (body) sobre `DocumentEditor` shell
// ─────────────────────────────────────────────────────────────────────────
// El shell maneja estado, toolbar, modales, shortcuts, persistencia y
// UnsavedChangesGuard. Este archivo sólo aporta:
//
//   • El body específico de Pruebas (config + secciones + ítems).
//   • Las operaciones sobre secciones e ítems.
//   • Los handlers de drag&drop (banco, mover ítem, mover sección).
//   • La conversión JSON-IA → ItemPrueba.
//   • La creación de la copia PIE post-Adaptar.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react"
import {
  Plus,
  Printer,
  RefreshCw,
  Settings,
  Trash2,
} from "lucide-react"

import { useActiveSubject } from "@/hooks/use-active-subject"
import { buildUrl, withAsignatura } from "@/lib/shared"
import {
  cargarPrueba,
  eliminarPrueba,
  duplicarPrueba,
  nuevaPrueba,
  nuevaSeccion,
  nuevoItem,
  resolverMetadatosCurricularesPrueba,
  cargarOAsParaPrueba,
  calcularPuntajeMaximoPrueba,
  romano,
  type PruebaTemplate,
  type SeccionPrueba,
  type ItemPrueba,
  type TipoItem,
} from "@/lib/pruebas"
import { pruebaToGuia, actividadGuiaAItemPrueba } from "@/lib/cross-mapping"
import { guardarPruebaConSnapshot, guardarGuiaConSnapshot } from "@/lib/snapshots-hook"
import { abrirPruebaImprimible } from "@/lib/export/prueba-pdf"
import { convertirItemIA } from "@/lib/ia-item-converter"

import {
  DocumentEditor,
  type DocumentEditorConfig,
  type DocumentEditorContext,
} from "@/components/edu-panel/evaluaciones/shared/document-editor"
import { Field, Section } from "@/components/edu-panel/evaluaciones/shared/editor-primitives"
import { BloquesEditor } from "../editor/bloques-editor"
import { ItemEditor } from "../editor/item-editor"
import { SelectorTipoItem } from "../editor/selector-tipo-item"
import type { ItemBankEntry } from "@/lib/item-bank"
import type { ActividadGuia } from "@/lib/guias"
import { cn } from "@/lib/utils"
import { COMMON_SHORTCUTS, formatShortcut } from "@/lib/keyboard-shortcuts"

// ─── Props ──────────────────────────────────────────────────────────────────

interface Props {
  pruebaId?: string
  cursoInicial?: string
  unidadIdInicial?: string
  unidadNombreInicial?: string
  onClose?: () => void
}

// ─── Componente ─────────────────────────────────────────────────────────────

export function PruebaEditor({
  pruebaId,
  cursoInicial,
  unidadIdInicial,
  unidadNombreInicial,
  onClose,
}: Props) {
  const { asignatura } = useActiveSubject()

  const config = useMemo<DocumentEditorConfig<PruebaTemplate>>(
    () => ({
      variant: "prueba",
      accent: "rose",
      snapshotTipo: "pruebas",
      showBloom: true,

      loadDocument: id => cargarPrueba(id),
      saveWithSnapshot: doc => guardarPruebaConSnapshot(doc),
      deleteDocument: id => eliminarPrueba(id),
      duplicateDocument: doc => duplicarPrueba(doc),
      createNew: (a, c) => {
        const n = nuevaPrueba(a, c)
        n.secciones = [nuevaSeccion(1, "seleccion_multiple")]
        return n
      },
      createPIECopy: (base, resultado, { id }) => {
        const copia: PruebaTemplate = {
          ...(base as PruebaTemplate),
          id,
          nombre: resultado.nombre || `${(base as any).nombre} (Adecuación PIE)`,
          instruccionesGenerales:
            resultado.instruccionesGenerales ||
            (base as any).instruccionesGenerales,
          secciones: (resultado.secciones || []).map((sec: any, sIdx: number) => ({
            ...sec,
            id: sec.id || `sec_pie_${id}_${sIdx}`,
            orden: sIdx + 1,
            items: (sec.items || []).map((it: any) => convertirItemIA(it)),
          })),
          estado: "borrador",
          bloqueada: false,
          createdAt: undefined,
          updatedAt: undefined,
          puntajeMaximo: 0,
        }
        copia.puntajeMaximo = calcularPuntajeMaximoPrueba(copia.secciones)
        return copia
      },

      notFoundMessage: "Prueba no encontrada",
      counterText: doc => {
        const totalItems = doc.secciones.reduce((a, s) => a + s.items.length, 0)
        return `${totalItems} ítem${totalItems === 1 ? "" : "s"} · ${calcularPuntajeMaximoPrueba(doc.secciones)} pts`
      },
      badge: doc => {
        const estado = doc.estado || "borrador"
        const label =
          estado === "lista" ? "Lista"
            : estado === "aplicada" ? "Aplicada"
              : estado === "archivada" ? "Archivada"
                : "Borrador"
        const tone =
          estado === "lista" ? "success"
            : estado === "aplicada" ? "primary"
              : estado === "archivada" ? "neutral"
                : "warning"
        return { label, tone } as any
      },
      isLocked: doc => doc.estado === "aplicada",
      lockedMessage: () =>
        "Prueba aplicada: Esta evaluación ya ha sido aplicada a los estudiantes. Su estructura está bloqueada y no se puede modificar.",
      getBackUrl: a => buildUrl("/evaluaciones", withAsignatura({ tab: "pruebas" }, a)),
      getEditorUrl: (a, id) =>
        buildUrl("/evaluaciones", withAsignatura({ tab: "pruebas", view: "editor", pruebaId: id }, a)),

      exportDocument: (doc, modo, { colegio, profesorNombre }) => {
        abrirPruebaImprimible({ prueba: doc, colegio, profesorNombre, modo })
      },

      resolverCurriculo: doc => resolverMetadatosCurricularesPrueba(doc),
      cargarOAs: (a, c, uid, oas) => cargarOAsParaPrueba(a, c, uid, oas),

      convertToOther: async doc => pruebaToGuia(doc),
      getOtherEditorUrl: (a, id) =>
        buildUrl("/evaluaciones", withAsignatura({ tab: "guias", view: "editor", guiaId: id }, a)),
      convertOtherLabel: "Duplicar como guía",
    }),
    [],
  )

  const handlers = useMemo(
    () => ({
      aplicarIA: (data: any, ctx: DocumentEditorContext<PruebaTemplate>) => {
        const prueba = ctx.doc
        const construir = (sec: any, idx: number): SeccionPrueba => {
          const tipoPred = (sec.tipoPredominante as TipoItem) || "seleccion_multiple"
          const s = nuevaSeccion(prueba.secciones.length + idx + 1, tipoPred)
          s.titulo = sec.titulo || s.titulo
          s.instrucciones = sec.instrucciones || s.instrucciones
          s.items = (sec.items || [])
            .filter((it: any) => it && (it.enunciado || it.tipo))
            .map((it: any) => convertirItemIA(it))
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
        ctx: DocumentEditorContext<PruebaTemplate>,
      ) => {
        let payload: any = entry.payload
        if (entry.metadata.origen === "guia") {
          const converted = actividadGuiaAItemPrueba(payload as ActividadGuia, [])
          if (!converted) {
            ctx.flashMensaje("err", "La actividad no es compatible con el editor de pruebas", 3000)
            return
          }
          payload = converted
        }
        const itemClonado = {
          ...payload,
          id: `it_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          puntaje: payload.puntaje || 1,
        } as ItemPrueba

        ctx.updateDoc(p => {
          const secciones = [...p.secciones]
          if (secciones.length === 0) {
            secciones.push(nuevaSeccion(1, "seleccion_multiple"))
          }
          secciones[0] = {
            ...secciones[0],
            items: [...secciones[0].items, itemClonado],
          }
          return { ...p, secciones }
        })
        ctx.flashMensaje("ok", "Ítem insertado", 1500)
      },

      guardarItemEnBanco: async (
        item: ItemPrueba,
        ctx: DocumentEditorContext<PruebaTemplate>,
      ) => {
        const { guardarItemAlBanco } = await import("@/lib/item-bank")
        const prueba = ctx.doc
        try {
          await guardarItemAlBanco(item, {
            asignatura: prueba.asignatura,
            curso: prueba.curso || "",
            oas: item.oaVinculado ? [item.oaVinculado] : [],
            origen: "prueba",
            autor: ctx.profesorNombre || "",
          })
          ctx.flashMensaje("ok", "Ítem guardado en el banco")
        } catch (e: any) {
          ctx.flashMensaje("err", e?.message || "Error al guardar en el banco", 3000)
        }
      },
    }),
    [],
  )

  return (
    <DocumentEditor<PruebaTemplate>
      config={config}
      id={pruebaId}
      cursoInicial={cursoInicial}
      unidadIdInicial={unidadIdInicial}
      unidadNombreInicial={unidadNombreInicial}
      onClose={onClose}
      handlers={handlers}
    >
      {ctx => <PruebaEditorBody ctx={ctx} />}
    </DocumentEditor>
  )
}

// ─── Body ───────────────────────────────────────────────────────────────────

function PruebaEditorBody({
  ctx,
}: {
  ctx: DocumentEditorContext<PruebaTemplate>
}) {
  const prueba = ctx.doc
  const [mostrarConfig, setMostrarConfig] = useState(true)
  const locked = ctx.isLocked

  // ── Operaciones sobre secciones ──────────────────────────────────────
  const agregarSeccion = () => {
    ctx.updateDoc(p => ({
      ...p,
      secciones: [
        ...p.secciones,
        nuevaSeccion(p.secciones.length + 1, "seleccion_multiple"),
      ],
    }))
  }

  const updateSeccion = (id: string, parcial: Partial<SeccionPrueba>) => {
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

  // ── Operaciones sobre items ─────────────────────────────────────────
  const agregarItem = (seccionId: string, tipo: TipoItem) => {
    ctx.updateDoc(p => ({
      ...p,
      secciones: p.secciones.map(s =>
        s.id !== seccionId
          ? s
          : { ...s, items: [...s.items, nuevoItem(tipo)] },
      ),
    }))
  }

  const updateItem = (seccionId: string, item: ItemPrueba) => {
    ctx.updateDoc(p => ({
      ...p,
      secciones: p.secciones.map(s =>
        s.id !== seccionId
          ? s
          : { ...s, items: s.items.map(it => (it.id === item.id ? item : it)) },
      ),
    }))
  }

  const moverItem = (seccionId: string, itemId: string, dir: -1 | 1) => {
    ctx.updateDoc(p => ({
      ...p,
      secciones: p.secciones.map(s => {
        if (s.id !== seccionId) return s
        const idx = s.items.findIndex(it => it.id === itemId)
        const newIdx = idx + dir
        if (idx === -1 || newIdx < 0 || newIdx >= s.items.length) return s
        const next = [...s.items]
        ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
        return { ...s, items: next }
      }),
    }))
  }

  const eliminarItem = (seccionId: string, itemId: string) => {
    ctx.updateDoc(p => ({
      ...p,
      secciones: p.secciones.map(s =>
        s.id !== seccionId
          ? s
          : { ...s, items: s.items.filter(it => it.id !== itemId) },
      ),
    }))
  }

  // ── Drag & drop ─────────────────────────────────────────────────────
  const handleSectionDrop = (e: React.DragEvent, targetSectionId: string) => {
    e.preventDefault()

    // 1. Drop desde el banco de ítems
    const bankData = e.dataTransfer.getData("item-bank-entry")
    if (bankData) {
      try {
        const entry = JSON.parse(bankData) as ItemBankEntry
        let payload: any = entry.payload
        if (entry.metadata.origen === "guia") {
          const converted = actividadGuiaAItemPrueba(payload as ActividadGuia, [])
          if (!converted) {
            ctx.flashMensaje("err", "La actividad no es compatible con el editor de pruebas", 3000)
            return
          }
          payload = converted
        }
        const itemClonado = {
          ...payload,
          id: `it_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          puntaje: payload.puntaje || 1,
        } as ItemPrueba
        ctx.updateDoc(p => ({
          ...p,
          secciones: p.secciones.map(s =>
            s.id !== targetSectionId
              ? s
              : { ...s, items: [...s.items, itemClonado] },
          ),
        }))
        ctx.flashMensaje("ok", "Ítem insertado", 1500)
      } catch {}
      return
    }

    // 2. Drop de un ítem existente
    const draggedItemId = e.dataTransfer.getData("application/x-item-id")
    const sourceSectionId = e.dataTransfer.getData("application/x-source-section-id")
    if (draggedItemId && sourceSectionId) {
      if (sourceSectionId === targetSectionId) return
      ctx.updateDoc(p => {
        const sourceSec = p.secciones.find(s => s.id === sourceSectionId)
        if (!sourceSec) return p
        const item = sourceSec.items.find(it => it.id === draggedItemId)
        if (!item) return p
        return {
          ...p,
          secciones: p.secciones.map(s => {
            if (s.id === sourceSectionId)
              return { ...s, items: s.items.filter(it => it.id !== draggedItemId) }
            if (s.id === targetSectionId)
              return { ...s, items: [...s.items, item] }
            return s
          }),
        }
      })
      return
    }

    // 3. Drop de una sección
    const draggedSectionId = e.dataTransfer.getData("application/x-section-id")
    if (draggedSectionId && draggedSectionId !== targetSectionId) {
      ctx.updateDoc(p => {
        const idxDrag = p.secciones.findIndex(s => s.id === draggedSectionId)
        const idxTarget = p.secciones.findIndex(s => s.id === targetSectionId)
        if (idxDrag === -1 || idxTarget === -1) return p
        const next = [...p.secciones]
        const [dragged] = next.splice(idxDrag, 1)
        next.splice(idxTarget, 0, dragged)
        return { ...p, secciones: next.map((s, i) => ({ ...s, orden: i + 1 })) }
      })
    }
  }

  const handleItemDropOnItem = (
    e: React.DragEvent,
    targetItemId: string,
    targetSectionId: string,
  ) => {
    e.preventDefault()
    e.stopPropagation()

    const bankData = e.dataTransfer.getData("item-bank-entry")
    if (bankData) {
      try {
        const entry = JSON.parse(bankData) as ItemBankEntry
        const itemClonado = {
          ...entry.payload,
          id: `it_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          puntaje: entry.payload.puntaje || 1,
        } as ItemPrueba
        ctx.updateDoc(p => ({
          ...p,
          secciones: p.secciones.map(s => {
            if (s.id !== targetSectionId) return s
            const idx = s.items.findIndex(it => it.id === targetItemId)
            const items = [...s.items]
            if (idx === -1) items.push(itemClonado)
            else items.splice(idx, 0, itemClonado)
            return { ...s, items }
          }),
        }))
        ctx.flashMensaje("ok", "Ítem insertado", 1500)
      } catch {}
      return
    }

    const draggedItemId = e.dataTransfer.getData("application/x-item-id")
    const sourceSectionId = e.dataTransfer.getData("application/x-source-section-id")
    if (draggedItemId && sourceSectionId) {
      ctx.updateDoc(p => {
        const sourceSec = p.secciones.find(s => s.id === sourceSectionId)
        const targetSec = p.secciones.find(s => s.id === targetSectionId)
        if (!sourceSec || !targetSec) return p
        const item = sourceSec.items.find(it => it.id === draggedItemId)
        if (!item) return p
        if (sourceSectionId === targetSectionId) {
          const idxDrag = sourceSec.items.findIndex(it => it.id === draggedItemId)
          const idxTarget = sourceSec.items.findIndex(it => it.id === targetItemId)
          if (idxDrag === -1 || idxTarget === -1) return p
          const items = [...sourceSec.items]
          const [dragged] = items.splice(idxDrag, 1)
          items.splice(idxTarget, 0, dragged)
          return {
            ...p,
            secciones: p.secciones.map(s =>
              s.id === sourceSectionId ? { ...s, items } : s,
            ),
          }
        } else {
          const idxTarget = targetSec.items.findIndex(it => it.id === targetItemId)
          return {
            ...p,
            secciones: p.secciones.map(s => {
              if (s.id === sourceSectionId)
                return { ...s, items: s.items.filter(it => it.id !== draggedItemId) }
              if (s.id === targetSectionId) {
                const items = [...s.items]
                if (idxTarget === -1) items.push(item)
                else items.splice(idxTarget, 0, item)
                return { ...s, items }
              }
              return s
            }),
          }
        }
      })
    }
  }

  // ── Configuración ───────────────────────────────────────────────────
  const totalItems = prueba.secciones.reduce((a, s) => a + s.items.length, 0)
  const puntajeTotal = calcularPuntajeMaximoPrueba(prueba.secciones)

  return (
    <>
      <Section
        title="Configuración"
        expanded={mostrarConfig}
        onToggle={() => setMostrarConfig(v => !v)}
        icon={Settings}
        accent="rose"
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Curso">
            <input
              value={prueba.curso}
              onChange={e =>
                ctx.updateDoc(p => ({ ...p, curso: e.target.value }))
              }
              placeholder="4°A"
              className="h-9 w-full rounded border border-border bg-background px-3 text-[13px]"
            />
          </Field>
          <Field label="Unidad">
            <select
              value={prueba.unidadId || ""}
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
                <option key={u.id} value={String(u.id)}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tipo de evaluación">
            <select
              value={prueba.tipoEvaluacion || "sumativa"}
              onChange={e =>
                ctx.updateDoc(p => ({
                  ...p,
                  tipoEvaluacion: e.target.value as any,
                }))
              }
              className="h-9 w-full rounded border border-border bg-background px-3 text-[13px]"
            >
              <option value="sumativa">Sumativa</option>
              <option value="formativa">Formativa</option>
              <option value="diagnostica">Diagnóstica</option>
            </select>
          </Field>
          <Field label="Tiempo (min)">
            <input
              type="number"
              min={5}
              value={prueba.tiempoMinutos || 90}
              onChange={e =>
                ctx.updateDoc(p => ({
                  ...p,
                  tiempoMinutos: Number(e.target.value) || 90,
                }))
              }
              className="h-9 w-full rounded border border-border bg-background px-3 text-[13px]"
            />
          </Field>
          <Field label="Ponderación (%)">
            <input
              type="number"
              min={0}
              max={100}
              value={prueba.ponderacion || 0}
              onChange={e =>
                ctx.updateDoc(p => ({
                  ...p,
                  ponderacion: Number(e.target.value) || 0,
                }))
              }
              className="h-9 w-full rounded border border-border bg-background px-3 text-[13px]"
            />
          </Field>
          <Field label="Exigencia">
            <select
              value={String(prueba.exigencia ?? 0.6)}
              onChange={e =>
                ctx.updateDoc(p => ({
                  ...p,
                  exigencia: Number(e.target.value),
                }))
              }
              className="h-9 w-full rounded border border-border bg-background px-3 text-[13px]"
            >
              <option value="0.5">50% (PIE)</option>
              <option value="0.6">60% (estándar)</option>
              <option value="0.7">70%</option>
            </select>
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={ctx.sincronizarConCurriculo}
            disabled={!prueba.curso || !prueba.unidadNombre}
            className={cn(
              "flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[11px] font-bold transition-colors",
              "border border-[var(--accent-pruebas)]/40 bg-[var(--accent-pruebas-soft)]/50 text-[var(--accent-pruebas)]",
              "hover:bg-[var(--accent-pruebas-soft)]",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Sincronizar con currículum
          </button>
          <span className="text-[10.5px] text-muted-foreground">
            Carga OAs e indicadores oficiales desde la unidad seleccionada
          </span>
        </div>

        <div className="mt-4">
          <Field label="Instrucciones generales (una por línea)">
            <textarea
              value={prueba.instruccionesGenerales.join("\n")}
              onChange={e =>
                ctx.updateDoc(p => ({
                  ...p,
                  instruccionesGenerales: e.target.value.split("\n"),
                }))
              }
              rows={5}
              className="w-full resize-y rounded border border-border bg-background px-3 py-2 text-[12.5px]"
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
              Objetivos de aprendizaje
            </label>
            <textarea
              value={(prueba.metadatosCurriculares?.objetivos || []).join("\n")}
              onChange={e =>
                ctx.updateDoc(p => ({
                  ...p,
                  metadatosCurriculares: {
                    ...p.metadatosCurriculares!,
                    objetivos: e.target.value
                      .split("\n")
                      .map(s => s.trim())
                      .filter(Boolean),
                  },
                }))
              }
              rows={4}
              placeholder="OA 1: ...&#10;OA 2: ..."
              className="w-full resize-y rounded border border-border bg-background px-3 py-2 text-[11.5px]"
            />
          </div>
          <div>
            <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
              Indicadores de evaluación
            </label>
            <textarea
              value={(prueba.metadatosCurriculares?.indicadores || []).join("\n")}
              onChange={e =>
                ctx.updateDoc(p => ({
                  ...p,
                  metadatosCurriculares: {
                    ...p.metadatosCurriculares!,
                    indicadores: e.target.value
                      .split("\n")
                      .map(s => s.trim())
                      .filter(Boolean),
                  },
                }))
              }
              rows={4}
              placeholder="Indicador 1...&#10;Indicador 2..."
              className="w-full resize-y rounded border border-border bg-background px-3 py-2 text-[11.5px]"
            />
          </div>
        </div>
      </Section>

      {/* ── Secciones ────────────────────────────────────────────── */}
      {prueba.secciones.map((seccion, idx) => {
        const puntosSeccion = seccion.items.reduce(
          (a, it) => a + (it.puntaje || 0),
          0,
        )
        return (
          <div
            key={seccion.id}
            onDragOver={e => e.preventDefault()}
            onDrop={e => handleSectionDrop(e, seccion.id)}
            className="rounded-[14px] border border-border bg-background/40 p-4"
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span
                draggable={true}
                onDragStart={e => {
                  e.dataTransfer.setData("application/x-section-id", seccion.id)
                  e.dataTransfer.effectAllowed = "move"
                }}
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-lg text-[14px] font-extrabold text-white cursor-grab active:cursor-grabbing",
                  "bg-[var(--accent-pruebas)]",
                )}
              >
                {romano(seccion.orden)}
              </span>
              <input
                value={seccion.titulo}
                onChange={e => updateSeccion(seccion.id, { titulo: e.target.value })}
                placeholder={`Ítem ${romano(seccion.orden)}: tipo de pregunta`}
                className="flex-1 min-w-0 rounded border border-border bg-background px-2 py-1.5 text-[13px] font-bold outline-none"
              />
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-bold text-muted-foreground">
                {seccion.items.length}{" "}
                {seccion.items.length === 1 ? "ítem" : "ítems"} · {puntosSeccion} pts
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => moverSeccion(seccion.id, -1)}
                  disabled={idx === 0}
                  className="h-7 w-7 rounded border border-border bg-card hover:bg-muted/40 disabled:opacity-40 font-bold"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moverSeccion(seccion.id, 1)}
                  disabled={idx === prueba.secciones.length - 1}
                  className="h-7 w-7 rounded border border-border bg-card hover:bg-muted/40 disabled:opacity-40 font-bold"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => eliminarSeccion(seccion.id)}
                  className="h-7 w-7 rounded border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
                  title="Eliminar sección"
                  aria-label="Eliminar sección"
                >
                  <Trash2 className="mx-auto h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <textarea
              value={seccion.instrucciones}
              onChange={e =>
                updateSeccion(seccion.id, { instrucciones: e.target.value })
              }
              rows={2}
              placeholder="Instrucciones de la sección…"
              className={cn(
                "mb-3 w-full resize-y rounded border border-border bg-background px-3 py-2 text-[12.5px] italic outline-none",
                "focus:border-[var(--accent-pruebas)]",
              )}
            />

            <details className="mb-3 rounded border border-border bg-card/50">
              <summary className="cursor-pointer px-3 py-2 text-[11.5px] font-bold text-muted-foreground hover:bg-muted/30">
                + Estímulo / texto / imagen para esta sección (lectura
                comprensiva, afiche, etc.)
              </summary>
              <div className="border-t border-border p-3">
                <BloquesEditor
                  bloques={seccion.estimulo || []}
                  onChange={est => updateSeccion(seccion.id, { estimulo: est })}
                  tipoDoc="pruebas"
                  docId={prueba.id}
                  empty="Sin estímulo. Útil para textos de lectura comprensiva o afiches."
                />
              </div>
            </details>

            <div className="space-y-3">
              {seccion.items.map((item, i) => (
                <ItemEditor
                  key={item.id}
                  item={item}
                  numero={i + 1}
                  oasDisponibles={prueba.oas || []}
                  tipoDoc="pruebas"
                  docId={prueba.id}
                  onChange={it => updateItem(seccion.id, it)}
                  onDelete={() => eliminarItem(seccion.id, item.id)}
                  onMoveUp={() => moverItem(seccion.id, item.id, -1)}
                  onMoveDown={() => moverItem(seccion.id, item.id, 1)}
                  isFirst={i === 0}
                  isLast={i === seccion.items.length - 1}
                  onDragStart={e => {
                    e.dataTransfer.setData("application/x-item-id", item.id)
                    e.dataTransfer.setData(
                      "application/x-source-section-id",
                      seccion.id,
                    )
                    e.dataTransfer.effectAllowed = "move"
                  }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => handleItemDropOnItem(e, item.id, seccion.id)}
                  onSaveToBank={() =>
                    ctx.handlers.guardarItemEnBanco(item, ctx)
                  }
                />
              ))}

              <SelectorTipoItem
                modo="prueba"
                onSelect={tipo => agregarItem(seccion.id, tipo)}
              />
            </div>
          </div>
        )
      })}

      {!locked && (
        <button
          type="button"
          onClick={agregarSeccion}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-[12px] border-2 border-dashed border-border bg-card px-4 py-4 text-[13px] font-bold text-muted-foreground transition-colors",
            "hover:border-[var(--accent-pruebas)] hover:text-[var(--accent-pruebas)]",
          )}
        >
          <Plus className="h-4 w-4" />
          Agregar sección (Ítem {romano(prueba.secciones.length + 1)})
          <span className="ml-1 hidden text-[10px] font-medium text-muted-foreground sm:inline">
            {formatShortcut(COMMON_SHORTCUTS.NUEVA_SECCION)}
          </span>
        </button>
      )}

      {/* Resumen final */}
      <div className="rounded-[12px] border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[12px] font-bold text-emerald-800 dark:text-emerald-300">
              Resumen de la prueba
            </div>
            <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
              {prueba.secciones.length}{" "}
              {prueba.secciones.length === 1 ? "sección" : "secciones"} ·{" "}
              {totalItems} {totalItems === 1 ? "ítem" : "ítems"} ·{" "}
              <b>{puntajeTotal} pts máximo</b>
              {prueba.tiempoMinutos ? ` · ${prueba.tiempoMinutos} min` : ""}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => ctx.exportar("para_alumno")}
              className="flex items-center gap-1.5 rounded-[8px] border border-emerald-300 bg-white px-3 py-1.5 text-[11.5px] font-bold text-emerald-700 hover:bg-emerald-50 dark:bg-emerald-900/40 dark:text-emerald-200"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir prueba
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
