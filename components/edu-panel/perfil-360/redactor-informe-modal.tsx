"use client"

import { useState } from "react"
import { apiFetch } from "@/lib/api-client"
import { 
  Sparkles, Loader2, Copy, Check, Printer, FileText, 
  Settings2, Heart, Award, ArrowRight, ShieldAlert, X 
} from "lucide-react"

interface RedactorInformeModalProps {
  isOpen: boolean
  onClose: () => void
  student: {
    id: string
    nombre: string
    promedio: number | null
    porcentajeAsistencia: number | null
    pie: boolean
    pieDiagnostico?: string
    pieNotas?: string
  }
  curso: string
  asignatura: string
  observaciones: string[]
  onSaveObservation?: (texto: string) => Promise<void>
}

interface GeneratedReport {
  socioemocional: string
  academica: string
  fortalezas: string[]
  oportunidadesMejora: string[]
  conclusion: string
}

export function RedactorInformeModal({
  isOpen,
  onClose,
  student,
  curso,
  asignatura,
  observaciones,
  onSaveObservation
}: RedactorInformeModalProps) {
  const [tono, setTono] = useState<"empatico" | "formal" | "constructivo" | "directo">("empatico")
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<GeneratedReport | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editedReport, setEditedReport] = useState<GeneratedReport | null>(null)

  if (!isOpen) return null

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch("/api/redactor-informes", {
        method: "POST",
        body: JSON.stringify({
          nombre: student.nombre,
          curso,
          asignatura,
          promedio: student.promedio ? String(student.promedio) : "Sin notas",
          asistencia: student.porcentajeAsistencia ? String(student.porcentajeAsistencia) : "Sin registro",
          observaciones,
          pieInfo: student.pie ? { diagnostico: student.pieDiagnostico, notas: student.pieNotas } : undefined,
          tono
        })
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || "Error al generar el informe.")
      }

      const data = await res.json()
      setReport(data)
      setEditedReport(data)
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Ocurrió un error inesperado al conectar con Gemini.")
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    if (!editedReport) return
    const text = `INFORME DE DESARROLLO PERSONAL Y SOCIAL (IDPS)
Estudiante: ${student.nombre} | Curso: ${curso} | Asignatura: ${asignatura}
--------------------------------------------------

1. DESARROLLO SOCIOEMOCIONAL Y CONDUCTUAL:
${editedReport.socioemocional}

2. DESEMPEÑO ACADÉMICO Y HÁBITOS DE ESTUDIO:
${editedReport.academica}

3. PRINCIPALES FORTALEZAS:
${editedReport.fortalezas.map(f => `• ${f}`).join("\n")}

4. ASPECTOS A FORTALECER (OPORTUNIDADES DE MEJORA):
${editedReport.oportunidadesMejora.map(o => `• ${o}`).join("\n")}

5. CONCLUSIÓN Y CIERRE:
${editedReport.conclusion}`

    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePrint = () => {
    const printWindow = window.open("", "_blank")
    if (!printWindow || !editedReport) return

    printWindow.document.write(`
      <html>
        <head>
          <title>Informe de Personalidad - ${student.nombre}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #1e293b; line-height: 1.6; }
            .header { text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
            .header h1 { margin: 0; font-size: 24px; color: #0f172a; }
            .header p { margin: 5px 0 0 0; color: #64748b; font-size: 14px; }
            .meta { display: grid; grid-template-cols: 1fr 1fr; gap: 15px; background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 30px; font-size: 14px; }
            .section { margin-bottom: 25px; }
            .section-title { font-weight: bold; font-size: 16px; color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 5px; margin-bottom: 10px; }
            .list { padding-left: 20px; margin: 8px 0; }
            .list-item { margin-bottom: 6px; }
            .footer { margin-top: 50px; display: flex; justify-content: space-between; font-size: 13px; color: #64748b; }
            .signature { border-top: 1px solid #cbd5e1; width: 200px; text-align: center; padding-top: 5px; margin-top: 50px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Informe de Desarrollo Personal y Social (IDPS)</h1>
            <p>EduPanel · Reporte Automatizado de Apoyo Docente</p>
          </div>
          <div class="meta">
            <div><strong>Estudiante:</strong> ${student.nombre}</div>
            <div><strong>Curso:</strong> ${curso}</div>
            <div><strong>Asignatura/Área:</strong> ${asignatura}</div>
            <div><strong>Promedio:</strong> ${student.promedio || "Sin calificaciones"}</div>
            <div><strong>Asistencia:</strong> ${student.porcentajeAsistencia ? `${student.porcentajeAsistencia}%` : "Sin registro"}</div>
          </div>
          
          <div class="section">
            <div class="section-title">Desarrollo Socioemocional y Conductual</div>
            <div>${editedReport.socioemocional}</div>
          </div>

          <div class="section">
            <div class="section-title">Desempeño Académico y Hábitos de Estudio</div>
            <div>${editedReport.academica}</div>
          </div>

          <div class="section">
            <div class="section-title">Principales Fortalezas</div>
            <ul class="list">
              ${editedReport.fortalezas.map(f => `<li class="list-item">${f}</li>`).join("")}
            </ul>
          </div>

          <div class="section">
            <div class="section-title">Oportunidades de Mejora</div>
            <ul class="list">
              ${editedReport.oportunidadesMejora.map(o => `<li class="list-item">${o}</li>`).join("")}
            </ul>
          </div>

          <div class="section">
            <div class="section-title">Mensaje Final de Cierre</div>
            <div>${editedReport.conclusion}</div>
          </div>

          <div style="display: flex; justify-content: flex-end; margin-top: 60px;">
            <div class="signature">
              Firma del Docente
            </div>
          </div>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.print()
  }

  const handleSaveToObs = async () => {
    if (!editedReport || !onSaveObservation) return
    const text = `[Informe de Personalidad generado con IA]\nSocioemocional: ${editedReport.socioemocional}\nAcadémico: ${editedReport.academica}\nConclusión: ${editedReport.conclusion}`
    await onSaveObservation(text)
    alert("Informe guardado con éxito como observación en el Perfil 360.")
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border w-full max-w-4xl rounded-[18px] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
            <h2 className="font-extrabold text-lg">Redactor de Informes de Personalidad (IA)</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {!report && !loading && (
            <div className="space-y-6">
              <div className="bg-muted/40 p-4 rounded-xl space-y-2 border border-border">
                <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" /> Datos del Alumno analizados para la redacción:
                </h3>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside pl-1">
                  <li>Historial de observaciones: <strong>{observaciones.length} observaciones registradas</strong>.</li>
                  <li>Promedio General: <strong>{student.promedio ?? "Sin notas"}</strong>.</li>
                  <li>Asistencia Semestral: <strong>{student.porcentajeAsistencia ? `${student.porcentajeAsistencia}%` : "Sin registro"}</strong>.</li>
                  {student.pie && <li>Ficha PIE Activa: <strong>{student.pieDiagnostico || "Diagnóstico General"}</strong>.</li>}
                </ul>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                  <Settings2 className="w-3.5 h-3.5" /> Selecciona el Tono del Informe:
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    { key: "empatico", label: "Empático 💝", desc: "Suave, positivo y motivador" },
                    { key: "formal", label: "Formal 💼", desc: "Lenguaje formal corporativo" },
                    { key: "constructivo", label: "Constructivo 🌱", desc: "Enfocado en oportunidades" },
                    { key: "directo", label: "Directo 🎯", desc: "Claro, objetivo e instructivo" },
                  ].map(t => (
                    <button
                      key={t.key}
                      onClick={() => setTono(t.key as any)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        tono === t.key
                          ? "border-primary bg-primary/5 text-primary shadow-sm"
                          : "border-border hover:border-primary/50 text-muted-foreground bg-background"
                      }`}
                    >
                      <div className="font-bold text-sm">{t.label}</div>
                      <div className="text-[10px] opacity-80 mt-0.5">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  onClick={handleGenerate}
                  className="bg-primary text-primary-foreground font-bold px-6 py-3 rounded-xl hover:bg-pink-dark flex items-center gap-2 shadow-md transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  Redactar Informe con Gemini
                </button>
              </div>
            </div>
          )}

          {loading && (
            <div className="py-20 text-center space-y-4">
              <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
              <div className="font-bold text-base">Gemini analizando la ficha de {student.nombre}...</div>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Procesando calificaciones, asistencia y anotaciones para estructurar un informe descriptivo personalizado.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-4 rounded-xl flex gap-3 text-red-800 dark:text-red-300">
              <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-sm">Error en la generación</div>
                <p className="text-xs mt-1">{error}</p>
                <button onClick={handleGenerate} className="text-xs font-bold underline mt-2 block">Reintentar</button>
              </div>
            </div>
          )}

          {report && editedReport && !loading && (
            <div className="space-y-6">
              <div className="flex items-center justify-between bg-muted/30 p-3 rounded-lg border border-border">
                <span className="text-xs text-muted-foreground">Informe listo. Revisa y edita las secciones si es necesario.</span>
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="text-xs font-bold px-3 py-1.5 rounded-md border border-border bg-background hover:bg-muted"
                >
                  {isEditing ? "Guardar cambios" : "Editar texto"}
                </button>
              </div>

              <div className="space-y-4">
                {/* Socioemocional */}
                <div className="space-y-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Heart className="w-3.5 h-3.5 text-red-500" /> Desarrollo Socioemocional y Conductual
                  </h4>
                  {isEditing ? (
                    <textarea
                      value={editedReport.socioemocional}
                      onChange={e => setEditedReport({ ...editedReport, socioemocional: e.target.value })}
                      className="w-full text-sm bg-background border rounded-lg p-3 outline-none focus:border-primary"
                      rows={3}
                    />
                  ) : (
                    <p className="text-sm bg-muted/20 border border-border/50 rounded-lg p-3.5 leading-relaxed">{editedReport.socioemocional}</p>
                  )}
                </div>

                {/* Academica */}
                <div className="space-y-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-blue-500" /> Desempeño Académico y Hábitos de Estudio
                  </h4>
                  {isEditing ? (
                    <textarea
                      value={editedReport.academica}
                      onChange={e => setEditedReport({ ...editedReport, academica: e.target.value })}
                      className="w-full text-sm bg-background border rounded-lg p-3 outline-none focus:border-primary"
                      rows={3}
                    />
                  ) : (
                    <p className="text-sm bg-muted/20 border border-border/50 rounded-lg p-3.5 leading-relaxed">{editedReport.academica}</p>
                  )}
                </div>

                {/* Fortalezas y Debilidades */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <h5 className="text-xs font-bold uppercase text-emerald-600 dark:text-emerald-400">Fortalezas</h5>
                    {isEditing ? (
                      <textarea
                        value={editedReport.fortalezas.join("\n")}
                        onChange={e => setEditedReport({ ...editedReport, fortalezas: e.target.value.split("\n") })}
                        className="w-full text-sm bg-background border rounded-lg p-3 outline-none focus:border-primary"
                        rows={3}
                        placeholder="Una fortaleza por línea"
                      />
                    ) : (
                      <ul className="text-sm bg-emerald-50/30 dark:bg-emerald-950/10 border border-emerald-500/20 rounded-lg p-3.5 list-disc list-inside space-y-1">
                        {editedReport.fortalezas.map((f, i) => <li key={i}>{f}</li>)}
                      </ul>
                    )}
                  </div>
                  <div className="space-y-1">
                    <h5 className="text-xs font-bold uppercase text-amber-600 dark:text-amber-400">Oportunidades de Mejora</h5>
                    {isEditing ? (
                      <textarea
                        value={editedReport.oportunidadesMejora.join("\n")}
                        onChange={e => setEditedReport({ ...editedReport, oportunidadesMejora: e.target.value.split("\n") })}
                        className="w-full text-sm bg-background border rounded-lg p-3 outline-none focus:border-primary"
                        rows={3}
                        placeholder="Un aspecto por línea"
                      />
                    ) : (
                      <ul className="text-sm bg-amber-50/30 dark:bg-amber-950/10 border border-amber-500/20 rounded-lg p-3.5 list-disc list-inside space-y-1">
                        {editedReport.oportunidadesMejora.map((o, i) => <li key={i}>{o}</li>)}
                      </ul>
                    )}
                  </div>
                </div>

                {/* Conclusion */}
                <div className="space-y-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <ArrowRight className="w-3.5 h-3.5 text-primary" /> Conclusión de Cierre
                  </h4>
                  {isEditing ? (
                    <textarea
                      value={editedReport.conclusion}
                      onChange={e => setEditedReport({ ...editedReport, conclusion: e.target.value })}
                      className="w-full text-sm bg-background border rounded-lg p-3 outline-none focus:border-primary"
                      rows={2}
                    />
                  ) : (
                    <p className="text-sm bg-muted/20 border border-border/50 rounded-lg p-3.5 leading-relaxed italic">{editedReport.conclusion}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex flex-wrap gap-3 justify-between items-center bg-muted/20">
          <button
            onClick={() => { setReport(null); setEditedReport(null); }}
            disabled={!report || loading}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Volver a redactar
          </button>
          
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              disabled={!editedReport}
              className="px-4 py-2 border border-border rounded-lg bg-background hover:bg-muted text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copiado" : "Copiar Texto"}
            </button>
            
            <button
              onClick={handlePrint}
              disabled={!editedReport}
              className="px-4 py-2 border border-border rounded-lg bg-background hover:bg-muted text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              Imprimir / PDF
            </button>

            {onSaveObservation && (
              <button
                onClick={handleSaveToObs}
                disabled={!editedReport}
                className="px-5 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-pink-dark text-sm font-bold flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
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
