"use client"

import { useEffect, useMemo, useState } from "react"
import { BookOpen, Check, Copy, Download, ExternalLink, FileText, Monitor, X, HardDrive, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ActividadClase, ClaseCronograma, OAEditado } from "@/lib/curriculo"
import { useAuth } from "@/components/auth/auth-context"
import { 
  isGoogleDriveConnected, 
  getGoogleDriveToken, 
  ensureEduPanelClassFolder, 
  subirTextoADrive, 
  getGoogleDriveErrorMessage,
  buildDriveFolderUrl 
} from "@/lib/google-drive"

const NOTEBOOK_URL = "https://notebooklm.google.com/"

type NotebookPptModalV2Props = {
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
}

function stripHtml(value?: string) {
  if (!value) return ""
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

function listBlock(items?: string[]) {
  const clean = (items || []).map(item => item.trim()).filter(Boolean)
  if (!clean.length) return "- Sin datos registrados."
  return clean.map(item => `- ${item}`).join("\n")
}

function safeFilePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "clase"
}

function selectedOasForClass(oas: OAEditado[], actividad: Partial<ActividadClase>, claseCronograma?: ClaseCronograma) {
  const ids = new Set([...(actividad.oaIds || []), ...(claseCronograma?.oaIds || [])].filter(Boolean))
  const byClass = ids.size > 0 ? oas.filter(oa => ids.has(oa.id)) : []
  return byClass.length > 0 ? byClass : oas.filter(oa => oa.seleccionado)
}

function buildOaBlock(oas: OAEditado[], actividad: Partial<ActividadClase>, claseCronograma?: ClaseCronograma) {
  const selected = selectedOasForClass(oas, actividad, claseCronograma)
  if (!selected.length) return "Sin OA asociados a esta clase."

  return selected.map(oa => {
    const title = oa.numero ? `OA ${oa.numero}` : oa.tipo === "oat" ? "OAT" : oa.id
    const indicadores = (oa.indicadores || [])
      .filter(ind => ind.seleccionado)
      .map(ind => `  - ${ind.texto}`)
      .join("\n")

    return `- ${title}: ${oa.descripcion}${indicadores ? `\n  Indicadores:\n${indicadores}` : ""}`
  }).join("\n")
}

function buildNotebookSource(props: NotebookPptModalV2Props) {
  const claseLabel = `Clase ${props.numeroClase}${props.totalClases ? ` de ${props.totalClases}` : ""}`
  const fecha = props.claseCronograma?.fecha || props.actividad.fecha || "Sin fecha definida"
  const formal = props.actividad.desarrolloFormal

  return `# Fuente NotebookLM - Presentacion de clase
 
## Contexto general
- Asignatura: ${props.asignatura}
- Curso: ${props.curso}
- Nivel curricular: ${props.nivelCurricular || "No especificado"}
- Unidad: ${props.unidadNombre || props.unidadId}
- ${claseLabel}
- Fecha: ${fecha}
 
## Proposito de la unidad
${stripHtml(props.unidadProposito) || "Sin proposito registrado."}
 
## Contexto del docente
${stripHtml(props.contextoDocente) || "Sin contexto docente adicional."}
 
## Objetivo docente de la unidad
${stripHtml(props.objetivoDocente) || "Sin objetivo docente adicional."}
 
## Objetivo de la clase
${stripHtml(props.actividad.objetivo) || "Sin objetivo de clase registrado."}
 
## Objetivos de aprendizaje e indicadores
${buildOaBlock(props.oas, props.actividad, props.claseCronograma)}
 
## Habilidades trabajadas
${listBlock(props.actividad.habilidades)}
 
## Actitudes trabajadas
${listBlock(props.actividad.actitudes)}
 
## Inicio de la clase
${stripHtml(formal?.inicio || props.actividad.inicio) || "Sin inicio registrado."}
 
## Desarrollo de la clase
${stripHtml(formal?.desarrollo || props.actividad.desarrollo) || "Sin desarrollo registrado."}
 
## Cierre de la clase
${stripHtml(formal?.cierre || props.actividad.cierre) || "Sin cierre registrado."}
 
## Adecuacion curricular / DUA
${stripHtml(props.actividad.adecuacion) || "Sin adecuacion registrada."}
 
## Materiales
${listBlock(props.actividad.materiales)}
 
## TICs
${listBlock(props.actividad.tics)}
 
## Evaluacion formativa sugerida
${stripHtml(props.actividad.actividadEvaluacion?.descripcion) || "Sin actividad de evaluacion registrada."}
 
## Criterios de evaluacion
${listBlock(props.actividad.actividadEvaluacion?.criterios)}
 
## Indicadores de evaluacion generados por IA
${props.actividad.indicadoresEvaluacion?.length
  ? props.actividad.indicadoresEvaluacion.map(ind => `- ${ind.texto} (${ind.dimension}, Bloom ${ind.nivelBloom})`).join("\n")
  : "- Sin indicadores generados por IA."}
`
}

function buildNotebookPrompt(props: NotebookPptModalV2Props) {
  const claseLabel = `Clase ${props.numeroClase}${props.totalClases ? ` de ${props.totalClases}` : ""}`

  return `Usa exclusivamente las fuentes cargadas en este notebook para crear una presentacion de diapositivas para ${props.asignatura}, ${props.curso}, ${claseLabel}.

Necesito una presentacion lista para llevar a PowerPoint o Google Slides. Organiza el resultado como una tabla con estas columnas: numero de diapositiva, titulo, contenido visible, apoyo visual sugerido, notas del docente y accion del estudiante.

Requisitos:
- Crea entre 8 y 12 diapositivas.
- Respeta el objetivo, OA, indicadores, inicio, desarrollo, cierre y adecuaciones de la fuente.
- Usa lenguaje claro para estudiantes escolares chilenos.
- Incluye una diapositiva inicial con objetivo de clase.
- Incluye una actividad breve durante el desarrollo y una pregunta de cierre/metacognicion.
- No inventes OA, contenidos ni evaluaciones que no esten en la fuente.
- Propone visuales concretos, faciles de buscar o crear, sin imagenes genericas.
- Al final agrega una lista de materiales y una mini pauta para que el docente use la presentacion en clase.

Si NotebookLM ofrece una herramienta para generar diapositivas o presentacion, usala con estas instrucciones. Si solo puedes responder en texto, entrega el guion completo de diapositivas en la tabla solicitada.`
}

export function NotebookPptModalV2(props: NotebookPptModalV2Props) {
  const { signInWithGoogleDrive } = useAuth()
  const [copied, setCopied] = useState(false)
  const [showLongGuide, setShowLongGuide] = useState(false)

  // Google Drive state
  const [uploading, setUploading] = useState(false)
  const [driveFileUrl, setDriveFileUrl] = useState<string | null>(null)
  const [driveFolderUrl, setDriveFolderUrl] = useState<string | null>(null)
  const [driveError, setDriveError] = useState<string | null>(null)

  const [driveConnected, setDriveConnected] = useState(false)

  useEffect(() => {
    if (props.open) {
      setDriveConnected(isGoogleDriveConnected() && !!getGoogleDriveToken())
    }
  }, [props.open])

  const handleConnectDrive = async () => {
    try {
      await signInWithGoogleDrive()
      setDriveConnected(true)
      setDriveError(null)
    } catch (err: any) {
      console.error(err)
      setDriveError(err?.message || "Error al conectar Google Drive")
    }
  }

  const source = useMemo(() => buildNotebookSource(props), [props])
  const prompt = useMemo(() => buildNotebookPrompt(props), [props])
  
  const fileName = useMemo(() => {
    return `Fuente_Notebook_${safeFilePart(props.asignatura)}_${safeFilePart(props.curso)}_clase_${props.numeroClase}.md`
  }, [props.asignatura, props.curso, props.numeroClase])

  if (!props.open) return null

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const downloadSource = () => {
    const blob = new Blob([source], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const handleUploadToDrive = async () => {
    setUploading(true)
    setDriveError(null)
    try {
      const token = getGoogleDriveToken()
      if (!token) {
        setDriveConnected(false)
        throw new Error("No hay un token activo de Google Drive. Por favor, vuelve a conectar tu cuenta.")
      }

      const year = new Date().getFullYear()
      const context = {
        tipo: "planificaciones" as const,
        asignatura: props.asignatura,
        curso: props.curso,
        unidadId: props.unidadId,
        unidadNombre: props.unidadNombre || props.unidadId,
        numeroClase: props.numeroClase,
      }

      // 1. Asegurar la jerarquía de carpetas de la clase
      const folders = await ensureEduPanelClassFolder(token, context, year)
      const targetFolder = folders.classPlanificacionFolder

      // 2. Subir archivo
      const uploadedFile = await subirTextoADrive(token, {
        folderId: targetFolder.id,
        fileName: fileName,
        content: source,
        mimeType: "text/markdown",
        overwrite: true
      })

      // 3. Registrar URLs
      setDriveFileUrl(uploadedFile.webViewLink || null)
      setDriveFolderUrl(buildDriveFolderUrl(targetFolder.id))
    } catch (err: any) {
      console.error("Google Drive Upload Error:", err)
      const errorMsg = getGoogleDriveErrorMessage(err)
      setDriveError(errorMsg)
      if (
        errorMsg.toLowerCase().includes("token") || 
        errorMsg.toLowerCase().includes("cuenta") || 
        errorMsg.toLowerCase().includes("sesion") || 
        errorMsg.toLowerCase().includes("unauthorized")
      ) {
        setDriveConnected(false)
      }
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/60 p-3 sm:p-4 print:hidden">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Monitor className="h-4 w-4" />
              </div>
              <h2 className="text-[16px] font-extrabold">Preparar PPT con NotebookLM (Google Drive)</h2>
            </div>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Guarda la fuente estructurada directamente en tu Google Drive para crear presentaciones inteligentes de diapositivas.
            </p>
          </div>
          <button
            type="button"
            onClick={() => props.onOpenChange(false)}
            className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-background text-muted-foreground hover:bg-muted"
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* Tarjeta de integración con Google Drive */}
          <div className="mb-4 rounded-xl border border-violet-500/20 bg-gradient-to-r from-violet-500/5 to-fuchsia-500/5 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-600/10 text-violet-600 dark:text-violet-400">
                  <HardDrive className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-[13px] font-bold text-foreground">Integración en 1-Clic con Google Drive</h4>
                  <p className="text-[11.5px] text-muted-foreground mt-0.5 max-w-xl">
                    Sube la planificación de esta clase directamente a tu almacenamiento escolar para que NotebookLM la lea de inmediato.
                  </p>
                </div>
              </div>

              <div className="flex-shrink-0">
                {!driveConnected ? (
                  <button
                    type="button"
                    onClick={handleConnectDrive}
                    className="inline-flex items-center gap-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 text-[12px] font-bold shadow-sm transition-colors cursor-pointer"
                  >
                    <HardDrive className="h-4 w-4" />
                    Conectar Google Drive
                  </button>
                ) : (
                  <>
                    {!driveFileUrl ? (
                      <button
                        type="button"
                        onClick={handleUploadToDrive}
                        disabled={uploading}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary hover:opacity-95 text-white px-4 py-2.5 text-[12px] font-bold shadow-sm transition-all disabled:opacity-60 cursor-pointer"
                      >
                        {uploading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Guardando en Drive...
                          </>
                        ) : (
                          <>
                            <HardDrive className="h-4 w-4" />
                            Guardar en Google Drive
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-extrabold text-[12px]">
                        <CheckCircle2 className="h-4 w-4 fill-emerald-500/10" />
                        ¡Guardado con éxito!
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Alertas de Éxito / Error */}
            {driveError && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-[11.5px] text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Error al subir a Google Drive</p>
                  <p className="mt-0.5">{driveError}</p>
                </div>
              </div>
            )}

            {driveFileUrl && (
              <div className="mt-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3">
                <p className="text-[11.5px] font-bold text-emerald-800 dark:text-emerald-300">Archivo listo en Drive</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a
                    href={driveFileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline"
                  >
                    Ver archivo .md
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  <span className="text-muted-foreground/30">•</span>
                  <a
                    href={driveFolderUrl || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline"
                  >
                    Ver carpeta de la clase
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <p className="mt-2 text-[10.5px] text-muted-foreground leading-normal max-w-2xl">
                  💡 **Tip para NotebookLM**: Abre NotebookLM, añade una nueva fuente seleccionando Google Drive y tu archivo recién guardado aparecerá arriba de todo en la pestaña de **Recientes (Recent)**.
                </p>
              </div>
            )}
          </div>

          <div className="mb-4 grid gap-2 md:grid-cols-3">
            {[
              ["1", "Sube a Google Drive", "Usa la herramienta automática arriba o descarga la fuente localmente."],
              ["2", "Copia el prompt", "Haz clic en el botón para copiar las instrucciones estructuradas."],
              ["3", "Abre NotebookLM", "Pega el prompt en el chat de NotebookLM y genera tu PPT."],
            ].map(([step, title, text]) => (
              <div key={step} className="rounded-xl border border-border bg-background p-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="grid h-5.5 w-5.5 place-items-center rounded-full bg-primary text-[11px] font-extrabold text-primary-foreground">{step}</span>
                  <p className="text-[12px] font-extrabold">{title}</p>
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
            <section className="rounded-xl border border-border bg-background p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <h3 className="text-[13px] font-extrabold">Vista previa del archivo fuente</h3>
                </div>
                <button
                  type="button"
                  onClick={downloadSource}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  Descargar Local .md
                </button>
              </div>
              <p className="mb-3 text-[11.5px] leading-relaxed text-muted-foreground">
                Contiene el objetivo multinivel, OA, indicadores, momentos detallados, adecuaciones DUA y recursos para la IA.
              </p>
              <div className="max-h-[260px] overflow-y-auto rounded-lg border border-border bg-muted/20 p-3">
                <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-muted-foreground">{source}</pre>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-background p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <h3 className="text-[13px] font-extrabold">Prompt de Diapositivas</h3>
                </div>
                <button
                  type="button"
                  onClick={copyPrompt}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:text-primary cursor-pointer"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copiado" : "Copiar Prompt"}
                </button>
              </div>
              <textarea
                readOnly
                value={prompt}
                className="h-[230px] w-full resize-none rounded-lg border border-border bg-muted/20 p-3 font-mono text-[11px] leading-relaxed outline-none"
              />
              <a
                href={NOTEBOOK_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-4 py-2.5 text-[12px] font-bold text-primary hover:bg-primary/10 cursor-pointer"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir Google NotebookLM
              </a>
            </section>
          </div>

          <div className="mt-4 rounded-xl border border-border bg-background">
            <button
              type="button"
              onClick={() => setShowLongGuide(value => !value)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="text-[13px] font-extrabold">Instrucciones de uso detalladas</span>
              <span className="text-[11px] font-bold text-primary">{showLongGuide ? "Ocultar" : "Ver detalle"}</span>
            </button>
            {showLongGuide && (
              <div className="border-t border-border px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
                <ol className="space-y-2">
                  <li><b>1.</b> Haz clic en "Guardar en Google Drive" arriba. Subirá la planificación como texto estructurado a Drive.</li>
                  <li><b>2.</b> Abre NotebookLM y haz clic en "Nuevo cuaderno" (o abre tu cuaderno de la unidad).</li>
                  <li><b>3.</b> Añade una fuente de Google Drive. En la pestaña **Recientes**, verás al principio del todo tu archivo `Fuente_Notebook_[Clase].md`. Selecciónalo.</li>
                  <li><b>4.</b> Copia el prompt haciendo clic en "Copiar Prompt" en EduPanel.</li>
                  <li><b>5.</b> Pégalo en el chat de NotebookLM y presiona enviar. La IA diseñará las diapositivas exactas basándose solo en tu planificación.</li>
                </ol>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end border-t border-border px-5 py-3.5 bg-muted/10">
          <button
            type="button"
            onClick={() => props.onOpenChange(false)}
            className={cn("rounded-lg border border-border bg-background px-4 py-2 text-[12.5px] font-bold text-muted-foreground hover:bg-muted cursor-pointer")}
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  )
}
