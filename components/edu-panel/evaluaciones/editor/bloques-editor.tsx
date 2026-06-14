"use client"

// ═══════════════════════════════════════════════════════════════════════════
// Editor de bloques de contenido
// ─────────────────────────────────────────────────────────────────────────
// Permite construir secuencias de bloques: texto, imagen, tabla, separador.
// Reutilizable en pruebas (recursos de ítem, estímulo de sección) y en guías
// (contenido didáctico, cierre).
//
// Cada bloque puede subir, bajar o eliminarse. Texto usa contenteditable
// liviano (sin dependencias nuevas — los .docx ya están con react-quill,
// pero aquí un editor simple bold/italic/listas es suficiente).
// ═══════════════════════════════════════════════════════════════════════════

import { useRef, useState, useCallback } from "react"
import {
  Type, Image as ImageIcon, Table as TableIcon, Minus,
  Trash2, ArrowUp, ArrowDown, Bold, Italic, List, ListOrdered,
  Underline, Loader2, Plus, Move, ScrollText, Music,
} from "lucide-react"
import type { BloqueContenido, BloqueImagenData } from "@/lib/evaluaciones-tipos"
import { subirImagenEvaluacion, eliminarImagenEvaluacion } from "@/lib/evaluaciones-storage"
import { cn } from "@/lib/utils"

interface Props {
  bloques: BloqueContenido[]
  onChange: (bloques: BloqueContenido[]) => void
  /** Para almacenar imágenes en la ruta correcta */
  tipoDoc: "pruebas" | "guias"
  docId: string
  /** Texto del placeholder cuando no hay bloques */
  empty?: string
  /** Compacto (sin tabla, sin separador) — útil en ítems individuales */
  compact?: boolean
  /** Habilitar opciones musicales */
  modoMusical?: boolean
}

function nuevoId(prefix = "bl"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

export function BloquesEditor({ bloques, onChange, tipoDoc, docId, empty, compact, modoMusical }: Props) {
  const agregarBloque = (tipo: BloqueContenido["tipo"]) => {
    let nuevo: BloqueContenido
    switch (tipo) {
      case "texto":
        nuevo = { id: nuevoId("txt"), tipo: "texto", data: { html: "", estilo: "normal" } }
        break
      case "imagen":
        nuevo = { id: nuevoId("img"), tipo: "imagen", data: { url: "", ancho: "medium", alineacion: "centro" } }
        break
      case "tabla":
        nuevo = {
          id: nuevoId("tbl"), tipo: "tabla",
          data: { cabeceras: ["Col 1", "Col 2"], filas: [["", ""], ["", ""]] },
        }
        break
      case "separador":
        nuevo = { id: nuevoId("sep"), tipo: "separador", data: { estilo: "linea" } }
        break
    }
    onChange([...bloques, nuevo])
  }

  const actualizar = (id: string, parcial: Partial<BloqueContenido>) => {
    onChange(bloques.map(b => b.id === id ? { ...b, ...parcial } as BloqueContenido : b))
  }

  const mover = (id: string, dir: -1 | 1) => {
    const idx = bloques.findIndex(b => b.id === id)
    if (idx === -1) return
    const next = [...bloques]
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= bloques.length) return
    ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
    onChange(next)
  }

  const eliminar = async (id: string) => {
    const b = bloques.find(x => x.id === id)
    if (b?.tipo === "imagen" && b.data.storagePath) {
      await eliminarImagenEvaluacion(b.data.storagePath).catch(() => {})
    }
    onChange(bloques.filter(b => b.id !== id))
  }

  return (
    <div className="space-y-2">
      {bloques.length === 0 && empty && (
        <div className="rounded-[10px] border border-dashed border-border bg-background/30 px-4 py-6 text-center text-[12px] text-muted-foreground">
          {empty}
        </div>
      )}

      {bloques.map((b, i) => (
        <BloqueRow
          key={b.id}
          bloque={b}
          tipoDoc={tipoDoc}
          docId={docId}
          isFirst={i === 0}
          isLast={i === bloques.length - 1}
          onChange={parcial => actualizar(b.id, parcial)}
          onMoveUp={() => mover(b.id, -1)}
          onMoveDown={() => mover(b.id, 1)}
          onDelete={() => eliminar(b.id)}
          modoMusical={modoMusical}
        />
      ))}

      {/* Toolbar agregar bloque */}
      <div className="flex flex-wrap gap-1.5 rounded-[10px] border border-border bg-card p-2">
        <span className="px-2 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground self-center">
          Agregar:
        </span>
        <BotonAgregar icon={Type} label="Texto" onClick={() => agregarBloque("texto")} />
        <BotonAgregar icon={ImageIcon} label="Imagen" onClick={() => agregarBloque("imagen")} />
        {!compact && (
          <>
            <BotonAgregar icon={TableIcon} label="Tabla" onClick={() => agregarBloque("tabla")} />
            <BotonAgregar icon={Minus} label="Separador" onClick={() => agregarBloque("separador")} />
          </>
        )}
      </div>
    </div>
  )
}

function BotonAgregar({ icon: Icon, label, onClick }: { icon: typeof Type; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-[8px] border border-border bg-background px-2.5 py-1.5 text-[11px] font-semibold text-foreground hover:bg-muted/40 hover:border-primary"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

// ─── Fila de bloque ────────────────────────────────────────────────────────

function BloqueRow({
  bloque, tipoDoc, docId, isFirst, isLast, onChange, onMoveUp, onMoveDown, onDelete, modoMusical,
}: {
  bloque: BloqueContenido
  tipoDoc: "pruebas" | "guias"
  docId: string
  isFirst: boolean
  isLast: boolean
  onChange: (parcial: Partial<BloqueContenido>) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  modoMusical?: boolean
}) {
  return (
    <div className="group relative rounded-[10px] border border-border bg-card p-3 hover:border-primary/40">
      {/* Controles flotantes */}
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          disabled={isFirst}
          onClick={onMoveUp}
          className="h-7 w-7 rounded border border-border bg-background hover:bg-muted/40 disabled:opacity-40"
          title="Subir"
        >
          <ArrowUp className="mx-auto h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={isLast}
          onClick={onMoveDown}
          className="h-7 w-7 rounded border border-border bg-background hover:bg-muted/40 disabled:opacity-40"
          title="Bajar"
        >
          <ArrowDown className="mx-auto h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="h-7 w-7 rounded border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
          title="Eliminar bloque"
        >
          <Trash2 className="mx-auto h-3.5 w-3.5" />
        </button>
      </div>

      {bloque.tipo === "texto" && (
        <BloqueTextoEditor
          data={bloque.data}
          onChange={data => onChange({ data })}
          modoMusical={modoMusical}
        />
      )}
      {bloque.tipo === "imagen" && (
        <BloqueImagenEditor
          data={bloque.data}
          tipoDoc={tipoDoc}
          docId={docId}
          onChange={data => onChange({ data })}
        />
      )}
      {bloque.tipo === "tabla" && (
        <BloqueTablaEditor
          data={bloque.data}
          onChange={data => onChange({ data })}
        />
      )}
      {bloque.tipo === "separador" && (
        <BloqueSeparadorEditor
          data={bloque.data}
          onChange={data => onChange({ data })}
        />
      )}
    </div>
  )
}

// ─── Editor de Texto (rich-text liviano) ───────────────────────────────────

function BloqueTextoEditor({
  data, onChange, modoMusical,
}: {
  data: { html: string; estilo?: "normal" | "destacado" | "instrucciones" | "lectura" }
  onChange: (data: { html: string; estilo?: "normal" | "destacado" | "instrucciones" | "lectura" }) => void
  modoMusical?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  const exec = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value)
    if (ref.current) onChange({ ...data, html: ref.current.innerHTML })
  }

  return (
    <div className="space-y-2 pr-20">
      <div className="flex flex-wrap items-center gap-1 border-b border-border pb-1.5">
        <ToolbarBtn icon={Bold} onClick={() => exec("bold")} label="Negrita" />
        <ToolbarBtn icon={Italic} onClick={() => exec("italic")} label="Cursiva" />
        <ToolbarBtn icon={Underline} onClick={() => exec("underline")} label="Subrayado" />
        <span className="mx-1 h-4 w-px bg-border" />
        <ToolbarBtn icon={List} onClick={() => exec("insertUnorderedList")} label="Viñetas" />
        <ToolbarBtn icon={ListOrdered} onClick={() => exec("insertOrderedList")} label="Numerada" />
        <span className="mx-1 h-4 w-px bg-border" />
        <select
          value={data.estilo || "normal"}
          onChange={e => onChange({ ...data, estilo: e.target.value as any })}
          className="h-7 rounded border border-border bg-background px-2 text-[10.5px] font-semibold"
          title="Estilo del bloque"
        >
          <option value="normal">Normal</option>
          <option value="destacado">Destacado</option>
          <option value="instrucciones">Instrucciones</option>
          <option value="lectura">
            {modoMusical ? "Lírica / Notación musical" : "Lectura comprensiva"}
          </option>
        </select>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={e => onChange({ ...data, html: (e.target as HTMLDivElement).innerHTML })}
        dangerouslySetInnerHTML={{ __html: data.html }}
        className={cn(
          "min-h-[48px] rounded border border-border bg-background px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-primary",
          data.estilo === "destacado" && "bg-yellow-50 dark:bg-yellow-950/30",
          data.estilo === "instrucciones" && "italic text-muted-foreground",
          data.estilo === "lectura" && (modoMusical ? "border-dashed border-violet-400 bg-violet-50/15 font-mono tracking-wide leading-8 shadow-inner" : "border-dashed bg-muted/40 leading-7"),
        )}
        data-placeholder={modoMusical && data.estilo === "lectura" ? "Escribe la letra de la canción o notación (ej. Do - Re - Mi)..." : "Escribe el contenido…"}
      />
      {data.estilo === "lectura" && modoMusical && (
        <div className="absolute right-3 bottom-3 text-violet-400/40 pointer-events-none select-none flex items-center gap-1">
          <Music className="h-3.5 w-3.5 animate-pulse" />
          <span className="text-[9px] font-bold uppercase tracking-wider">Modo Musical</span>
        </div>
      )}
    </div>
  )
}

function ToolbarBtn({ icon: Icon, onClick, label }: { icon: typeof Bold; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      title={label}
      className="h-7 w-7 rounded border border-transparent text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground"
    >
      <Icon className="mx-auto h-3.5 w-3.5" />
    </button>
  )
}

// ─── Editor de Imagen ──────────────────────────────────────────────────────

function BloqueImagenEditor({
  data, tipoDoc, docId, onChange,
}: {
  data: BloqueImagenData
  tipoDoc: "pruebas" | "guias"
  docId: string
  onChange: (data: BloqueImagenData) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [progreso, setProgreso] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback(async (file: File) => {
    setSubiendo(true)
    setError(null)
    setProgreso(0)
    try {
      const subida = await subirImagenEvaluacion(tipoDoc, docId, file, pct => setProgreso(pct))
      // Eliminar imagen anterior si existía
      if (data.storagePath && data.storagePath !== subida.storagePath) {
        eliminarImagenEvaluacion(data.storagePath).catch(() => {})
      }
      onChange({ ...data, url: subida.url, storagePath: subida.storagePath, alt: data.alt || file.name.replace(/\.[^.]+$/, "") })
    } catch (e: any) {
      setError(e?.message || "Error al subir imagen")
    } finally {
      setSubiendo(false)
    }
  }, [data, docId, onChange, tipoDoc])

  return (
    <div className="space-y-2 pr-20">
      <div className="flex items-start gap-3">
        {data.url ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- Editor previews arbitrary user-provided image URLs. */}
            <img
              src={data.url}
              alt={data.alt || ""}
              className="max-h-32 rounded border border-border object-contain bg-background"
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={subiendo}
              className="absolute -bottom-2 -right-2 rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold text-primary-foreground shadow"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={subiendo}
            className="flex h-32 w-44 flex-col items-center justify-center gap-1 rounded border-2 border-dashed border-border bg-background text-[11px] text-muted-foreground hover:border-primary hover:text-primary"
          >
            {subiendo ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{progreso}%</span>
              </>
            ) : (
              <>
                <ImageIcon className="h-5 w-5" />
                <span>Subir imagen</span>
                <span className="text-[9px]">JPG, PNG, WEBP — máx 8 MB</span>
              </>
            )}
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
            e.target.value = ""
          }}
        />

        <div className="flex-1 space-y-1.5">
          <input
            type="text"
            value={data.alt || ""}
            onChange={e => onChange({ ...data, alt: e.target.value })}
            placeholder="Texto alternativo (descripción para accesibilidad)"
            className="h-7 w-full rounded border border-border bg-background px-2 text-[12px]"
          />
          <input
            type="text"
            value={data.caption || ""}
            onChange={e => onChange({ ...data, caption: e.target.value })}
            placeholder="Pie de imagen (opcional)"
            className="h-7 w-full rounded border border-border bg-background px-2 text-[12px]"
          />
          <div className="flex gap-1">
            <select
              value={data.ancho || "medium"}
              onChange={e => onChange({ ...data, ancho: e.target.value as any })}
              className="h-7 flex-1 rounded border border-border bg-background px-2 text-[11px] font-semibold"
            >
              <option value="small">Pequeño (30%)</option>
              <option value="medium">Mediano (60%)</option>
              <option value="large">Grande (100%)</option>
            </select>
            <select
              value={data.alineacion || "centro"}
              onChange={e => onChange({ ...data, alineacion: e.target.value as any })}
              className="h-7 flex-1 rounded border border-border bg-background px-2 text-[11px] font-semibold"
            >
              <option value="izq">Izquierda</option>
              <option value="centro">Centrado</option>
              <option value="der">Derecha</option>
            </select>
          </div>
          {subiendo && (
            <div className="h-1 w-full overflow-hidden rounded bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${progreso}%` }} />
            </div>
          )}
          {error && (
            <div className="rounded bg-red-50 px-2 py-1 text-[10.5px] text-red-700">{error}</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Editor de Tabla ───────────────────────────────────────────────────────

function BloqueTablaEditor({
  data, onChange,
}: {
  data: { cabeceras: string[]; filas: string[][]; primeraColumnaCabecera?: boolean }
  onChange: (data: { cabeceras: string[]; filas: string[][]; primeraColumnaCabecera?: boolean }) => void
}) {
  const updateCabecera = (idx: number, valor: string) => {
    const nuevas = [...data.cabeceras]
    nuevas[idx] = valor
    onChange({ ...data, cabeceras: nuevas })
  }

  const updateCelda = (filaIdx: number, colIdx: number, valor: string) => {
    const filas = data.filas.map(f => [...f])
    filas[filaIdx][colIdx] = valor
    onChange({ ...data, filas })
  }

  const agregarColumna = () => {
    const cabeceras = [...data.cabeceras, `Col ${data.cabeceras.length + 1}`]
    const filas = data.filas.map(f => [...f, ""])
    onChange({ ...data, cabeceras, filas })
  }

  const eliminarColumna = (idx: number) => {
    if (data.cabeceras.length <= 1) return
    const cabeceras = data.cabeceras.filter((_, i) => i !== idx)
    const filas = data.filas.map(f => f.filter((_, i) => i !== idx))
    onChange({ ...data, cabeceras, filas })
  }

  const agregarFila = () => {
    const filas = [...data.filas, data.cabeceras.map(() => "")]
    onChange({ ...data, filas })
  }

  const eliminarFila = (idx: number) => {
    const filas = data.filas.filter((_, i) => i !== idx)
    onChange({ ...data, filas })
  }

  return (
    <div className="space-y-2 pr-20">
      <div className="flex items-center gap-2">
        <TableIcon className="h-4 w-4 text-muted-foreground" />
        <span className="text-[11px] font-bold text-muted-foreground">Tabla</span>
        <label className="ml-auto flex items-center gap-1.5 text-[10.5px]">
          <input
            type="checkbox"
            checked={data.primeraColumnaCabecera || false}
            onChange={e => onChange({ ...data, primeraColumnaCabecera: e.target.checked })}
          />
          Primera columna como cabecera
        </label>
      </div>

      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full text-[11.5px]">
          <thead>
            <tr className="bg-muted/40">
              {data.cabeceras.map((c, i) => (
                <th key={i} className="border border-border p-1 align-top">
                  <div className="flex gap-1">
                    <input
                      value={c}
                      onChange={e => updateCabecera(i, e.target.value)}
                      className="w-full bg-transparent px-1 font-semibold outline-none"
                      placeholder="Cabecera"
                    />
                    <button
                      type="button"
                      onClick={() => eliminarColumna(i)}
                      className="rounded text-red-600 hover:bg-red-50 disabled:opacity-30"
                      disabled={data.cabeceras.length <= 1}
                      title="Eliminar columna"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </th>
              ))}
              <th className="border border-border p-1 w-9">
                <button
                  type="button"
                  onClick={agregarColumna}
                  className="rounded text-primary hover:bg-pink-light"
                  title="Agregar columna"
                >
                  <Plus className="mx-auto h-3.5 w-3.5" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.filas.map((fila, fi) => (
              <tr key={fi}>
                {fila.map((celda, ci) => (
                  <td key={ci} className="border border-border p-1">
                    <input
                      value={celda}
                      onChange={e => updateCelda(fi, ci, e.target.value)}
                      className="w-full bg-transparent px-1 outline-none"
                    />
                  </td>
                ))}
                <td className="border border-border p-1 text-center">
                  <button
                    type="button"
                    onClick={() => eliminarFila(fi)}
                    className="rounded text-red-600 hover:bg-red-50"
                    title="Eliminar fila"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={data.cabeceras.length + 1} className="border border-border p-1 text-center">
                <button
                  type="button"
                  onClick={agregarFila}
                  className="text-[10.5px] font-semibold text-primary hover:underline"
                >
                  + Agregar fila
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Editor de Separador ───────────────────────────────────────────────────

function BloqueSeparadorEditor({
  data, onChange,
}: {
  data: { estilo?: "linea" | "espacio" | "saltoPagina" }
  onChange: (data: { estilo?: "linea" | "espacio" | "saltoPagina" }) => void
}) {
  return (
    <div className="flex items-center gap-3 pr-20">
      <Minus className="h-4 w-4 text-muted-foreground" />
      <span className="text-[11px] font-bold text-muted-foreground">Separador</span>
      <select
        value={data.estilo || "linea"}
        onChange={e => onChange({ estilo: e.target.value as any })}
        className="h-7 rounded border border-border bg-background px-2 text-[11px] font-semibold"
      >
        <option value="linea">Línea horizontal</option>
        <option value="espacio">Espacio en blanco</option>
        <option value="saltoPagina">Salto de página</option>
      </select>
    </div>
  )
}
