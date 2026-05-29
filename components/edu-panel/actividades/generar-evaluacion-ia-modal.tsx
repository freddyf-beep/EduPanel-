"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, ClipboardList, LayoutList, Loader2, Sparkles, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api-client"
import { toast } from "@/hooks/use-toast"
import { buildUrl, withAsignatura } from "@/lib/shared"
import type { ActividadClase, ClaseCronograma, OAEditado } from "@/lib/curriculo"
import type { StoredAiConfig } from "@/lib/ai/copilot"
import { guardarRubrica, buildRubricaId, type RubricaTemplate } from "@/lib/rubricas"
import { guardarGuia, buildGuiaId, type GuiaTemplate } from "@/lib/guias"

interface GenerarEvaluacionIaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  asignatura: string
  curso: string
  unidadId: string
  unidadNombre?: string
  unidadProposito?: string
  nivelCurricular?: string
  numeroClase: number
  totalClases?: number
  claseCronograma?: ClaseCronograma
  actividad: Partial<ActividadClase>
  oas: OAEditado[]
  contextoDocente?: string
  objetivoDocente?: string
  aiConfig: StoredAiConfig
}

export function GenerarEvaluacionIaModal({
  open,
  onOpenChange,
  asignatura,
  curso,
  unidadId,
  unidadNombre,
  unidadProposito,
  nivelCurricular,
  numeroClase,
  totalClases,
  claseCronograma,
  actividad,
  oas,
  contextoDocente,
  objetivoDocente,
  aiConfig,
}: GenerarEvaluacionIaModalProps) {
  const router = useRouter()
  const [tipoSeleccionado, setTipoSeleccionado] = useState<"rubrica" | "guia">("rubrica")
  const [instrucciones, setInstrucciones] = useState("")
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState("")

  if (!open) return null

  const handleGenerar = async () => {
    setGenerando(true)
    setError("")

    try {
      const selectedOas = oas.filter(oa => {
        const classOaIds = new Set([
          ...(actividad.oaIds || []),
          ...(claseCronograma?.oaIds || []),
        ].filter(Boolean))
        return classOaIds.size > 0 ? classOaIds.has(oa.id) : oa.seleccionado
      })

      // Preparar payload para la llamada a la API
      const body = {
        modo: tipoSeleccionado === "rubrica" ? "rubrica_generar" : "guia_generar",
        tipoDoc: tipoSeleccionado === "rubrica" ? "rubrica" : "guia",
        contexto: {
          asignatura,
          curso,
          nivelCurricular,
          unidadId,
          unidadNombre,
          oas: selectedOas,
          habilidades: actividad.habilidades || [],
          conocimientos: [],
          actitudes: actividad.actitudes || [],
          contextoDocente,
          objetivoDocente,
          actividadClaseVinculada: {
            numeroClase,
            fecha: claseCronograma?.fecha || actividad.fecha,
            objetivo: actividad.objetivo,
            inicio: actividad.inicio,
            desarrollo: actividad.desarrollo,
            cierre: actividad.cierre,
            materiales: actividad.materiales,
          },
        },
        instrucciones: instrucciones.trim(),
        modelProvider: aiConfig.provider,
        customToken: aiConfig.token,
        customModel: aiConfig.model,
        customEndpoint: aiConfig.endpoint,
        customPrompt: aiConfig.promptExtra,
      }

      const res = await apiFetch("/api/generar-evaluacion", {
        method: "POST",
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        throw new Error(await res.text() || "Error al conectar con el asistente IA.")
      }

      const data = await res.json()

      if (data.error === "json_parse_failed") {
        throw new Error("El modelo de IA devolvió un formato inválido. Por favor intenta de nuevo.")
      }

      if (tipoSeleccionado === "rubrica") {
        // Mapear los datos de la rúbrica generada a nuestro esquema Firestore
        const rubricaId = buildRubricaId(asignatura, curso, data.nombre || "IA")
        const rubrica: RubricaTemplate = {
          id: rubricaId,
          nombre: data.nombre || `Rúbrica - Clase ${numeroClase}`,
          asignatura,
          curso,
          unidadId,
          unidadNombre,
          metadatosCurriculares: {
            objetivos: selectedOas.map(oa => `OA ${oa.numero || oa.id}: ${oa.descripcion || ""}`),
            indicadores: selectedOas.flatMap(oa =>
              (oa.indicadores || []).filter(ind => ind.seleccionado).map(ind => ind.texto)
            ),
            objetivosTransversales: [],
          },
          gruposConfig: [
            { id: "grupo_1", nombre: "Grupo 1", orden: 1 }
          ],
          partes: (data.partes || []).map((p: any, idx: number) => ({
            id: `parte_${Date.now()}_${idx + 1}`,
            orden: idx + 1,
            nombre: p.nombre || `Parte ${idx + 1}`,
            oasVinculados: p.oasVinculados || [],
            criterios: (p.criterios || []).map((crit: any, cidx: number) => ({
              id: `crit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              orden: cidx + 1,
              nombre: crit.nombre || `Criterio ${cidx + 1}`,
              niveles: {
                logrado: {
                  descripcion: crit.niveles?.logrado?.descripcion || "Desempeño logrado",
                  puntos: 4,
                },
                casiLogrado: {
                  descripcion: crit.niveles?.casiLogrado?.descripcion || "Desempeño casi logrado",
                  puntos: 3,
                },
                parcialmenteLogrado: {
                  descripcion: crit.niveles?.parcialmenteLogrado?.descripcion || "Desempeño parcialmente logrado",
                  puntos: 2,
                },
                porLograr: {
                  descripcion: crit.niveles?.porLograr?.descripcion || "Desempeño por lograr",
                  puntos: 1,
                },
              },
            })),
          })),
          puntajeMaximo: 0,
        }

        await guardarRubrica(rubrica)

        toast({
          title: "¡Rúbrica generada con éxito!",
          description: "Redirigiendo al editor...",
        })

        // Redirigir al editor de rúbricas
        onOpenChange(false)
        router.push(
          buildUrl(
            "/evaluaciones",
            withAsignatura({ tab: "rubricas", view: "import", rubricaId: rubrica.id }, asignatura)
          )
        )
      } else {
        // Mapear los datos de la guía generada a nuestro esquema Firestore
        const guiaId = buildGuiaId(asignatura, curso)
        const guia: GuiaTemplate = {
          id: guiaId,
          nombre: `Guía Clase ${numeroClase}: ${actividad.objetivo ? (actividad.objetivo.length > 50 ? actividad.objetivo.slice(0, 50) + "..." : actividad.objetivo) : "Ejercitación"}`,
          asignatura,
          curso,
          unidadId,
          unidadNombre,
          tipoGuia: "aprendizaje",
          tiempoMinutos: 45,
          objetivo: actividad.objetivo || "",
          instrucciones: [
            "Lee atentamente el contenido y desarrolla cada actividad.",
            "Responde con letra clara y ordenada.",
            "Si tienes dudas, consulta al profesor.",
          ],
          metadatosCurriculares: {
            objetivos: selectedOas.map(oa => `OA ${oa.numero || oa.id}: ${oa.descripcion || ""}`),
            indicadores: selectedOas.flatMap(oa =>
              (oa.indicadores || []).filter(ind => ind.seleccionado).map(ind => ind.texto)
            ),
            objetivosTransversales: [],
          },
          secciones: (data.seccionesGuia || []).map((sec: any, idx: number) => ({
            id: `sec_${Date.now()}_${idx + 1}`,
            orden: idx + 1,
            titulo: sec.titulo || `Sección ${idx + 1}`,
            descripcion: sec.descripcion || "",
            contenido: sec.contenidoHtml
              ? [{ id: `cont_${Date.now()}_${idx}`, tipo: "html", texto: sec.contenidoHtml }]
              : [],
            actividades: (sec.actividades || []).map((act: any, actIdx: number) => ({
              id: `act_${Date.now()}_${idx}_${actIdx}`,
              tipo: act.tipo || "respuesta_corta",
              numero: actIdx + 1,
              enunciado: act.enunciado || "",
              puntaje: act.puntaje || 1,
              datos: act.datos || { tipo: act.tipo || "respuesta_corta", lineas: 2 },
              oaVinculado: act.oaVinculado || "",
            })),
          })),
          cierre: [],
          puntajeMaximo: 0,
          estado: "borrador",
        }

        await guardarGuia(guia)

        toast({
          title: "¡Guía de aprendizaje generada con éxito!",
          description: "Redirigiendo al editor...",
        })

        // Redirigir al editor de guías
        onOpenChange(false)
        router.push(
          buildUrl(
            "/evaluaciones",
            withAsignatura({ tab: "guias", view: "editor", guiaId: guia.id }, asignatura)
          )
        )
      }
    } catch (err: any) {
      console.error(err)
      setError(err.message || "No pudimos generar la evaluación.")
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 print:hidden animate-fade-in">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[20px] border border-white/10 bg-card/95 shadow-2xl backdrop-blur-md">
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-indigo-500/10 text-indigo-500">
                <Sparkles className="h-5 w-5 animate-pulse" />
              </div>
              <h2 className="text-[17px] font-extrabold bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
                Generar Evaluación con IA
              </h2>
            </div>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Crea instantáneamente un instrumento de evaluación alineado con el objetivo y momentos de tu clase planificada.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={generando}
            className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-muted/60 text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Contenido */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2.5 rounded-[12px] border border-red-500/20 bg-red-500/5 px-4 py-3 text-[12px] text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Opciones de tipo */}
          <div className="space-y-2">
            <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide">
              ¿Qué tipo de instrumento deseas crear?
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Opción Rúbrica */}
              <button
                type="button"
                onClick={() => setTipoSeleccionado("rubrica")}
                disabled={generando}
                className={cn(
                  "relative flex flex-col items-start text-left p-4 rounded-[16px] border transition-all duration-300 disabled:opacity-60",
                  tipoSeleccionado === "rubrica"
                    ? "border-indigo-500 bg-indigo-500/[0.04] ring-2 ring-indigo-500/20 shadow-md"
                    : "border-border hover:border-indigo-500/40 bg-background/50"
                )}
              >
                <div className={cn(
                  "grid h-8 w-8 place-items-center rounded-[8px] mb-3 transition-colors",
                  tipoSeleccionado === "rubrica" ? "bg-indigo-500/10 text-indigo-500" : "bg-muted text-muted-foreground"
                )}>
                  <LayoutList className="h-4 w-4" />
                </div>
                <h3 className="text-[14px] font-bold text-foreground">Rúbrica de Evaluación</h3>
                <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                  Ideal para evaluar desempeños, proyectos o actividades prácticas. Define criterios y 4 niveles de desempeño (Logrado a Por Lograr).
                </p>
              </button>

              {/* Opción Guía */}
              <button
                type="button"
                onClick={() => setTipoSeleccionado("guia")}
                disabled={generando}
                className={cn(
                  "relative flex flex-col items-start text-left p-4 rounded-[16px] border transition-all duration-300 disabled:opacity-60",
                  tipoSeleccionado === "guia"
                    ? "border-purple-500 bg-purple-500/[0.04] ring-2 ring-purple-500/20 shadow-md"
                    : "border-border hover:border-purple-500/40 bg-background/50"
                )}
              >
                <div className={cn(
                  "grid h-8 w-8 place-items-center rounded-[8px] mb-3 transition-colors",
                  tipoSeleccionado === "guia" ? "bg-purple-500/10 text-purple-500" : "bg-muted text-muted-foreground"
                )}>
                  <ClipboardList className="h-4 w-4" />
                </div>
                <h3 className="text-[14px] font-bold text-foreground">Guía de Aprendizaje</h3>
                <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                  Contiene una sección teórica explicativa con ejemplos y actividades prácticas intercaladas (alternativas, completar, desarrollo, etc.).
                </p>
              </button>
            </div>
          </div>

          {/* Instrucciones adicionales */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide">
              Instrucciones adicionales para la IA (Opcional)
            </label>
            <textarea
              value={instrucciones}
              onChange={e => setInstrucciones(e.target.value)}
              disabled={generando}
              placeholder="Ej: Incluye preguntas sobre lectura de notas musicales en flauta dulce. Mantén un vocabulario simple y directo..."
              className="min-h-[100px] w-full resize-none rounded-[12px] border border-border bg-background/80 p-3 text-[12px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
            />
          </div>

          {/* Información del contexto que se enviará */}
          <div className="rounded-[12px] bg-muted/40 border border-border/40 p-3 space-y-1 text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">Contexto utilizado:</span>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
              <div>Clase: <span className="text-foreground font-medium">Clase {numeroClase}</span></div>
              <div>Curso: <span className="text-foreground font-medium">{curso}</span></div>
              <div className="col-span-2 truncate">Asignatura: <span className="text-foreground font-medium">{asignatura}</span></div>
              <div className="col-span-2 truncate">Objetivo de la clase: <span className="text-foreground font-medium italic">"{actividad.objetivo || 'Sin registrar'}"</span></div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-border/60 px-5 py-3 sm:px-6 bg-muted/30">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={generando}
            className="rounded-[10px] border border-border bg-card px-4 py-2 text-[12.5px] font-bold text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGenerar}
            disabled={generando}
            className={cn(
              "flex items-center justify-center gap-2 rounded-[10px] px-5 py-2 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60 shadow-lg",
              tipoSeleccionado === "rubrica"
                ? "bg-gradient-to-r from-indigo-500 to-purple-600 shadow-indigo-500/10"
                : "bg-gradient-to-r from-purple-500 to-pink-600 shadow-purple-500/10"
            )}
          >
            {generando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generando instrumento...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generar instrumento
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
