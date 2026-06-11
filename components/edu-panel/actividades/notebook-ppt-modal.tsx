"use client"

import { useMemo, useState } from "react"
import { BookOpen, Check, Copy, Download, ExternalLink, FileText, Monitor, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ActividadClase, ClaseCronograma, OAEditado } from "@/lib/curriculo"

const NOTEBOOK_URL = "https://notebooklm.google.com/"

type NotebookPptModalProps = {
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

function buildNotebookSource(props: NotebookPptModalProps) {
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

function buildNotebookPrompt(props: NotebookPptModalProps) {
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

export function NotebookPptModal(props: NotebookPptModalProps) {
  const [copied, setCopied] = useState(false)
  const [showLongGuide, setShowLongGuide] = useState(false)

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

  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/60 p-3 sm:p-4 print:hidden">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[16px] border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-[8px] bg-primary/10 text-primary">
                <Monitor className="h-4 w-4" />
              </div>
              <h2 className="text-[16px] font-extrabold">Crear PPT con Notebook</h2>
            </div>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Prepara una fuente descargable, un prompt listo y el acceso a NotebookLM para armar diapositivas desde esta clase.
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

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="mb-4 grid gap-2 md:grid-cols-3">
            {[
              ["1", "Descarga la fuente", "Sube este archivo como fuente del notebook."],
              ["2", "Copia el prompt", "Pegalo dentro del notebook ya cargado."],
              ["3", "Abre NotebookLM", "Genera el guion o la presentacion desde ahi."],
            ].map(([step, title, text]) => (
              <div key={step} className="rounded-[10px] border border-border bg-background p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-[11px] font-extrabold text-primary-foreground">{step}</span>
                  <p className="text-[12px] font-extrabold">{title}</p>
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
            <section className="rounded-[12px] border border-border bg-background p-4">
              <div className="mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <h3 className="text-[13px] font-extrabold">Fuente para Notebook</h3>
              </div>
              <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">
                Este archivo junta objetivo, OA, momentos de clase, materiales y evaluacion para que Notebook tenga contexto real.
              </p>
              <button
                type="button"
                onClick={downloadSource}
                className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-primary px-4 py-2.5 text-[12px] font-bold text-primary-foreground hover:opacity-90"
              >
                <Download className="h-4 w-4" />
                Descargar fuente .md
              </button>
              <div className="mt-3 max-h-[260px] overflow-y-auto rounded-[10px] border border-border bg-card p-3">
                <pre className="whitespace-pre-wrap font-mono text-[10.5px] leading-relaxed text-muted-foreground">{source}</pre>
              </div>
            </section>

            <section className="rounded-[12px] border border-border bg-background p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <h3 className="text-[13px] font-extrabold">Prompt para Notebook</h3>
                </div>
                <button
                  type="button"
                  onClick={copyPrompt}
                  className="inline-flex items-center gap-1.5 rounded-[8px] border border-border bg-card px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:text-primary"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
              <textarea
                readOnly
                value={prompt}
                className="h-[260px] w-full resize-none rounded-[10px] border border-border bg-card p-3 font-mono text-[11px] leading-relaxed outline-none"
              />
              <a
                href={NOTEBOOK_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-[10px] border border-primary/40 bg-primary/5 px-4 py-2.5 text-[12px] font-bold text-primary hover:bg-primary/10"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir NotebookLM
              </a>
            </section>
          </div>

          <div className="mt-4 rounded-[12px] border border-border bg-background">
            <button
              type="button"
              onClick={() => setShowLongGuide(value => !value)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="text-[13px] font-extrabold">Explicacion larga</span>
              <span className="text-[11px] font-bold text-primary">{showLongGuide ? "Ocultar" : "Ver detalle"}</span>
            </button>
            {showLongGuide && (
              <div className="border-t border-border px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
                <ol className="space-y-2">
                  <li><b>1.</b> Descarga la fuente y guardala en tu computador. Es el resumen estructurado de la clase actual.</li>
                  <li><b>2.</b> Abre NotebookLM y crea un notebook nuevo para esta unidad o clase.</li>
                  <li><b>3.</b> Sube el archivo Markdown como fuente. Espera a que Notebook termine de leerlo.</li>
                  <li><b>4.</b> Copia el prompt de EduPanel y pegalo en el chat del notebook.</li>
                  <li><b>5.</b> Revisa la tabla de diapositivas, ajusta lo que quieras y pasalo a PowerPoint o Google Slides.</li>
                  <li><b>6.</b> Si necesitas una version mas breve, responde en Notebook: &quot;reduce a 7 diapositivas y conserva solo lo esencial&quot;.</li>
                </ol>
                <p className="mt-3">
                  Consejo: si la clase aun esta incompleta, vuelve a EduPanel, completa inicio/desarrollo/cierre y descarga otra fuente antes de generar la presentacion final.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end border-t border-border px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={() => props.onOpenChange(false)}
            className={cn("rounded-[10px] border border-border bg-background px-4 py-2 text-[12px] font-bold text-muted-foreground hover:bg-muted")}
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  )
}
