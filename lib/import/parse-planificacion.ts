import mammoth from "mammoth"

export type CampoPlanificacionDestino =
  | "objetivo"
  | "inicio"
  | "desarrollo"
  | "cierre"
  | "materiales"
  | "tics"
  | "oas"
  | "habilidades"
  | "actitudes"
  | "adecuacion"
  | "ignorar"

export interface SeccionPlanificacionParseada {
  titulo: string
  estilo?: string
  contenido_html: string
  campoSugerido: CampoPlanificacionDestino
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
}

export function detectarCampoPlanificacion(titulo: string): CampoPlanificacionDestino {
  const key = titulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

  if (/\boa\b|objetivos de aprendizaje|aprendizajes?/.test(key)) return "oas"
  if (/objetivo|proposito|aprendizaje esperado/.test(key)) return "objetivo"
  if (/inicio|motivacion|activacion|entrada/.test(key)) return "inicio"
  if (/desarrollo|actividad principal|secuencia|procedimiento/.test(key)) return "desarrollo"
  if (/cierre|sintesis|metacog|ticket/.test(key)) return "cierre"
  if (/habilidad/.test(key)) return "habilidades"
  if (/actitud/.test(key)) return "actitudes"
  if (/material|recurso/.test(key)) return "materiales"
  if (/tic|tecnolog|digital/.test(key)) return "tics"
  if (/adecuacion|pie|dua|necesidades|diversidad/.test(key)) return "adecuacion"
  return "ignorar"
}

function parseSectionsFromHtml(html: string): SeccionPlanificacionParseada[] {
  const headingRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi
  const matches = Array.from(html.matchAll(headingRegex))
  if (matches.length === 0) {
    const text = stripHtml(html)
    return text
      ? [{ titulo: "Documento completo", estilo: "body", contenido_html: html, campoSugerido: detectarCampoPlanificacion(text.slice(0, 90)) }]
      : []
  }

  return matches.map((match, index) => {
    const title = stripHtml(match[2]) || `Seccion ${index + 1}`
    const start = (match.index || 0) + match[0].length
    const end = matches[index + 1]?.index ?? html.length
    const content = html.slice(start, end).trim()
    return {
      titulo: title,
      estilo: `Heading ${match[1]}`,
      contenido_html: content || "<p></p>",
      campoSugerido: detectarCampoPlanificacion(title),
    }
  })
}

function parseSectionsFromText(text: string): SeccionPlanificacionParseada[] {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const sections: SeccionPlanificacionParseada[] = []
  let currentTitle = "Documento completo"
  let currentLines: string[] = []

  const flush = () => {
    if (currentLines.length === 0) return
    sections.push({
      titulo: currentTitle,
      estilo: "raw-text",
      contenido_html: `<p>${currentLines.join("</p><p>")}</p>`,
      campoSugerido: detectarCampoPlanificacion(currentTitle),
    })
  }

  lines.forEach(line => {
    const looksLikeHeading = line.length <= 90 && detectarCampoPlanificacion(line) !== "ignorar"
    if (looksLikeHeading && currentLines.length > 0) {
      flush()
      currentTitle = line
      currentLines = []
    } else if (looksLikeHeading && currentTitle === "Documento completo") {
      currentTitle = line
    } else {
      currentLines.push(line)
    }
  })
  flush()
  return sections.length > 0 ? sections : [{
    titulo: "Documento completo",
    estilo: "raw-text",
    contenido_html: `<p>${lines.join("</p><p>")}</p>`,
    campoSugerido: "desarrollo",
  }]
}

export async function parsePlanificacionDocx(buffer: Buffer): Promise<SeccionPlanificacionParseada[]> {
  const htmlResult = await mammoth.convertToHtml(
    { buffer },
    {
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
      ],
    }
  )
  const htmlSections = parseSectionsFromHtml(htmlResult.value)
  if (htmlSections.length > 1) return htmlSections

  const raw = await mammoth.extractRawText({ buffer })
  return parseSectionsFromText(raw.value)
}
