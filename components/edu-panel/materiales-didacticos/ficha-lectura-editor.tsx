"use client"

import { useRef } from "react"
import {
  Plus, Trash2, GripVertical, Music, ImageIcon, Type,
  ChevronUp, ChevronDown, ArrowUp, ArrowDown, Sparkles,
} from "lucide-react"
import type { FichaLecturaMusicaData, SeccionFicha, BloqueFicha } from "./ficha-lectura-musical"

interface Props {
  ficha: FichaLecturaMusicaData
  onChange: (ficha: FichaLecturaMusicaData) => void
}

export function FichaLecturaEditor({ ficha, onChange }: Props) {
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())

  const updateMeta = (field: "cancion" | "artista", value: string) => {
    onChange({ ...ficha, [field]: value })
  }

  // ── Secciones ────────────────────────────────────────────────────────────

  const updateSeccion = (idx: number, seccion: SeccionFicha) => {
    const secciones = [...ficha.secciones]
    secciones[idx] = seccion
    onChange({ ...ficha, secciones })
  }

  const agregarSeccion = () => {
    onChange({
      ...ficha,
      secciones: [...ficha.secciones, { nombre: "", bloques: [{ tipo: "partitura", imagenSrc: "", alt: "" }] }],
    })
  }

  const eliminarSeccion = (idx: number) => {
    onChange({ ...ficha, secciones: ficha.secciones.filter((_, i) => i !== idx) })
  }

  const moverSeccion = (idx: number, dir: -1 | 1) => {
    const secciones = [...ficha.secciones]
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= secciones.length) return
    ;[secciones[idx], secciones[newIdx]] = [secciones[newIdx], secciones[idx]]
    onChange({ ...ficha, secciones })
  }

  // ── Bloques ──────────────────────────────────────────────────────────────

  const agregarBloque = (seccionIdx: number, tipo: "partitura" | "letra" | "sticker") => {
    const seccion = { ...ficha.secciones[seccionIdx] }
    const nuevoBloque: BloqueFicha = tipo === "partitura"
      ? { tipo: "partitura", imagenSrc: "", alt: "" }
      : tipo === "sticker"
      ? { tipo: "sticker", imagenSrc: "", posicion: "derecha", tamano: 36 }
      : { tipo: "letra", lineas: [""] }
    seccion.bloques = [...seccion.bloques, nuevoBloque]
    updateSeccion(seccionIdx, seccion)
  }

  const eliminarBloque = (seccionIdx: number, bloqueIdx: number) => {
    const seccion = { ...ficha.secciones[seccionIdx] }
    seccion.bloques = seccion.bloques.filter((_, i) => i !== bloqueIdx)
    updateSeccion(seccionIdx, seccion)
  }

  const moverBloque = (seccionIdx: number, bloqueIdx: number, dir: -1 | 1) => {
    const seccion = { ...ficha.secciones[seccionIdx] }
    const bloques = [...seccion.bloques]
    const newIdx = bloqueIdx + dir
    if (newIdx < 0 || newIdx >= bloques.length) return
    ;[bloques[bloqueIdx], bloques[newIdx]] = [bloques[newIdx], bloques[bloqueIdx]]
    seccion.bloques = bloques
    updateSeccion(seccionIdx, seccion)
  }

  /** Mover un bloque a otra sección (anterior o siguiente) */
  const moverBloqueEntreSeccion = (seccionIdx: number, bloqueIdx: number, dir: -1 | 1) => {
    const targetSeccionIdx = seccionIdx + dir
    if (targetSeccionIdx < 0 || targetSeccionIdx >= ficha.secciones.length) return

    const secciones = [...ficha.secciones]
    const seccionOrigen = { ...secciones[seccionIdx], bloques: [...secciones[seccionIdx].bloques] }
    const seccionDestino = { ...secciones[targetSeccionIdx], bloques: [...secciones[targetSeccionIdx].bloques] }

    // Sacar bloque del origen
    const [bloque] = seccionOrigen.bloques.splice(bloqueIdx, 1)

    // Insertar en destino (al final si va hacia abajo, al inicio si va hacia arriba)
    if (dir === 1) {
      seccionDestino.bloques.unshift(bloque)
    } else {
      seccionDestino.bloques.push(bloque)
    }

    secciones[seccionIdx] = seccionOrigen
    secciones[targetSeccionIdx] = seccionDestino
    onChange({ ...ficha, secciones })
  }
  const updateBloque = (seccionIdx: number, bloqueIdx: number, bloque: BloqueFicha) => {
    const seccion = { ...ficha.secciones[seccionIdx] }
    seccion.bloques = [...seccion.bloques]
    seccion.bloques[bloqueIdx] = bloque
    updateSeccion(seccionIdx, seccion)
  }

  // ── Imagen upload ────────────────────────────────────────────────────────

  const handleImageUpload = (seccionIdx: number, bloqueIdx: number, file: File, tipo: "partitura" | "sticker" = "partitura") => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      if (tipo === "sticker") {
        updateBloque(seccionIdx, bloqueIdx, {
          tipo: "sticker",
          imagenSrc: dataUrl,
          posicion: (ficha.secciones[seccionIdx].bloques[bloqueIdx] as any).posicion || "derecha",
          tamano: (ficha.secciones[seccionIdx].bloques[bloqueIdx] as any).tamano || 36,
        })
      } else {
        updateBloque(seccionIdx, bloqueIdx, { tipo: "partitura", imagenSrc: dataUrl, alt: file.name })
      }
    }
    reader.readAsDataURL(file)
  }

  const inputKey = (sIdx: number, bIdx: number) => `${sIdx}-${bIdx}`

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Metadatos */}
      <div className="bg-card border border-border rounded-[14px] p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Music className="w-4 h-4 text-primary" />
          <h2 className="text-[14px] font-bold text-foreground">Información de la canción</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Nombre de la canción</label>
            <input
              type="text"
              value={ficha.cancion}
              onChange={(e) => updateMeta("cancion", e.target.value)}
              placeholder="Ej: Canción de Navidad"
              className="w-full px-3 py-2 text-[13px] rounded-[10px] border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Artista / Compositor</label>
            <input
              type="text"
              value={ficha.artista}
              onChange={(e) => updateMeta("artista", e.target.value)}
              placeholder="Ej: 31 Minutos"
              className="w-full px-3 py-2 text-[13px] rounded-[10px] border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Secciones */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-bold text-foreground">Secciones</h2>
          <span className="text-[11px] text-muted-foreground">
            {ficha.secciones.length} {ficha.secciones.length === 1 ? "sección" : "secciones"}
          </span>
        </div>

        {ficha.secciones.map((seccion, sIdx) => (
          <div key={sIdx} className="bg-card border border-border rounded-[14px] overflow-hidden">
            {/* Header de sección con reordenar */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/20">
              <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50" />
              <div className="flex flex-col gap-0">
                <button onClick={() => moverSeccion(sIdx, -1)} disabled={sIdx === 0} className="p-0.5 rounded text-muted-foreground/60 hover:text-primary disabled:opacity-30" title="Mover arriba">
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button onClick={() => moverSeccion(sIdx, 1)} disabled={sIdx === ficha.secciones.length - 1} className="p-0.5 rounded text-muted-foreground/60 hover:text-primary disabled:opacity-30" title="Mover abajo">
                  <ArrowDown className="w-3 h-3" />
                </button>
              </div>
              <input
                type="text"
                value={seccion.nombre || ""}
                onChange={(e) => updateSeccion(sIdx, { ...seccion, nombre: e.target.value })}
                placeholder={`Sección ${sIdx + 1} (nombre opcional)`}
                className="flex-1 text-[12px] font-semibold text-muted-foreground bg-transparent border-none outline-none placeholder:text-muted-foreground/50"
              />
              {ficha.secciones.length > 1 && (
                <button onClick={() => eliminarSeccion(sIdx)} className="p-1 rounded-[6px] text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors" title="Eliminar sección">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="p-4 space-y-3">
              {seccion.bloques.map((bloque, bIdx) => (
                <div key={bIdx} className="relative group">
                  {/* Flechas reordenar bloque */}
                  <div className="absolute -left-1 top-1/2 -translate-y-1/2 -translate-x-full opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-0.5 z-10">
                    <button
                      onClick={() => bIdx === 0 && sIdx > 0 ? moverBloqueEntreSeccion(sIdx, bIdx, -1) : moverBloque(sIdx, bIdx, -1)}
                      disabled={bIdx === 0 && sIdx === 0}
                      className={`p-0.5 rounded hover:text-foreground disabled:opacity-30 ${bIdx === 0 && sIdx > 0 ? "text-primary" : "text-muted-foreground/50"}`}
                      title={bIdx === 0 && sIdx > 0 ? "Mover a sección anterior" : "Mover arriba"}
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => bIdx === seccion.bloques.length - 1 && sIdx < ficha.secciones.length - 1 ? moverBloqueEntreSeccion(sIdx, bIdx, 1) : moverBloque(sIdx, bIdx, 1)}
                      disabled={bIdx === seccion.bloques.length - 1 && sIdx === ficha.secciones.length - 1}
                      className={`p-0.5 rounded hover:text-foreground disabled:opacity-30 ${bIdx === seccion.bloques.length - 1 && sIdx < ficha.secciones.length - 1 ? "text-primary" : "text-muted-foreground/50"}`}
                      title={bIdx === seccion.bloques.length - 1 && sIdx < ficha.secciones.length - 1 ? "Mover a sección siguiente" : "Mover abajo"}
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>

                  {/* ── Partitura ── */}
                  {bloque.tipo === "partitura" && (
                    <div className="rounded-[10px] border border-border overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/10 border-b border-border">
                        <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1"><ImageIcon className="w-3 h-3" /> Partitura</span>
                        <button onClick={() => eliminarBloque(sIdx, bIdx)} className="p-0.5 rounded text-muted-foreground/50 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                      </div>
                      {bloque.imagenSrc ? (
                        <div className="relative group/img bg-white">
                          <img src={bloque.imagenSrc} alt={bloque.alt || "Partitura"} className="w-full h-auto max-h-[120px] object-contain p-2" />
                          <button onClick={() => updateBloque(sIdx, bIdx, { ...bloque, imagenSrc: "" })} className="absolute top-2 right-2 p-1.5 rounded-[8px] bg-card/90 border border-border text-muted-foreground hover:text-red-500 opacity-0 group-hover/img:opacity-100 transition-opacity" title="Quitar"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <button onClick={() => fileInputRefs.current.get(inputKey(sIdx, bIdx))?.click()} className="w-full flex flex-col items-center justify-center gap-1.5 py-5 hover:bg-muted/10 transition-colors cursor-pointer">
                          <ImageIcon className="w-5 h-5 text-muted-foreground/40" />
                          <span className="text-[11px] text-muted-foreground">Click para subir partitura</span>
                        </button>
                      )}
                      <input ref={(el) => { if (el) fileInputRefs.current.set(inputKey(sIdx, bIdx), el) }} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageUpload(sIdx, bIdx, file, "partitura"); e.target.value = "" }} />
                    </div>
                  )}

                  {/* ── Letra ── */}
                  {bloque.tipo === "letra" && (
                    <div className="rounded-[10px] border border-border overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/10 border-b border-border">
                        <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1"><Type className="w-3 h-3" /> Letra</span>
                        <button onClick={() => eliminarBloque(sIdx, bIdx)} className="p-0.5 rounded text-muted-foreground/50 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                      </div>
                      <textarea
                        value={bloque.lineas.join("\n")}
                        onChange={(e) => updateBloque(sIdx, bIdx, { tipo: "letra", lineas: e.target.value.split("\n") })}
                        placeholder={"Escribe la letra aquí...\nUna línea por verso"}
                        rows={3}
                        className="w-full px-3 py-2.5 text-[13px] leading-relaxed bg-background resize-y border-0 focus:outline-none focus:ring-0"
                      />
                    </div>
                  )}

                  {/* ── Sticker ── */}
                  {bloque.tipo === "sticker" && (
                    <div className="rounded-[10px] border border-dashed border-primary/30 overflow-hidden bg-[#FFF0F4]/30">
                      <div className="flex items-center justify-between px-3 py-1.5 bg-[#FFF0F4] border-b border-primary/20">
                        <span className="text-[10px] font-medium text-primary flex items-center gap-1"><Sparkles className="w-3 h-3" /> Sticker</span>
                        <button onClick={() => eliminarBloque(sIdx, bIdx)} className="p-0.5 rounded text-muted-foreground/50 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                      </div>
                      <div className="p-3 space-y-2">
                        {bloque.imagenSrc ? (
                          <div className="flex items-center gap-3">
                            <img src={bloque.imagenSrc} alt="Sticker" className="w-10 h-10 object-contain rounded border border-border" />
                            <button onClick={() => updateBloque(sIdx, bIdx, { ...bloque, imagenSrc: "" })} className="text-[10px] text-red-500 hover:underline">Quitar</button>
                          </div>
                        ) : (
                          <button onClick={() => fileInputRefs.current.get(inputKey(sIdx, bIdx))?.click()} className="flex items-center gap-2 px-3 py-2 rounded-[8px] border border-dashed border-primary/40 hover:bg-[#FFF0F4] transition-colors cursor-pointer text-[11px] text-primary">
                            <Sparkles className="w-3.5 h-3.5" /> Subir imagen sticker
                          </button>
                        )}
                        {/* Controles de posición y tamaño */}
                        <div className="flex items-center gap-3">
                          <label className="text-[10px] text-muted-foreground">Posición:</label>
                          <select
                            value={bloque.posicion || "derecha"}
                            onChange={(e) => updateBloque(sIdx, bIdx, { ...bloque, posicion: e.target.value as any })}
                            className="text-[11px] px-2 py-0.5 rounded border border-border bg-background"
                          >
                            <option value="izquierda">Izquierda</option>
                            <option value="centro">Centro</option>
                            <option value="derecha">Derecha</option>
                          </select>
                          <label className="text-[10px] text-muted-foreground">Tamaño:</label>
                          <input
                            type="range"
                            min={20}
                            max={80}
                            value={bloque.tamano || 36}
                            onChange={(e) => updateBloque(sIdx, bIdx, { ...bloque, tamano: Number(e.target.value) })}
                            className="w-16 h-1 accent-primary"
                          />
                          <span className="text-[10px] text-muted-foreground tabular-nums">{bloque.tamano || 36}px</span>
                        </div>
                      </div>
                      <input ref={(el) => { if (el) fileInputRefs.current.set(inputKey(sIdx, bIdx), el) }} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageUpload(sIdx, bIdx, file, "sticker"); e.target.value = "" }} />
                    </div>
                  )}
                </div>
              ))}

              {/* Botones para agregar bloques */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button onClick={() => agregarBloque(sIdx, "partitura")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] border border-dashed border-border hover:border-primary/50 hover:bg-muted/20 transition-colors text-[11px] font-medium text-muted-foreground hover:text-primary">
                  <ImageIcon className="w-3 h-3" /> + Partitura
                </button>
                <button onClick={() => agregarBloque(sIdx, "letra")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] border border-dashed border-border hover:border-primary/50 hover:bg-muted/20 transition-colors text-[11px] font-medium text-muted-foreground hover:text-primary">
                  <Type className="w-3 h-3" /> + Letra
                </button>
                <button onClick={() => agregarBloque(sIdx, "sticker")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] border border-dashed border-primary/30 hover:border-primary/50 hover:bg-[#FFF0F4]/50 transition-colors text-[11px] font-medium text-primary/70 hover:text-primary">
                  <Sparkles className="w-3 h-3" /> + Sticker
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* Botón agregar sección */}
        <button onClick={agregarSeccion} className="w-full flex items-center justify-center gap-2 py-3 rounded-[14px] border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/20 transition-colors text-[12px] font-medium text-muted-foreground hover:text-primary">
          <Plus className="w-4 h-4" /> Agregar sección
        </button>
      </div>
    </div>
  )
}
