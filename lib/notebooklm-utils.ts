/**
 * Utilidades para el flujo NotebookLM:
 * - Extracción de texto desde archivos (TXT, PDF)
 * - Auto-detección del tipo de contenido pegado
 * - Parser de delimitadores [SECCION]...[/SECCION] para el modo "Formato guiado"
 */

import type { NotebookLmTipo } from "@/lib/curriculo"

// ═══════════════════════════════════════════════════════════════════════════
// EXTRACCIÓN DE TEXTO DESDE ARCHIVOS
// ═══════════════════════════════════════════════════════════════════════════

export interface FileExtractionResult {
  text: string
  wordCount: number
  fileName: string
  fileType: "txt" | "pdf" | "markdown" | "desconocido"
}

/**
 * Extrae el texto de un archivo soportado. Retorna objeto con texto + metadata
 * o lanza un Error si el archivo no es soportado.
 */
export async function extractTextFromFile(file: File): Promise<FileExtractionResult> {
  const name = file.name.toLowerCase()
  const isTxt = name.endsWith(".txt") || file.type === "text/plain"
  const isMd = name.endsWith(".md") || name.endsWith(".markdown") || file.type === "text/markdown"
  const isPdf = name.endsWith(".pdf") || file.type === "application/pdf"

  let text = ""
  let fileType: FileExtractionResult["fileType"] = "desconocido"

  if (isTxt) {
    text = await readFileAsText(file)
    fileType = "txt"
  } else if (isMd) {
    const raw = await readFileAsText(file)
    text = stripMarkdown(raw)
    fileType = "markdown"
  } else if (isPdf) {
    text = await extractTextFromPdf(file)
    fileType = "pdf"
  } else {
    throw new Error(
      `Formato no soportado: "${file.name}". Usa archivos .txt, .md o .pdf. ` +
      `Para DOCX, exporta primero a PDF o copia el texto.`
    )
  }

  const cleaned = text.replace(/\r\n/g, "\n").replace(/\s+$/gm, "").trim()
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length

  return {
    text: cleaned,
    wordCount,
    fileName: file.name,
    fileType,
  }
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"))
    reader.readAsText(file, "utf-8")
  })
}

/**
 * Extrae texto de un PDF usando pdfjs-dist. Se importa dinámicamente para
 * evitar que el bundle server-side intente cargarlo.
 */
async function extractTextFromPdf(file: File): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist")

  // Configurar worker usando una URL de CDN para evitar problemas con el build
  // de Next.js al resolver el .mjs del worker. pdfjs v5 exige el worker igual.
  // Usamos unpkg que siempre tiene la versión recién publicada en npm.
  if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
    const version = pdfjs.version || "5.6.205"
    pdfjs.GlobalWorkerOptions.workerSrc =
      `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`
  }

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise

  const pages: string[] = []
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    const pageText = (content.items as any[])
      .map((item: any) => (typeof item.str === "string" ? item.str : ""))
      .filter(Boolean)
      .join(" ")
    if (pageText.trim()) pages.push(pageText)
  }

  return pages.join("\n\n")
}

function stripMarkdown(md: string): string {
  return md
    // Encabezados
    .replace(/^#{1,6}\s+/gm, "")
    // Negritas/itálicas
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    // Enlaces [texto](url) → texto
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Código inline
    .replace(/`([^`]+)`/g, "$1")
    // Bloques de código triple backtick
    .replace(/```[\s\S]*?```/g, "")
    // Guiones de lista
    .replace(/^\s*[-*+]\s+/gm, "• ")
    // Números de lista
    .replace(/^\s*\d+\.\s+/gm, "")
    .trim()
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-DETECCIÓN DE TIPO DE CONTENIDO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analiza el texto pegado y sugiere qué `tipo` corresponde.
 * Retorna null si no puede inferir con confianza alta.
 */
export function detectContentType(texto: string): NotebookLmTipo | null {
  if (!texto || texto.trim().length < 40) return null

  const lower = texto.toLowerCase()
  // Cuenta frecuencia de palabras clave por categoría
  const scores: Record<NotebookLmTipo, number> = {
    clase_completa: 0,
    rubrica: 0,
    analisis_bloom: 0,
    indicadores: 0,
    evaluacion: 0,
    otro: 0,
  }

  // Clase completa: tiene los 3 momentos
  if (/\binicio\b/.test(lower)) scores.clase_completa += 2
  if (/\bdesarrollo\b/.test(lower)) scores.clase_completa += 2
  if (/\bcierre\b/.test(lower)) scores.clase_completa += 2
  if (/(momentos? de la clase|estructura de la clase)/.test(lower)) scores.clase_completa += 3

  // Rúbrica: criterios + niveles
  if (/\brúbrica\b|\brubrica\b/.test(lower)) scores.rubrica += 5
  if (/(nivel (inicial|intermedio|avanzado|logrado|destacado))/.test(lower)) scores.rubrica += 3
  if (/(criterio de evaluaci[oó]n|criterios? de logro)/.test(lower)) scores.rubrica += 3
  if (/(no logrado|parcialmente logrado|logrado)/.test(lower)) scores.rubrica += 2

  // Análisis Bloom
  if (/taxonom[ií]a de bloom|bloom revisada?/.test(lower)) scores.analisis_bloom += 6
  if (/(recordar|comprender|aplicar|analizar|evaluar|crear).*(nivel|categor)/.test(lower)) scores.analisis_bloom += 2
  if (/(nivel cognitivo|proceso cognitivo)/.test(lower)) scores.analisis_bloom += 2

  // Indicadores
  if (/indicadores? de evaluaci[oó]n/.test(lower)) scores.indicadores += 4
  if (/verbo observable/.test(lower)) scores.indicadores += 3
  if (/(saber|saber hacer|ser):/.test(lower)) scores.indicadores += 2

  // Actividad de evaluación
  if (/actividad de evaluaci[oó]n/.test(lower)) scores.evaluacion += 4
  if (/evaluaci[oó]n formativa/.test(lower)) scores.evaluacion += 2

  // Elegir el máximo, si >= 4 devolver
  let best: NotebookLmTipo | null = null
  let bestScore = 3 // umbral mínimo
  for (const [tipo, score] of Object.entries(scores) as [NotebookLmTipo, number][]) {
    if (score > bestScore) {
      bestScore = score
      best = tipo
    }
  }
  return best
}

// ═══════════════════════════════════════════════════════════════════════════
// PARSING DE DELIMITADORES PARA "FORMATO GUIADO"
// ═══════════════════════════════════════════════════════════════════════════

export interface DelimitedSections {
  inicio?: string
  desarrollo?: string
  cierre?: string
  evaluacion?: string
  rubrica?: string
  bloom?: string
  indicadores?: string
  objetivo?: string
  materiales?: string
  tics?: string
  adecuacion?: string
}

/**
 * Las etiquetas son robustas a variantes comunes. Acepta:
 *   [INICIO]...[/INICIO]
 *   [inicio] ... [/inicio]
 *   [ INICIO ] ... [ /INICIO ]
 */
const TAG_SPECS: Array<{ key: keyof DelimitedSections; tags: string[] }> = [
  { key: "inicio", tags: ["INICIO"] },
  { key: "desarrollo", tags: ["DESARROLLO"] },
  { key: "cierre", tags: ["CIERRE"] },
  { key: "evaluacion", tags: ["EVALUACION", "EVALUACIÓN"] },
  { key: "rubrica", tags: ["RUBRICA", "RÚBRICA"] },
  { key: "bloom", tags: ["BLOOM", "ANALISIS_BLOOM", "ANÁLISIS_BLOOM"] },
  { key: "indicadores", tags: ["INDICADORES"] },
  { key: "objetivo", tags: ["OBJETIVO"] },
  { key: "materiales", tags: ["MATERIALES"] },
  { key: "tics", tags: ["TICS", "TIC"] },
  { key: "adecuacion", tags: ["ADECUACION", "ADECUACIÓN", "DUA"] },
]

/**
 * Intenta extraer secciones delimitadas tipo [INICIO]...[/INICIO] del texto.
 * Devuelve un objeto con solo las secciones detectadas.
 * Si no encuentra ningún delimitador, retorna {} (objeto vacío).
 */
export function extractDelimitedSections(texto: string): DelimitedSections {
  const out: DelimitedSections = {}
  if (!texto) return out

  for (const spec of TAG_SPECS) {
    for (const tag of spec.tags) {
      // Escape para regex (aunque estos tags son alfanuméricos)
      const safeTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const pattern = new RegExp(
        `\\[\\s*${safeTag}\\s*\\]([\\s\\S]*?)\\[\\s*\\/\\s*${safeTag}\\s*\\]`,
        "i"
      )
      const match = texto.match(pattern)
      if (match && match[1]) {
        const content = match[1].trim()
        if (content && !out[spec.key]) {
          out[spec.key] = content
          break
        }
      }
    }
  }
  return out
}

/**
 * ¿El texto contiene al menos una etiqueta delimitada reconocible?
 * Uso: habilitar flujo "formato guiado" automáticamente si el usuario pega
 * algo que sigue el esquema.
 */
export function hasDelimitedFormat(texto: string): boolean {
  const sections = extractDelimitedSections(texto)
  return Object.keys(sections).length > 0
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERADOR DEL BLOQUE DE INSTRUCCIONES "FORMATO GUIADO" PARA NOTEBOOKLM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Texto que se anexa al "Copiar contexto" cuando el usuario activa
 * el modo "Formato guiado". Le dice a NotebookLM cómo estructurar su
 * respuesta con etiquetas para facilitar el parseo posterior.
 */
export function buildFormatoGuiadoInstructions(tipo: NotebookLmTipo): string {
  const etiquetasPorTipo: Record<NotebookLmTipo, string[]> = {
    clase_completa: [
      "[OBJETIVO] … objetivo en texto plano (habilidad + contenido + actitud) … [/OBJETIVO]",
      "[INICIO] … contenido del inicio (~15 min) con activación de conocimientos previos … [/INICIO]",
      "[DESARROLLO] … contenido del desarrollo con estrategias activas … [/DESARROLLO]",
      "[CIERRE] … contenido del cierre con síntesis y ticket de salida … [/CIERRE]",
      "[EVALUACION] … actividad de evaluación formativa … [/EVALUACION]",
      "[INDICADORES] … 3-5 indicadores (saber / saber hacer / ser) … [/INDICADORES]",
      "[MATERIALES] … lista de materiales separados por saltos de línea … [/MATERIALES]",
      "[TICS] … herramientas digitales separadas por saltos de línea … [/TICS]",
      "[ADECUACION] … sugerencias DUA/PIE … [/ADECUACION]",
    ],
    rubrica: [
      "[RUBRICA] … rúbrica con criterios y niveles … [/RUBRICA]",
      "[INDICADORES] … 3-5 indicadores observables derivados de la rúbrica … [/INDICADORES]",
    ],
    analisis_bloom: [
      "[BLOOM] Categoría: recordar | comprender | aplicar | analizar | evaluar | crear",
      "Nivel general: BAJO | MEDIO | ALTO",
      "Justificación: 2-4 oraciones explicando por qué. [/BLOOM]",
    ],
    indicadores: [
      "[INDICADORES] 3-5 indicadores en formato \"verbo observable + contenido + condición\". " +
      "Prefija cada uno con la dimensión: [SABER], [SABER_HACER] o [SER]. [/INDICADORES]",
    ],
    evaluacion: [
      "[EVALUACION] … descripción detallada de una actividad de evaluación formativa, " +
      "concreta y lúdica, alineada al OA … [/EVALUACION]",
    ],
    otro: [
      "Usa las etiquetas que correspondan al contenido que te pedí, eligiendo de esta lista:",
      "[OBJETIVO], [INICIO], [DESARROLLO], [CIERRE], [EVALUACION], [RUBRICA], [BLOOM], [INDICADORES], [MATERIALES], [TICS], [ADECUACION].",
      "Rodea el contenido de cada sección con sus etiquetas de apertura y cierre.",
    ],
  }

  const etiquetas = etiquetasPorTipo[tipo] || etiquetasPorTipo.otro

  return [
    "",
    "══════════════════════════════════════════════════════════════",
    "📋 FORMATO DE RESPUESTA SOLICITADO (muy importante)",
    "══════════════════════════════════════════════════════════════",
    "",
    "Por favor estructura tu respuesta EXACTAMENTE con estas etiquetas",
    "delimitadoras para que yo pueda importarla automáticamente sin copiar",
    "sección por sección:",
    "",
    ...etiquetas.map((linea) => `  ${linea}`),
    "",
    "Reglas:",
    "• Usa las etiquetas tal cual (en mayúsculas, con corchetes).",
    "• No añadas texto fuera de las etiquetas.",
    "• Si una sección no aplica, simplemente omítela.",
    "• Puedes usar negritas/listas DENTRO de cada sección.",
  ].join("\n")
}
