"use client"

import { useEffect, useState, useMemo } from "react"
import { X, ChevronLeft, ChevronRight, Monitor, AlertCircle } from "lucide-react"
import type { PruebaTemplate, ItemPrueba } from "@/lib/pruebas"
import { cn } from "@/lib/utils"

interface ProjectionModeProps {
  prueba: PruebaTemplate
  onClose: () => void
}

interface FlattenedItem {
  item: ItemPrueba
  sectionTitle: string
  sectionOrden: number
  indexInTest: number
}

function romano(n: number): string {
  const map: Record<string, number> = { M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1 }
  let num = n
  let result = ""
  for (const key in map) {
    while (num >= map[key]) {
      result += key
      num -= map[key]
    }
  }
  return result
}

export function ProjectionMode({ prueba, onClose }: ProjectionModeProps) {
  const [currentIndex, setCurrentIndex] = useState(0)

  // Aplanar todos los ítems de todas las secciones
  const flattenedItems = useMemo(() => {
    const list: FlattenedItem[] = []
    let globalIndex = 1
    if (!prueba.secciones) return list

    prueba.secciones.forEach((seccion) => {
      if (!seccion.items) return
      seccion.items.forEach((item) => {
        list.push({
          item,
          sectionTitle: seccion.titulo || `Sección ${romano(seccion.orden)}`,
          sectionOrden: seccion.orden,
          indexInTest: globalIndex++,
        })
      })
    })
    return list
  }, [prueba])

  const totalItems = flattenedItems.length
  const activeItem = flattenedItems[currentIndex]

  // Navegación con teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      } else if (e.key === "ArrowRight") {
        if (currentIndex < totalItems - 1) {
          setCurrentIndex(prev => prev + 1)
        }
      } else if (e.key === "ArrowLeft") {
        if (currentIndex > 0) {
          setCurrentIndex(prev => prev - 1)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [currentIndex, totalItems, onClose])

  if (totalItems === 0) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background p-6">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-lg font-semibold text-foreground mb-6">Esta prueba no contiene preguntas para proyectar.</p>
        <button
          onClick={onClose}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/95"
        >
          <X className="h-4 w-4" /> Volver
        </button>
      </div>
    )
  }

  const { item, sectionTitle, indexInTest } = activeItem

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border bg-card/50 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-rose-500/10 p-2 text-rose-500">
            <Monitor className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold truncate max-w-xs md:max-w-md">{prueba.nombre}</h1>
            <p className="text-xs text-muted-foreground">
              {prueba.curso} · {prueba.asignatura}
            </p>
          </div>
        </div>

        {/* Progreso */}
        <div className="flex flex-col items-center gap-1.5 flex-1 max-w-md px-8">
          <span className="text-[12px] font-bold text-muted-foreground">
            Pregunta {indexInTest} de {totalItems}
          </span>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-rose-500 transition-all duration-300"
              style={{ width: `${(indexInTest / totalItems) * 100}%` }}
            />
          </div>
        </div>

        <button
          onClick={onClose}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-bold hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" /> Salir <span className="text-[10px] opacity-60">[Esc]</span>
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-6 py-12 md:px-16 flex flex-col justify-center max-w-4xl mx-auto w-full">
        {/* Breadcrumb del item */}
        <span className="text-xs font-bold uppercase tracking-wider text-rose-500 mb-3">
          {sectionTitle}
        </span>

        {/* Enunciado de la pregunta */}
        <h2 className="text-xl md:text-3xl font-extrabold leading-snug mb-8 text-foreground">
          {item.enunciado}
        </h2>

        {/* Recursos del item */}
        {item.recursos && item.recursos.length > 0 && (
          <div className="mb-8 space-y-4 rounded-xl border border-border bg-card/30 p-6">
            {item.recursos.map((rec, idx) => (
              <div key={idx} className="text-base md:text-lg leading-relaxed">
                {rec.tipo === "texto" && (
                  <div
                    className="whitespace-pre-line"
                    dangerouslySetInnerHTML={{ __html: rec.data.html }}
                  />
                )}
                {rec.tipo === "imagen" && rec.data?.url && (
                  <img
                    src={rec.data.url}
                    alt={rec.data.alt || `Recurso ${idx + 1}`}
                    className="max-h-72 mx-auto rounded-lg object-contain shadow-sm border border-border"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Renderizado de alternativas / respuestas */}
        <div className="mt-4">
          {item.tipo === "seleccion_multiple" && (
            <div className="grid gap-4 sm:grid-cols-2">
              {item.alternativas.map((alt, idx) => (
                <div
                  key={alt.id}
                  className="flex items-center gap-4 rounded-xl border border-border bg-card/40 p-4 transition hover:bg-card"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-muted text-[13px] font-bold text-foreground">
                    {String.fromCharCode(65 + idx)}
                  </div>
                  <span className="text-base md:text-lg">{alt.texto}</span>
                </div>
              ))}
            </div>
          )}

          {item.tipo === "verdadero_falso" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center justify-center gap-3 rounded-xl border border-border bg-card/40 p-6 text-lg font-bold">
                Verdadero (V)
              </div>
              <div className="flex items-center justify-center gap-3 rounded-xl border border-border bg-card/40 p-6 text-lg font-bold">
                Falso (F)
              </div>
            </div>
          )}

          {item.tipo === "pareados" && (
            <div className="grid gap-8 md:grid-cols-2">
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Columna A</h4>
                {item.columnaA.map((colA, idx) => (
                  <div key={colA.id} className="flex items-center gap-3 rounded-lg border border-border bg-card/30 p-3 text-sm">
                    <span className="font-bold text-rose-500">{idx + 1}.</span>
                    <span>{colA.texto}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Columna B</h4>
                {item.columnaB.map((colB, idx) => (
                  <div key={colB.id} className="flex items-center gap-3 rounded-lg border border-border bg-card/30 p-3 text-sm">
                    <span className="font-bold text-muted-foreground">{String.fromCharCode(97 + idx)})</span>
                    <span>{colB.texto}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {item.tipo === "ordenar" && (
            <div className="space-y-3 max-w-md mx-auto">
              <span className="text-xs text-muted-foreground block text-center mb-2">Ordena cronológica o lógicamente:</span>
              {item.pasos.map((paso, idx) => (
                <div key={paso.id} className="flex items-center gap-3 rounded-lg border border-border bg-card/30 p-3">
                  <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
                    {idx + 1}
                  </div>
                  <span className="text-sm">{paso.texto}</span>
                </div>
              ))}
            </div>
          )}

          {item.tipo === "completar" && (
            <div className="rounded-xl border border-dashed border-border p-6 bg-card/20">
              <p className="text-lg md:text-xl leading-loose whitespace-pre-wrap select-text">
                {item.textoConBlancos.split("__").map((part, idx, arr) => (
                  <span key={idx}>
                    {part}
                    {idx < arr.length - 1 && (
                      <span className="inline-block border-b-2 border-foreground w-16 mx-1 h-5 align-bottom" />
                    )}
                  </span>
                ))}
              </p>
            </div>
          )}

          {(item.tipo === "respuesta_corta" || item.tipo === "desarrollo") && (
            <div className="space-y-4">
              <div className="rounded-xl border border-dashed border-border p-6 bg-muted/10 min-h-[160px] flex items-center justify-center text-muted-foreground text-sm italic">
                Espacio para responder en hoja de respuestas
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Navigation Footer */}
      <footer className="border-t border-border bg-card/50 px-6 py-4 flex items-center justify-between backdrop-blur-md">
        <button
          onClick={() => setCurrentIndex(prev => prev - 1)}
          disabled={currentIndex === 0}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 font-bold text-foreground transition-all hover:bg-muted disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronLeft className="h-5 w-5" /> Anterior
        </button>

        <span className="text-xs text-muted-foreground font-semibold">
          Usa las flechas <kbd className="rounded border px-1.5 py-0.5 bg-muted text-[10px]">←</kbd> y <kbd className="rounded border px-1.5 py-0.5 bg-muted text-[10px]">→</kbd> para navegar
        </span>

        <button
          onClick={() => setCurrentIndex(prev => prev + 1)}
          disabled={currentIndex === totalItems - 1}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 font-bold text-foreground transition-all hover:bg-muted disabled:opacity-30 disabled:pointer-events-none"
        >
          Siguiente <ChevronRight className="h-5 w-5" />
        </button>
      </footer>
    </div>
  )
}
