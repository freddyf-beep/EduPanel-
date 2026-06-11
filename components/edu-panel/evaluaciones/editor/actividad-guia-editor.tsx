"use client"

// ═══════════════════════════════════════════════════════════════════════════
// Editor de una actividad de guía
// Soporta los 13 tipos definidos en lib/guias.ts
// ═══════════════════════════════════════════════════════════════════════════

import {
  CheckCircle2, Circle, Plus, Trash2, X, GripVertical, Library,
  ListChecks, ToggleLeft, PenLine, AlignLeft, Hash, ArrowDownUp,
  CircleDot, Square, Palette, PenTool, Search, Grid3x3, FileQuestion,
} from "lucide-react"
import type { ActividadGuia, TipoActividadGuia } from "@/lib/guias"
import { nuevoIdGuia } from "@/lib/guias"
import type { OAEditado } from "@/lib/curriculo"
import { BloquesEditor } from "./bloques-editor"
import { cn } from "@/lib/utils"

const TIPO_LABEL: Record<TipoActividadGuia, { label: string; icon: any; color: string }> = {
  seleccion_multiple: { label: "Selección múltiple", icon: ListChecks, color: "bg-blue-100 text-blue-700 border-blue-300" },
  verdadero_falso: { label: "Verdadero / Falso", icon: ToggleLeft, color: "bg-green-100 text-green-700 border-green-300" },
  completar: { label: "Completar", icon: PenLine, color: "bg-pink-100 text-pink-700 border-pink-300" },
  respuesta_corta: { label: "Respuesta corta", icon: AlignLeft, color: "bg-cyan-100 text-cyan-700 border-cyan-300" },
  ordenar: { label: "Ordenar", icon: Hash, color: "bg-amber-100 text-amber-700 border-amber-300" },
  pareados: { label: "Pareados", icon: ArrowDownUp, color: "bg-purple-100 text-purple-700 border-purple-300" },
  encerrar: { label: "Encerrar", icon: CircleDot, color: "bg-rose-100 text-rose-700 border-rose-300" },
  marcar: { label: "Marcar", icon: Square, color: "bg-orange-100 text-orange-700 border-orange-300" },
  colorear: { label: "Colorear", icon: Palette, color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  dibujar: { label: "Dibujar", icon: PenTool, color: "bg-teal-100 text-teal-700 border-teal-300" },
  investigar: { label: "Investigar", icon: Search, color: "bg-indigo-100 text-indigo-700 border-indigo-300" },
  sopa_letras: { label: "Sopa de letras", icon: Grid3x3, color: "bg-lime-100 text-lime-700 border-lime-300" },
  abierta: { label: "Abierta", icon: FileQuestion, color: "bg-slate-100 text-slate-700 border-slate-300" },
}

interface Props {
  actividad: ActividadGuia
  numero: number
  oasDisponibles: OAEditado[]
  tipoDoc: "guias"
  docId: string
  onChange: (actividad: ActividadGuia) => void
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

export function ActividadGuiaEditor({
  actividad, numero, oasDisponibles, tipoDoc, docId,
  onChange, onDelete, onMoveUp, onMoveDown, isFirst, isLast,
  onDragStart, onDragOver, onDrop, onSaveToBank,
}: Props) {
  const cfg = TIPO_LABEL[actividad.tipo]
  const Icon = cfg.icon

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="rounded-[12px] border border-border bg-card p-4 shadow-sm"
    >
      <div className="mb-3 flex items-start gap-3">
        <div className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground/40 hover:text-muted-foreground">
          <GripVertical className="h-4 w-4" />
        </div>
        <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-violet-100 text-[12px] font-bold text-violet-700">
          {numero}
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold", cfg.color)}>
              <Icon className="h-3 w-3" />
              {cfg.label}
            </span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={actividad.puntaje || 0}
              onChange={e => onChange({ ...actividad, puntaje: Number(e.target.value) || 0 })}
              className="h-7 w-20 rounded border border-border bg-background px-2 text-[12px] font-semibold"
              title="Puntaje (opcional)"
            />
            <span className="text-[10.5px] text-muted-foreground">pts</span>

            {oasDisponibles.length > 0 && (
              <select
                value={actividad.oaVinculado || ""}
                onChange={e => onChange({ ...actividad, oaVinculado: e.target.value || undefined })}
                className="h-7 rounded border border-border bg-background px-2 text-[11px]"
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
            <button type="button" onClick={onMoveUp} disabled={isFirst}
              className="h-7 w-7 rounded border border-border bg-background hover:bg-muted/40 disabled:opacity-40">
              ↑
            </button>
          )}
          {onMoveDown && (
            <button type="button" onClick={onMoveDown} disabled={isLast}
              className="h-7 w-7 rounded border border-border bg-background hover:bg-muted/40 disabled:opacity-40">
              ↓
            </button>
          )}
          <button type="button" onClick={onDelete}
            className="h-7 w-7 rounded border border-red-200 bg-red-50 text-red-600 hover:bg-red-100">
            <Trash2 className="mx-auto h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <textarea
        value={actividad.enunciado}
        onChange={e => onChange({ ...actividad, enunciado: e.target.value })}
        rows={2}
        placeholder="Enunciado de la actividad…"
        className="mb-3 w-full resize-y rounded border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
      />

      <details className="mb-3 rounded border border-border bg-background/40">
        <summary className="cursor-pointer select-none px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted/30">
          + Imagen / texto adicional
        </summary>
        <div className="border-t border-border p-2">
          <BloquesEditor
            bloques={actividad.recursos || []}
            onChange={recursos => onChange({ ...actividad, recursos })}
            tipoDoc={tipoDoc}
            docId={docId}
            empty="Agrega imagen o texto adicional"
            compact
          />
        </div>
      </details>

      {/* Editor específico por tipo */}
      <ActividadDataEditor
        actividad={actividad}
        onChange={onChange}
      />
    </div>
  )
}

function ActividadDataEditor({
  actividad, onChange,
}: {
  actividad: ActividadGuia
  onChange: (a: ActividadGuia) => void
}) {
  const updateData = (datos: ActividadGuia["datos"]) => onChange({ ...actividad, datos })

  if (!actividad.datos) return null
  const datos = actividad.datos

  switch (datos.tipo) {
    case "seleccion_multiple": {
      const alternativas = datos.alternativas || []
      return (
        <div className="space-y-1.5">
          <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
            Alternativas
          </div>
          {alternativas.map((a, i) => (
            <div key={a.id} className="flex items-center gap-2 rounded border border-border bg-background px-2 py-1.5">
              <button
                type="button"
                onClick={() => updateData({
                  ...datos,
                  alternativas: alternativas.map(x => ({ ...x, correcta: x.id === a.id })),
                })}
              >
                {a.correcta ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
              </button>
              <span className="text-[12px] font-bold text-muted-foreground">
                {String.fromCharCode(97 + i)})
              </span>
              <input
                value={a.texto}
                onChange={e => updateData({
                  ...datos,
                  alternativas: alternativas.map(x => x.id === a.id ? { ...x, texto: e.target.value } : x),
                })}
                placeholder={`Alternativa ${String.fromCharCode(97 + i)}`}
                className="flex-1 bg-transparent px-2 text-[12.5px] outline-none"
              />
              <button
                type="button"
                onClick={() => updateData({
                  ...datos,
                  alternativas: alternativas.filter(x => x.id !== a.id),
                })}
                disabled={alternativas.length <= 2}
                className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-30"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => updateData({
              ...datos,
              alternativas: [...alternativas, { id: nuevoIdGuia("a"), texto: "" }],
            })}
            className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
          >
            <Plus className="h-3 w-3" /> Agregar
          </button>
        </div>
      )
    }
    case "verdadero_falso": {
      const afirmaciones = datos.afirmaciones || []
      return (
        <div className="space-y-1.5">
          <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
            Afirmaciones
          </div>
          {afirmaciones.map((af, i) => (
            <div key={af.id} className="flex items-center gap-2 rounded border border-border bg-background px-2 py-1.5">
              <span className="text-[11px] font-bold text-muted-foreground w-5">{i + 1}.</span>
              <input
                value={af.texto}
                onChange={e => updateData({
                  ...datos,
                  afirmaciones: afirmaciones.map(x => x.id === af.id ? { ...x, texto: e.target.value } : x),
                })}
                placeholder="Afirmación"
                className="flex-1 bg-transparent px-2 text-[12.5px] outline-none"
              />
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => updateData({
                    ...datos,
                    afirmaciones: afirmaciones.map(x => x.id === af.id ? { ...x, correcta: true } : x),
                  })}
                  className={cn("rounded px-2 py-0.5 text-[10.5px] font-bold border",
                    af.correcta ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-border bg-background text-muted-foreground")}
                >V</button>
                <button
                  type="button"
                  onClick={() => updateData({
                    ...datos,
                    afirmaciones: afirmaciones.map(x => x.id === af.id ? { ...x, correcta: false } : x),
                  })}
                  className={cn("rounded px-2 py-0.5 text-[10.5px] font-bold border",
                    !af.correcta ? "border-red-500 bg-red-50 text-red-700" : "border-border bg-background text-muted-foreground")}
                >F</button>
              </div>
              <button
                type="button"
                onClick={() => updateData({
                  ...datos,
                  afirmaciones: afirmaciones.filter(x => x.id !== af.id),
                })}
                disabled={afirmaciones.length <= 1}
                className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-30"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => updateData({
              ...datos,
              afirmaciones: [...afirmaciones, { id: nuevoIdGuia("af"), texto: "", correcta: true }],
            })}
            className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
          >
            <Plus className="h-3 w-3" /> Agregar
          </button>
        </div>
      )
    }
    case "completar": {
      const respuestas = datos.respuestas || []
      const n = (datos.texto.match(/__+/g) || []).length
      return (
        <div className="space-y-2">
          <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
            Texto (usa __ para los espacios)
          </div>
          <textarea
            value={datos.texto}
            onChange={e => {
              const newN = (e.target.value.match(/__+/g) || []).length
              const updatedRespuestas = Array.from({ length: newN }, (_, i) => respuestas[i] || "")
              updateData({ ...datos, texto: e.target.value, respuestas: updatedRespuestas })
            }}
            rows={3}
            placeholder="Para mantener una alimentación saludable debemos consumir __ y __."
            className="w-full resize-y rounded border border-border bg-background px-3 py-2 text-[13px]"
          />
          {n > 0 && (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {respuestas.map((r, i) => (
                <input
                  key={i}
                  value={r}
                  onChange={e => {
                    const next = [...respuestas]
                    next[i] = e.target.value
                    updateData({ ...datos, respuestas: next })
                  }}
                  placeholder={`Respuesta blanco ${i + 1}`}
                  className="rounded border border-border bg-background px-2 py-1 text-[12.5px]"
                />
              ))}
            </div>
          )}
          <input
            value={(datos.banco || []).join(", ")}
            onChange={e => updateData({
              ...datos,
              banco: e.target.value.split(",").map(s => s.trim()).filter(Boolean),
            })}
            placeholder="Banco de palabras (opcional, separadas por coma)"
            className="w-full rounded border border-border bg-background px-2 py-1 text-[12px]"
          />
        </div>
      )
    }
    case "respuesta_corta":
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
              Líneas:
            </span>
            <input
              type="number"
              min={1}
              max={20}
              value={datos.lineas}
              onChange={e => updateData({ ...datos, lineas: Math.max(1, Number(e.target.value) || 1) })}
              className="h-7 w-20 rounded border border-border bg-background px-2 text-[12px]"
            />
          </div>
          <textarea
            value={datos.respuestaSugerida || ""}
            onChange={e => updateData({ ...datos, respuestaSugerida: e.target.value })}
            placeholder="Respuesta sugerida (opcional)"
            rows={2}
            className="w-full resize-y rounded border border-border bg-background px-3 py-2 text-[12.5px]"
          />
        </div>
      )

    case "ordenar": {
      const pasos = datos.pasos || []
      return (
        <div className="space-y-2">
          <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
            Pasos en orden correcto
          </div>
          {pasos.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2 rounded border border-border bg-background px-2 py-1">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-700">
                {p.numeroCorrecto}
              </span>
              <input
                value={p.texto}
                onChange={e => updateData({
                  ...datos,
                  pasos: pasos.map(x => x.id === p.id ? { ...x, texto: e.target.value } : x),
                })}
                placeholder={`Paso ${p.numeroCorrecto}`}
                className="flex-1 bg-transparent px-2 text-[12.5px] outline-none"
              />
              <button
                type="button"
                onClick={() => updateData({
                  ...datos,
                  pasos: pasos.filter(x => x.id !== p.id).map((x, idx) => ({ ...x, numeroCorrecto: idx + 1 })),
                })}
                disabled={pasos.length <= 2}
                className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-30"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => updateData({
              ...datos,
              pasos: [...pasos, { id: nuevoIdGuia("p"), texto: "", numeroCorrecto: pasos.length + 1 }],
            })}
            className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
          >
            <Plus className="h-3 w-3" /> Agregar paso
          </button>
        </div>
      )
    }
    case "pareados": {
      const columnaA = datos.columnaA || []
      const columnaB = datos.columnaB || []
      return (
        <div className="space-y-2">
          <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
            Columnas pareadas
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <div className="mb-1 text-[11px] font-bold text-muted-foreground">Columna A</div>
              {columnaA.map((a, i) => (
                <input
                  key={a.id}
                  value={a.texto}
                  onChange={e => updateData({
                    ...datos,
                    columnaA: columnaA.map(x => x.id === a.id ? { ...x, texto: e.target.value } : x),
                  })}
                  placeholder={`A${i + 1}`}
                  className="mb-1.5 w-full rounded border border-border bg-background px-2 py-1 text-[12.5px]"
                />
              ))}
            </div>
            <div>
              <div className="mb-1 text-[11px] font-bold text-muted-foreground">Columna B</div>
              {columnaB.map((b, i) => (
                <div key={b.id} className="mb-1.5 flex gap-1">
                  <input
                    value={b.texto}
                    onChange={e => updateData({
                      ...datos,
                      columnaB: columnaB.map(x => x.id === b.id ? { ...x, texto: e.target.value } : x),
                    })}
                    placeholder={`B${i + 1}`}
                    className="flex-1 rounded border border-border bg-background px-2 py-1 text-[12.5px]"
                  />
                  <select
                    value={b.pareCon}
                    onChange={e => updateData({
                      ...datos,
                      columnaB: columnaB.map(x => x.id === b.id ? { ...x, pareCon: e.target.value } : x),
                    })}
                    className="rounded border border-border bg-background px-1 text-[10.5px]"
                  >
                    <option value="">—</option>
                    {columnaA.map((a, j) => <option key={a.id} value={a.id}>= {j + 1}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const aId = nuevoIdGuia("a")
              updateData({
                ...datos,
                columnaA: [...columnaA, { id: aId, texto: "" }],
                columnaB: [...columnaB, { id: nuevoIdGuia("b"), texto: "", pareCon: aId }],
              })
            }}
            className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
          >
            <Plus className="h-3 w-3" /> Agregar par
          </button>
        </div>
      )
    }
    case "encerrar":
    case "marcar": {
      const opciones = datos.opciones || []
      return (
        <div className="space-y-1.5">
          <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
            Opciones (marca las correctas)
          </div>
          {opciones.map((o, i) => (
            <div key={o.id} className="flex items-center gap-2 rounded border border-border bg-background px-2 py-1.5">
              <button
                type="button"
                onClick={() => updateData({
                  ...datos,
                  opciones: opciones.map(x => x.id === o.id ? { ...x, correcta: !x.correcta } : x),
                })}
              >
                {o.correcta ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
              </button>
              <input
                value={o.texto}
                onChange={e => updateData({
                  ...datos,
                  opciones: opciones.map(x => x.id === o.id ? { ...x, texto: e.target.value } : x),
                })}
                placeholder={`Opción ${i + 1}`}
                className="flex-1 bg-transparent px-2 text-[12.5px] outline-none"
              />
              <button
                type="button"
                onClick={() => updateData({
                  ...datos,
                  opciones: opciones.filter(x => x.id !== o.id),
                })}
                disabled={opciones.length <= 2}
                className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-30"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => updateData({
              ...datos,
              opciones: [...opciones, { id: nuevoIdGuia("o"), texto: "" }],
            })}
            className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
          >
            <Plus className="h-3 w-3" /> Agregar
          </button>
        </div>
      )
    }
    case "colorear":
      return (
        <div className="space-y-2">
          <textarea
            value={datos.instruccion}
            onChange={e => updateData({ ...datos, instruccion: e.target.value })}
            placeholder="Instrucción (ej: 'Colorea los alimentos saludables')"
            rows={2}
            className="w-full resize-y rounded border border-border bg-background px-3 py-2 text-[12.5px]"
          />
          <div className="text-[11px] text-muted-foreground">
            Sube la imagen a colorear arriba en &quot;Imagen / texto adicional&quot;.
          </div>
        </div>
      )

    case "dibujar":
      return (
        <div className="space-y-2">
          <textarea
            value={datos.instruccion}
            onChange={e => updateData({ ...datos, instruccion: e.target.value })}
            placeholder="Instrucción del dibujo"
            rows={2}
            className="w-full resize-y rounded border border-border bg-background px-3 py-2 text-[12.5px]"
          />
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
              Altura (cm):
            </span>
            <input
              type="number"
              min={3}
              max={20}
              value={datos.alturaCm || 8}
              onChange={e => updateData({ ...datos, alturaCm: Math.max(3, Number(e.target.value) || 8) })}
              className="h-7 w-20 rounded border border-border bg-background px-2 text-[12px]"
            />
          </div>
        </div>
      )

    case "investigar":
      return (
        <div className="space-y-2">
          <textarea
            value={datos.instruccion}
            onChange={e => updateData({ ...datos, instruccion: e.target.value })}
            placeholder="Instrucción de investigación"
            rows={2}
            className="w-full resize-y rounded border border-border bg-background px-3 py-2 text-[12.5px]"
          />
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
              Líneas:
            </span>
            <input
              type="number"
              min={1}
              max={20}
              value={datos.lineasRespuesta || 4}
              onChange={e => updateData({ ...datos, lineasRespuesta: Math.max(1, Number(e.target.value) || 1) })}
              className="h-7 w-20 rounded border border-border bg-background px-2 text-[12px]"
            />
          </div>
        </div>
      )

    case "sopa_letras": {
      const palabras = datos.palabras || []
      return (
        <div className="space-y-2">
          <div>
            <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
              Palabras a buscar (separadas por coma)
            </label>
            <input
              value={palabras.join(", ")}
              onChange={e => updateData({
                ...datos,
                palabras: e.target.value.split(",").map(s => s.trim().toUpperCase()).filter(Boolean),
              })}
              placeholder="MANZANA, PERA, PLATANO"
              className="w-full rounded border border-border bg-background px-2 py-1 text-[12.5px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
              Tamaño cuadro:
            </span>
            <input
              type="number"
              min={6}
              max={20}
              value={datos.tamañoCuadro || 12}
              onChange={e => updateData({ ...datos, tamañoCuadro: Math.max(6, Number(e.target.value) || 12) })}
              className="h-7 w-20 rounded border border-border bg-background px-2 text-[12px]"
            />
          </div>
        </div>
      )
    }
    case "abierta":
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
              Líneas para responder:
            </span>
            <input
              type="number"
              min={1}
              max={30}
              value={datos.lineasRespuesta || 4}
              onChange={e => updateData({ ...datos, lineasRespuesta: Math.max(1, Number(e.target.value) || 1) })}
              className="h-7 w-20 rounded border border-border bg-background px-2 text-[12px]"
            />
          </div>
        </div>
      )
  }
}
