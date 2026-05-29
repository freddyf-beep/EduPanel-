"use client"

import { ArrowLeft, Music, Printer } from "lucide-react"

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface BloquePartitura {
  tipo: "partitura"
  /** URL o base64 de la imagen de partitura */
  imagenSrc: string
  /** Alt text para accesibilidad */
  alt?: string
}

export interface BloqueLetra {
  tipo: "letra"
  /** Líneas de letra */
  lineas: string[]
}

export interface BloqueSticker {
  tipo: "sticker"
  /** URL o base64 de la imagen sticker */
  imagenSrc: string
  /** Posición del sticker relativa al bloque anterior */
  posicion?: "izquierda" | "derecha" | "centro"
  /** Tamaño en px (ancho) */
  tamano?: number
}

/** Un bloque puede ser partitura, letra o sticker */
export type BloqueFicha = BloquePartitura | BloqueLetra | BloqueSticker

/**
 * Cada sección tiene un nombre opcional y una lista de bloques
 * que pueden ser partituras, letras o stickers en cualquier orden y cantidad.
 */
export interface SeccionFicha {
  nombre?: string
  bloques: BloqueFicha[]
}

export interface FichaLecturaMusicaData {
  cancion: string
  artista: string
  /** Secciones ordenadas, cada una con bloques libres */
  secciones: SeccionFicha[]
}

interface Props {
  ficha: FichaLecturaMusicaData
  onVolver?: () => void
}

// ── Componente ───────────────────────────────────────────────────────────────

export function FichaLecturaMusical({ ficha, onVolver }: Props) {
  const handleImprimir = () => {
    window.print()
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        {onVolver && (
          <button
            onClick={onVolver}
            className="p-2 rounded-[10px] hover:bg-muted/60 transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Music className="w-5 h-5 text-primary flex-shrink-0" />
            <h1 className="text-[18px] sm:text-[20px] font-extrabold text-foreground truncate">
              {ficha.cancion}
            </h1>
          </div>
          <p className="text-[13px] text-muted-foreground">{ficha.artista}</p>
        </div>
        <button
          onClick={handleImprimir}
          title="Imprimir ficha"
          className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border border-border rounded-[10px] hover:bg-muted/60 transition-colors"
        >
          <Printer className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Imprimir</span>
        </button>
      </div>

      {/* Card principal con secciones */}
      <div className="bg-card border border-border rounded-[14px] overflow-hidden">
        <div className="p-4 sm:p-5 space-y-3">
          {ficha.secciones.map((seccion, sIdx) => (
            <div key={sIdx} className="space-y-1.5">
              {/* Nombre de sección opcional */}
              {seccion.nombre && (
                <p className="text-[10px] font-bold uppercase tracking-wide text-primary text-center">
                  {seccion.nombre}
                </p>
              )}

              {/* Bloques */}
              {seccion.bloques.map((bloque, bIdx) => {
                if (bloque.tipo === "partitura") {
                  if (!bloque.imagenSrc) return null
                  return (
                    <div key={bIdx} className="rounded-[8px] border border-border overflow-hidden bg-white">
                      <img
                        src={bloque.imagenSrc}
                        alt={bloque.alt || `Partitura - sección ${sIdx + 1}`}
                        className="w-full h-auto max-h-[100px] object-contain p-1.5"
                      />
                    </div>
                  )
                }

                if (bloque.tipo === "letra") {
                  const tieneContenido = bloque.lineas.some(l => l.trim().length > 0)
                  if (!tieneContenido) return null
                  return (
                    <div key={bIdx} className="pl-3 border-l-2 border-primary/30">
                      {bloque.lineas.map((linea, li) => (
                        <p key={li} className="text-[13px] leading-[1.6] text-foreground">
                          {linea}
                        </p>
                      ))}
                    </div>
                  )
                }

                if (bloque.tipo === "sticker") {
                  if (!bloque.imagenSrc) return null
                  const align = bloque.posicion === "izquierda" ? "mr-auto"
                    : bloque.posicion === "derecha" ? "ml-auto"
                    : "mx-auto"
                  const size = bloque.tamano || 40
                  return (
                    <div key={bIdx} className={`${align} w-fit`}>
                      <img
                        src={bloque.imagenSrc}
                        alt="Sticker"
                        style={{ width: size, height: "auto" }}
                        className="object-contain"
                      />
                    </div>
                  )
                }

                return null
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
