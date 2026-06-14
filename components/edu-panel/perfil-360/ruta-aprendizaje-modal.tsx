"use client"

import { useState } from "react"
import { apiFetch } from "@/lib/api-client"
import {
  Sparkles, Loader2, Copy, Check, Printer, FileText,
  Settings2, BookOpen, CheckSquare, Target, HelpCircle, X
} from "lucide-react"

interface RutaAprendizajeModalProps {
  isOpen: boolean
  onClose: () => void
  student: {
    id: string
    nombre: string
    promedio: number | null
    porcentajeAsistencia: number | null
  }
  curso: string
  asignatura: string
  onSaveObservation?: (texto: string) => Promise<void>
}

interface RutaGenerada {
  titulo: string
  explicacionSimple: string
  ejemploResuelto: {
    enunciado: string
    pasoAPaso: string[]
    resultadoFinal: string
  }
  ejerciciosPropuestos: Array<{
    numero: number
    enunciado: string
    pista: string
  }>
  checklistLogros: string[]
  mensajeAliento: string
}

export function RutaAprendizajeModal({
  isOpen,
  onClose,
  student,
  curso,
  asignatura,
  onSaveObservation
}: RutaAprendizajeModalProps) {
  const [oaId, setOaId] = useState("")
  const [dificultades, setDificultades] = useState("")
  const [loading, setLoading] = useState(false)
  const [ruta, setRuta] = useState<RutaGenerada | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleGenerate = async () => {
    if (!oaId.trim()) {
      setError("Por favor especifica el Objetivo de Aprendizaje (OA) a reforzar.")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch("/api/rutas-aprendizaje", {
        method: "POST",
        body: JSON.stringify({
          nombre: student.nombre,
          curso,
          asignatura,
          promedio: student.promedio ? String(student.promedio) : "Sin notas",
          oaId,
          dificultades
        })
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || "Error al generar la ruta de aprendizaje.")
      }

      const data = await res.json()
      setRuta(data)
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Ocurrió un error inesperado al conectar con Gemini.")
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    if (!ruta) return
    const text = `GUÍA DE REFUERZO PERSONALIZADA (DUA + IA)
Estudiante: ${student.nombre} | Curso: ${curso} | Asignatura: ${asignatura}
Refuerzo de: ${oaId}
--------------------------------------------------
TÍTULO: ${ruta.titulo}

1. CONCEPTO CLAVE EXPLICADO FÁCIL:
${ruta.explicacionSimple}

2. EJEMPLO RESUELTO PASO A PASO:
Enunciado: ${ruta.ejemploResuelto.enunciado}
Pasos:
${ruta.ejemploResuelto.pasoAPaso.map((p, i) => `   ${i+1}. ${p}`).join("\n")}
Resultado: ${ruta.ejemploResuelto.resultadoFinal}

3. EJERCICIOS PARA PRACTICAR:
${ruta.ejerciciosPropuestos.map(e => `${e.numero}. ${e.enunciado}\nPista: ${e.pista}`).join("\n\n")}

4. CHECKLIST DE LOGROS (METACOGNICIÓN):
${ruta.checklistLogros.map(c => `[ ] ${c}`).join("\n")}

MENSAJE FINAL: ${ruta.mensajeAliento}`

    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePrint = () => {
    const printWindow = window.open("", "_blank")
    if (!printWindow || !ruta) return

    printWindow.document.write(`
      <html>
        <head>
          <title>Guía de Refuerzo Personalizada - ${student.nombre}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #1e293b; line-height: 1.6; }
            .header { border-bottom: 3px solid #059669; padding-bottom: 20px; margin-bottom: 30px; }
            .header h1 { margin: 0; font-size: 26px; color: #0f172a; }
            .header p { margin: 5px 0 0 0; color: #64748b; font-size: 14px; }
            .meta { display: grid; grid-template-cols: 1fr 1fr; gap: 15px; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 15px; border-radius: 12px; margin-bottom: 30px; font-size: 14px; color: #166534; }
            .section { margin-bottom: 30px; }
            .section-title { font-weight: bold; font-size: 18px; color: #069669; border-left: 4px solid #059669; padding-left: 10px; margin-bottom: 15px; }
            .box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; margin-bottom: 15px; }
            .step { margin-bottom: 10px; }
            .step-num { font-weight: bold; color: #059669; margin-right: 5px; }
            .exercise { margin-bottom: 25px; padding-bottom: 15px; border-bottom: 1px dashed #e2e8f0; }
            .pista { font-style: italic; font-size: 12px; color: #64748b; margin-top: 5px; }
            .check-list { list-style: none; padding-left: 0; }
            .check-item { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
            .check-box { width: 16px; height: 16px; border: 1.5px solid #059669; border-radius: 4px; }
            .footer { margin-top: 50px; text-align: center; font-size: 13px; color: #64748b; font-style: italic; border-top: 1px solid #cbd5e1; padding-top: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${ruta.titulo}</h1>
            <p>Ruta de Refuerzo Personalizada · EduPanel Copilot</p>
          </div>
          <div class="meta">
            <div><strong>Estudiante:</strong> ${student.nombre}</div>
            <div><strong>Curso:</strong> ${curso}</div>
            <div><strong>Asignatura:</strong> ${asignatura}</div>
            <div><strong>Objetivo de Aprendizaje (Refuerzo):</strong> ${oaId}</div>
          </div>

          <div class="section">
            <div class="section-title">1. Concepto Clave Explicado Fácil</div>
            <div class="box">${ruta.explicacionSimple}</div>
          </div>

          <div class="section">
            <div class="section-title">2. Ejemplo Resuelto Paso a Paso</div>
            <div class="box">
              <p style="font-weight: bold; margin-top: 0;">Enunciado del problema:</p>
              <p>${ruta.ejemploResuelto.enunciado}</p>
              <p style="font-weight: bold;">Pasos para resolver:</p>
              ${ruta.ejemploResuelto.pasoAPaso.map((p, i) => `
                <div class="step"><span class="step-num">Paso ${i+1}:</span> ${p}</div>
              `).join("")}
              <p style="font-weight: bold; margin-bottom: 0;">Resultado final: <span style="color: #059669;">${ruta.ejemploResuelto.resultadoFinal}</span></p>
            </div>
          </div>

          <div class="section">
            <div class="section-title">3. Ejercicios Prácticos para Ti</div>
            <div>
              ${ruta.ejerciciosPropuestos.map(e => `
                <div class="exercise">
                  <strong>Ejercicio ${e.numero}:</strong> ${e.enunciado}
                  <div style="height: 100px; border: 1px solid #cbd5e1; border-radius: 6px; margin: 10px 0; background: #fff;"></div>
                  <div class="pista">💡 Pista: ${e.pista}</div>
                </div>
              `).join("")}
            </div>
          </div>

          <div class="section">
            <div class="section-title">4. Autoevaluación (Checklist de logros)</div>
            <ul class="check-list">
              ${ruta.checklistLogros.map(c => `
                <li class="check-item"><div class="check-box"></div> <span>${c}</span></li>
              `).join("")}
            </ul>
          </div>

          <div class="footer">
            "${ruta.mensajeAliento}"
          </div>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.print()
  }

  const handleSaveToObs = async () => {
    if (!ruta || !onSaveObservation) return
    const text = `[Guía de Refuerzo DUA generada con IA]\nTítulo: ${ruta.titulo}\nRefuerzo para: ${oaId}\nEjercicios asignados: ${ruta.ejerciciosPropuestos.length}`
    await onSaveObservation(text)
    alert("Guía guardada con éxito como hito de reforzamiento en la ficha del estudiante.")
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border w-full max-w-4xl rounded-[18px] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-500 animate-pulse" />
            <h2 className="font-extrabold text-lg">Diseñador de Rutas de Refuerzo Personalizadas (IA)</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {!ruta && !loading && (
            <div className="space-y-6">
              <div className="bg-muted/40 p-4 rounded-xl space-y-2 border border-border">
                <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-500" /> Diagnóstico del alumno para refuerzo:
                </h3>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside pl-1">
                  <li>Estudiante: <strong>{student.nombre}</strong></li>
                  <li>Curso / Nivel: <strong>{curso}</strong></li>
                  <li>Promedio en {asignatura}: <strong>{student.promedio ?? "Sin notas"}</strong></li>
                </ul>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                    Objetivo de Aprendizaje a Reforzar (OA):
                  </label>
                  <input
                    type="text"
                    value={oaId}
                    onChange={e => setOaId(e.target.value)}
                    placeholder="Ej: OA 04 (Lectura comprensiva) o OA 08 (Suma y resta de fracciones)"
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                    Dificultades específicas u observaciones (Opcional):
                  </label>
                  <textarea
                    value={dificultades}
                    onChange={e => setDificultades(e.target.value)}
                    placeholder="Ej: Presenta problemas al encontrar el mínimo común múltiplo. Requiere apoyo visual y explicaciones simplificadas."
                    className="w-full border border-border rounded-xl p-3 text-sm bg-background outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    rows={3}
                  />
                </div>
              </div>

              {error && <div className="text-xs text-red-500 font-semibold">{error}</div>}

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleGenerate}
                  className="bg-emerald-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-emerald-700 flex items-center gap-2 shadow-md transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  Generar Guía de Refuerzo con Gemini
                </button>
              </div>
            </div>
          )}

          {loading && (
            <div className="py-20 text-center space-y-4">
              <Loader2 className="w-12 h-12 animate-spin mx-auto text-emerald-500" />
              <div className="font-bold text-base">Creando ruta adaptada para {student.nombre}...</div>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Gemini estructurando explicaciones simplificadas y ejercicios progresivos basados en directrices de psicopedagogía y DUA.
              </p>
            </div>
          )}

          {ruta && !loading && (
            <div className="space-y-6">
              <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-500/20 p-4 rounded-xl">
                <h3 className="font-extrabold text-emerald-800 dark:text-emerald-300 text-lg flex items-center gap-2">
                  <BookOpen className="w-5 h-5" /> {ruta.titulo}
                </h3>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                  Material diseñado exclusivamente para {student.nombre} para reforzar {oaId}.
                </p>
              </div>

              {/* Seccion 1 */}
              <div className="space-y-2">
                <h4 className="font-bold text-sm text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-emerald-500" /> Concepto Clave
                </h4>
                <p className="text-sm bg-muted/20 border border-border/50 rounded-lg p-4 leading-relaxed">{ruta.explicacionSimple}</p>
              </div>

              {/* Seccion 2 */}
              <div className="space-y-2">
                <h4 className="font-bold text-sm text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Settings2 className="w-4 h-4 text-emerald-500" /> Ejemplo Resuelto Paso a Paso
                </h4>
                <div className="bg-muted/20 border border-border/50 rounded-lg p-4 space-y-3">
                  <div className="text-sm font-semibold">Problema: {ruta.ejemploResuelto.enunciado}</div>
                  <div className="space-y-1.5">
                    {ruta.ejemploResuelto.pasoAPaso.map((p, idx) => (
                      <div key={idx} className="text-xs flex gap-2">
                        <span className="font-bold text-emerald-600">Paso {idx+1}:</span>
                        <span className="text-muted-foreground">{p}</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-sm font-bold text-emerald-600 pt-1 border-t border-border/50">
                    Resultado: {ruta.ejemploResuelto.resultadoFinal}
                  </div>
                </div>
              </div>

              {/* Seccion 3 */}
              <div className="space-y-2">
                <h4 className="font-bold text-sm text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4 text-emerald-500" /> Ejercicios Prácticos Propuestos
                </h4>
                <div className="grid gap-3">
                  {ruta.ejerciciosPropuestos.map(e => (
                    <div key={e.numero} className="bg-muted/20 border border-border/50 rounded-lg p-4">
                      <div className="text-sm font-bold">Ejercicio {e.numero}: {e.enunciado}</div>
                      <div className="text-xs text-muted-foreground mt-2 italic flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Pista: {e.pista}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Seccion 4 */}
              <div className="space-y-2">
                <h4 className="font-bold text-sm text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <CheckSquare className="w-4 h-4 text-emerald-500" /> Checklist de Metacognición
                </h4>
                <ul className="text-xs bg-muted/20 border border-border/50 rounded-lg p-4 space-y-2 list-none">
                  {ruta.checklistLogros.map((item, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-muted-foreground">
                      <div className="w-4 h-4 rounded border border-emerald-500/50 flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="text-sm italic text-muted-foreground text-center py-2">
                "{ruta.mensajeAliento}"
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex flex-wrap gap-3 justify-between items-center bg-muted/20">
          <button
            onClick={() => { setRuta(null); }}
            disabled={!ruta || loading}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Nueva ruta
          </button>

          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              disabled={!ruta}
              className="px-4 py-2 border border-border rounded-lg bg-background hover:bg-muted text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copiado" : "Copiar Guía"}
            </button>

            <button
              onClick={handlePrint}
              disabled={!ruta}
              className="px-4 py-2 border border-border rounded-lg bg-background hover:bg-muted text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              Imprimir / PDF
            </button>

            {onSaveObservation && (
              <button
                onClick={handleSaveToObs}
                disabled={!ruta}
                className="px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-bold flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
              >
                Guardar en Registro
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
