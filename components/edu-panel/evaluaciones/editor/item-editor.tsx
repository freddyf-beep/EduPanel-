"use client"

// ═══════════════════════════════════════════════════════════════════════════
// Editor de un ítem de prueba (uno de los 7 tipos)
// ═══════════════════════════════════════════════════════════════════════════

import {
  CheckCircle2, Circle, GripVertical, Plus, Trash2, X,
  Hash, ListChecks, ToggleLeft, ArrowDownUp, FileText,
  PenLine, AlignLeft, Library
} from "lucide-react"
import type {
  ItemPrueba, ItemSeleccionMultiple, ItemVerdaderoFalso,
  ItemPareados, ItemOrdenar, ItemCompletar,
  ItemRespuestaCorta, ItemDesarrollo, TipoItem,
  AlternativaSM,
} from "@/lib/pruebas"
import { nuevoItemId } from "@/lib/pruebas"
import type { OAEditado } from "@/lib/curriculo"
import { BloquesEditor } from "./bloques-editor"
import { cn } from "@/lib/utils"

const TIPO_LABEL: Record<TipoItem, { label: string; icon: any; color: string }> = {
  seleccion_multiple: { label: "Selección múltiple", icon: ListChecks, color: "bg-blue-100 text-blue-700 border-blue-300" },
  verdadero_falso: { label: "Verdadero o Falso", icon: ToggleLeft, color: "bg-green-100 text-green-700 border-green-300" },
  pareados: { label: "Términos pareados", icon: ArrowDownUp, color: "bg-purple-100 text-purple-700 border-purple-300" },
  ordenar: { label: "Ordenar", icon: Hash, color: "bg-amber-100 text-amber-700 border-amber-300" },
  completar: { label: "Completar", icon: PenLine, color: "bg-pink-100 text-pink-700 border-pink-300" },
  respuesta_corta: { label: "Respuesta corta", icon: AlignLeft, color: "bg-cyan-100 text-cyan-700 border-cyan-300" },
  desarrollo: { label: "Desarrollo", icon: FileText, color: "bg-indigo-100 text-indigo-700 border-indigo-300" },
}

interface Props {
  item: ItemPrueba
  numero: number
  oasDisponibles: OAEditado[]
  tipoDoc: "pruebas"
  docId: string
  onChange: (item: ItemPrueba) => void
  onDelete: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  isFirst?: boolean
  isLast?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onSaveToBank?: () => void
}

export function ItemEditor({
  item, numero, oasDisponibles, tipoDoc, docId,
  onChange, onDelete, onMoveUp, onMoveDown, isFirst, isLast,
  onDragStart, onDragOver, onDrop, onSaveToBank,
}: Props) {
  const tipoConfig = TIPO_LABEL[item.tipo]
  const Icon = tipoConfig.icon

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="rounded-[12px] border border-border bg-card p-4 shadow-sm"
    >
      {/* Header del ítem */}
      <div className="mb-3 flex items-start gap-3">
        <div className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground/40 hover:text-muted-foreground">
          <GripVertical className="h-4 w-4" />
        </div>
        <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-primary/10 text-[12px] font-bold text-primary">
          {numero}
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold", tipoConfig.color)}>
              <Icon className="h-3 w-3" />
              {tipoConfig.label}
            </span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={item.puntaje}
              onChange={e => onChange({ ...item, puntaje: Number(e.target.value) || 0 })}
              className="h-7 w-20 rounded border border-border bg-background px-2 text-[12px] font-semibold"
              title="Puntaje del ítem"
            />
            <span className="text-[10.5px] text-muted-foreground">pts</span>

            {oasDisponibles.length > 0 && (
              <select
                value={item.oaVinculado || ""}
                onChange={e => onChange({ ...item, oaVinculado: e.target.value || undefined })}
                className="h-7 rounded border border-border bg-background px-2 text-[11px]"
                title="OA vinculado"
              >
                <option value="">Sin OA</option>
                {oasDisponibles.filter(oa => oa.seleccionado || oa.esPropio).map(oa => (
                  <option key={oa.id} value={oa.id}>{oa.id}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="flex gap-1">
          {onSaveToBank && (
            <button
              type="button"
              onClick={onSaveToBank}
              className="h-7 w-7 rounded border border-border bg-background hover:bg-muted/40"
              title="Guardar al banco"
            >
              <Library className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
          {onMoveUp && (
            <button
              type="button"
              onClick={onMoveUp}
              disabled={isFirst}
              className="h-7 w-7 rounded border border-border bg-background hover:bg-muted/40 disabled:opacity-40"
              title="Subir"
            >
              ↑
            </button>
          )}
          {onMoveDown && (
            <button
              type="button"
              onClick={onMoveDown}
              disabled={isLast}
              className="h-7 w-7 rounded border border-border bg-background hover:bg-muted/40 disabled:opacity-40"
              title="Bajar"
            >
              ↓
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="h-7 w-7 rounded border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
            title="Eliminar ítem"
          >
            <Trash2 className="mx-auto h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Enunciado */}
      <textarea
        value={item.enunciado}
        onChange={e => onChange({ ...item, enunciado: e.target.value } as ItemPrueba)}
        rows={2}
        placeholder="Enunciado de la pregunta…"
        className="mb-3 w-full resize-y rounded border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
      />

      {/* Recursos visuales asociados al ítem */}
      <details className="mb-3 rounded border border-border bg-background/40">
        <summary className="cursor-pointer select-none px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted/30">
          <span>+ Imagen / texto adicional para este ítem</span>
        </summary>
        <div className="border-t border-border p-2 space-y-2">
          <BloquesEditor
            bloques={item.recursos || []}
            onChange={recursos => onChange({ ...item, recursos } as ItemPrueba)}
            tipoDoc={tipoDoc}
            docId={docId}
            empty="Agrega imagen o texto adicional para esta pregunta"
            compact
          />
        </div>
      </details>

      {/* Editor específico por tipo */}
      {item.tipo === "seleccion_multiple" && <SeleccionMultipleEditor item={item} onChange={onChange} />}
      {item.tipo === "verdadero_falso" && <VerdaderoFalsoEditor item={item} onChange={onChange} />}
      {item.tipo === "pareados" && <PareadosEditor item={item} onChange={onChange} />}
      {item.tipo === "ordenar" && <OrdenarEditor item={item} onChange={onChange} />}
      {item.tipo === "completar" && <CompletarEditor item={item} onChange={onChange} />}
      {item.tipo === "respuesta_corta" && <RespuestaCortaEditor item={item} onChange={onChange} />}
      {item.tipo === "desarrollo" && <DesarrolloEditor item={item} onChange={onChange} />}
    </div>
  )
}

// ─── Selección múltiple ────────────────────────────────────────────────────

function SeleccionMultipleEditor({
  item, onChange,
}: {
  item: ItemSeleccionMultiple
  onChange: (item: ItemPrueba) => void
}) {
  const updateAlt = (id: string, parcial: Partial<AlternativaSM>) => {
    onChange({
      ...item,
      alternativas: item.alternativas.map(a => a.id === id ? { ...a, ...parcial } : a),
    })
  }

  const setCorrecta = (id: string) => {
    onChange({
      ...item,
      alternativas: item.alternativas.map(a => ({ ...a, esCorrecta: a.id === id })),
    })
  }

  const agregarAlt = () => {
    onChange({
      ...item,
      alternativas: [...item.alternativas, { id: nuevoItemId("alt"), texto: "", esCorrecta: false }],
    })
  }

  const eliminarAlt = (id: string) => {
    if (item.alternativas.length <= 2) return
    onChange({
      ...item,
      alternativas: item.alternativas.filter(a => a.id !== id),
    })
  }

  return (
    <div className="space-y-1.5">
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
        Alternativas (marca la correcta)
      </div>
      {item.alternativas.map((a, i) => (
        <div key={a.id} className="flex items-start gap-2 rounded border border-border bg-background px-2 py-1.5">
          <button
            type="button"
            onClick={() => setCorrecta(a.id)}
            className="mt-1 flex-shrink-0"
            title={a.esCorrecta ? "Correcta" : "Marcar como correcta"}
          >
            {a.esCorrecta ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground hover:text-emerald-600" />
            )}
          </button>
          <span className="mt-1.5 text-[12px] font-bold text-muted-foreground">
            {String.fromCharCode(97 + i)})
          </span>
          <input
            value={a.texto}
            onChange={e => updateAlt(a.id, { texto: e.target.value })}
            placeholder={`Alternativa ${String.fromCharCode(97 + i)}`}
            className="flex-1 bg-transparent px-2 py-1 text-[13px] outline-none"
          />
          <button
            type="button"
            onClick={() => eliminarAlt(a.id)}
            disabled={item.alternativas.length <= 2}
            className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-30"
            title="Eliminar alternativa"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={agregarAlt}
        className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
      >
        <Plus className="h-3 w-3" /> Agregar alternativa
      </button>
    </div>
  )
}

// ─── Verdadero o Falso ────────────────────────────────────────────────────

function VerdaderoFalsoEditor({
  item, onChange,
}: {
  item: ItemVerdaderoFalso
  onChange: (item: ItemPrueba) => void
}) {
  return (
    <div className="space-y-2">
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
        Respuesta correcta
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange({ ...item, respuestaCorrecta: true })}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-[8px] border-2 px-3 py-2 text-[13px] font-bold transition",
            item.respuestaCorrecta
              ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30"
              : "border-border bg-background text-muted-foreground hover:border-emerald-300"
          )}
        >
          <CheckCircle2 className="h-4 w-4" /> Verdadero
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...item, respuestaCorrecta: false })}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-[8px] border-2 px-3 py-2 text-[13px] font-bold transition",
            !item.respuestaCorrecta
              ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950/30"
              : "border-border bg-background text-muted-foreground hover:border-red-300"
          )}
        >
          <X className="h-4 w-4" /> Falso
        </button>
      </div>
      <label className="flex items-center gap-2 text-[11.5px]">
        <input
          type="checkbox"
          checked={item.pideJustificacion || false}
          onChange={e => onChange({ ...item, pideJustificacion: e.target.checked })}
        />
        Pedir justificación si la respuesta es falsa
      </label>
    </div>
  )
}

// ─── Pareados ──────────────────────────────────────────────────────────────

function PareadosEditor({
  item, onChange,
}: {
  item: ItemPareados
  onChange: (item: ItemPrueba) => void
}) {
  const agregarPar = () => {
    const aId = nuevoItemId("a")
    const bId = nuevoItemId("b")
    onChange({
      ...item,
      columnaA: [...item.columnaA, { id: aId, texto: "" }],
      columnaB: [...item.columnaB, { id: bId, texto: "", correctaParaAId: aId }],
    })
  }

  const eliminarPar = (idx: number) => {
    if (item.columnaA.length <= 2) return
    const aId = item.columnaA[idx].id
    onChange({
      ...item,
      columnaA: item.columnaA.filter((_, i) => i !== idx),
      columnaB: item.columnaB.filter((b) => b.correctaParaAId !== aId).slice(0, item.columnaA.length - 1),
    })
  }

  const updateA = (idx: number, texto: string) => {
    const next = [...item.columnaA]
    next[idx] = { ...next[idx], texto }
    onChange({ ...item, columnaA: next })
  }

  const updateB = (idx: number, parcial: Partial<typeof item.columnaB[number]>) => {
    const next = [...item.columnaB]
    next[idx] = { ...next[idx], ...parcial }
    onChange({ ...item, columnaB: next })
  }

  return (
    <div className="space-y-2">
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
        Columnas pareadas (la columna B se mostrará barajada al imprimir)
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] font-bold text-muted-foreground">Columna A</div>
          {item.columnaA.map((a, i) => (
            <div key={a.id} className="mb-1.5 flex items-center gap-1">
              <span className="text-[11px] font-bold text-muted-foreground w-5">{i + 1}.</span>
              <input
                value={a.texto}
                onChange={e => updateA(i, e.target.value)}
                placeholder={`Elemento A${i + 1}`}
                className="flex-1 rounded border border-border bg-background px-2 py-1 text-[12.5px] outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => eliminarPar(i)}
                disabled={item.columnaA.length <= 2}
                className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-30"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        <div>
          <div className="mb-1 text-[11px] font-bold text-muted-foreground">Columna B (definir corresp.)</div>
          {item.columnaB.slice(0, item.columnaA.length).map((b, i) => (
            <div key={b.id} className="mb-1.5 flex items-center gap-1">
              <span className="text-[11px] font-bold text-muted-foreground w-5">{String.fromCharCode(97 + i)})</span>
              <input
                value={b.texto}
                onChange={e => updateB(i, { texto: e.target.value })}
                placeholder={`Elemento B${i + 1}`}
                className="flex-1 rounded border border-border bg-background px-2 py-1 text-[12.5px] outline-none focus:border-primary"
              />
              <select
                value={b.correctaParaAId}
                onChange={e => updateB(i, { correctaParaAId: e.target.value })}
                className="rounded border border-border bg-background px-1 py-1 text-[11px] font-semibold"
                title="Corresponde a A..."
              >
                {item.columnaA.map((a, j) => (
                  <option key={a.id} value={a.id}>= {j + 1}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={agregarPar}
        className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
      >
        <Plus className="h-3 w-3" /> Agregar par
      </button>
    </div>
  )
}

// ─── Ordenar ──────────────────────────────────────────────────────────────

function OrdenarEditor({
  item, onChange,
}: {
  item: ItemOrdenar
  onChange: (item: ItemPrueba) => void
}) {
  const updatePaso = (idx: number, texto: string) => {
    const pasos = [...item.pasos]
    pasos[idx] = { ...pasos[idx], texto }
    onChange({ ...item, pasos })
  }

  const moverPaso = (idx: number, dir: -1 | 1) => {
    const pasos = [...item.pasos]
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= pasos.length) return
    ;[pasos[idx], pasos[newIdx]] = [pasos[newIdx], pasos[idx]]
    onChange({ ...item, pasos })
  }

  const agregarPaso = () => {
    onChange({ ...item, pasos: [...item.pasos, { id: nuevoItemId("p"), texto: "" }] })
  }

  const eliminarPaso = (idx: number) => {
    if (item.pasos.length <= 2) return
    onChange({ ...item, pasos: item.pasos.filter((_, i) => i !== idx) })
  }

  return (
    <div className="space-y-2">
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
        Pasos en orden correcto (al imprimir aparecerán mezclados)
      </div>
      {item.pasos.map((p, i) => (
        <div key={p.id} className="flex items-center gap-1.5 rounded border border-border bg-background px-2 py-1">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
          <span className="grid h-6 w-6 place-items-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-700">
            {i + 1}
          </span>
          <input
            value={p.texto}
            onChange={e => updatePaso(i, e.target.value)}
            placeholder={`Paso ${i + 1}`}
            className="flex-1 bg-transparent px-2 py-0.5 text-[12.5px] outline-none"
          />
          <button type="button" onClick={() => moverPaso(i, -1)} disabled={i === 0}
            className="text-[12px] disabled:opacity-30">↑</button>
          <button type="button" onClick={() => moverPaso(i, 1)} disabled={i === item.pasos.length - 1}
            className="text-[12px] disabled:opacity-30">↓</button>
          <button type="button" onClick={() => eliminarPaso(i)}
            className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-30"
            disabled={item.pasos.length <= 2}>
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={agregarPaso}
        className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
      >
        <Plus className="h-3 w-3" /> Agregar paso
      </button>
    </div>
  )
}

// ─── Completar ────────────────────────────────────────────────────────────

function CompletarEditor({
  item, onChange,
}: {
  item: ItemCompletar
  onChange: (item: ItemPrueba) => void
}) {
  const blancos = (item.textoConBlancos.match(/__+/g) || []).length

  const sincronizarRespuestas = (texto: string) => {
    const n = (texto.match(/__+/g) || []).length
    const respuestas = Array.from({ length: n }, (_, i) => item.respuestas[i] || "")
    onChange({ ...item, textoConBlancos: texto, respuestas })
  }

  const updateRespuesta = (idx: number, valor: string) => {
    const r = [...item.respuestas]
    r[idx] = valor
    onChange({ ...item, respuestas: r })
  }

  return (
    <div className="space-y-2">
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
        Texto con espacios (usa __ para cada espacio en blanco)
      </div>
      <textarea
        value={item.textoConBlancos}
        onChange={e => sincronizarRespuestas(e.target.value)}
        rows={3}
        placeholder="Las palabras esdrújulas siempre llevan __ y la sílaba tónica está en la __ sílaba."
        className="w-full resize-y rounded border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
      />
      {blancos > 0 && (
        <div>
          <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
            Respuestas correctas ({blancos} blancos detectados)
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {item.respuestas.map((r, i) => (
              <input
                key={i}
                value={r}
                onChange={e => updateRespuesta(i, e.target.value)}
                placeholder={`Respuesta para blanco ${i + 1}`}
                className="rounded border border-border bg-background px-2 py-1 text-[12.5px]"
              />
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 text-[11.5px]">
        <span className="font-semibold text-muted-foreground">Banco de palabras:</span>
        <input
          value={(item.bancoPalabras || []).join(", ")}
          onChange={e => onChange({
            ...item,
            bancoPalabras: e.target.value.split(",").map(s => s.trim()).filter(Boolean),
          })}
          placeholder="palabra1, palabra2 (opcional, separadas por coma)"
          className="flex-1 rounded border border-border bg-background px-2 py-1 text-[12px]"
        />
      </div>
    </div>
  )
}

// ─── Respuesta corta ──────────────────────────────────────────────────────

function RespuestaCortaEditor({
  item, onChange,
}: {
  item: ItemRespuestaCorta
  onChange: (item: ItemPrueba) => void
}) {
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
            Líneas para responder
          </label>
          <input
            type="number"
            min={1}
            max={20}
            value={item.lineasRespuesta || 2}
            onChange={e => onChange({ ...item, lineasRespuesta: Math.max(1, Number(e.target.value) || 1) })}
            className="h-7 w-20 rounded border border-border bg-background px-2 text-[12px]"
          />
        </div>
      </div>
      <div>
        <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
          Respuesta esperada (referencia para corrección)
        </label>
        <textarea
          value={item.respuestaEsperada || ""}
          onChange={e => onChange({ ...item, respuestaEsperada: e.target.value })}
          rows={2}
          placeholder="Ej: La respuesta correcta es…"
          className="w-full resize-y rounded border border-border bg-background px-3 py-2 text-[12.5px]"
        />
      </div>
    </div>
  )
}

// ─── Desarrollo ───────────────────────────────────────────────────────────

function DesarrolloEditor({
  item, onChange,
}: {
  item: ItemDesarrollo
  onChange: (item: ItemPrueba) => void
}) {
  const agregarCriterio = () => {
    onChange({
      ...item,
      criterios: [...(item.criterios || []), { id: nuevoItemId("crit"), texto: "", puntaje: 1 }],
    })
  }

  const updateCriterio = (id: string, parcial: Partial<{ texto: string; puntaje: number }>) => {
    onChange({
      ...item,
      criterios: (item.criterios || []).map(c => c.id === id ? { ...c, ...parcial } : c),
    })
  }

  const eliminarCriterio = (id: string) => {
    onChange({ ...item, criterios: (item.criterios || []).filter(c => c.id !== id) })
  }

  const sumaCriterios = (item.criterios || []).reduce((s, c) => s + c.puntaje, 0)

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
            Líneas para responder
          </label>
          <input
            type="number"
            min={1}
            max={30}
            value={item.lineasRespuesta || 5}
            onChange={e => onChange({ ...item, lineasRespuesta: Math.max(1, Number(e.target.value) || 1) })}
            className="h-7 w-20 rounded border border-border bg-background px-2 text-[12px]"
          />
        </div>
      </div>
      <div>
        <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
          Pauta de corrección sugerida
        </label>
        <textarea
          value={item.pautaCorreccion || ""}
          onChange={e => onChange({ ...item, pautaCorreccion: e.target.value })}
          rows={2}
          placeholder="Indica qué elementos debe contener la respuesta para considerarse correcta…"
          className="w-full resize-y rounded border border-border bg-background px-3 py-2 text-[12.5px]"
        />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
            Criterios de evaluación (opcional)
          </label>
          {(item.criterios?.length || 0) > 0 && (
            <span className={cn(
              "text-[10.5px] font-bold",
              sumaCriterios === item.puntaje ? "text-emerald-600" : "text-amber-600"
            )}>
              Suma: {sumaCriterios} / {item.puntaje} pts
            </span>
          )}
        </div>
        {(item.criterios || []).map(c => (
          <div key={c.id} className="mt-1 flex items-center gap-1.5">
            <input
              value={c.texto}
              onChange={e => updateCriterio(c.id, { texto: e.target.value })}
              placeholder="Criterio"
              className="flex-1 rounded border border-border bg-background px-2 py-1 text-[12.5px]"
            />
            <input
              type="number"
              min={0}
              step={0.5}
              value={c.puntaje}
              onChange={e => updateCriterio(c.id, { puntaje: Number(e.target.value) || 0 })}
              className="w-16 rounded border border-border bg-background px-2 py-1 text-[12px]"
            />
            <span className="text-[10.5px] text-muted-foreground">pts</span>
            <button
              type="button"
              onClick={() => eliminarCriterio(c.id)}
              className="rounded p-1 text-red-600 hover:bg-red-50"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={agregarCriterio}
          className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
        >
          <Plus className="h-3 w-3" /> Agregar criterio
        </button>
      </div>
    </div>
  )
}
