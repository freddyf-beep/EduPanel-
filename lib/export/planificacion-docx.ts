import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  WidthType,
  BorderStyle,
  Packer,
  convertInchesToTwip,
  LevelFormat,
  NumberFormat,
} from "docx"

// ---------------------------------------------------------------------------
// Tipos de datos para la exportación
// ---------------------------------------------------------------------------

export interface ClaseExport {
  numero: number
  oasOcupados: string[]        // ["OA 01: Descripción...", ...]
  indicadores: string[]
  objetivo: string
  inicio: string
  actividadInicio: string
  desarrollo: string           // plain text (ya sin HTML)
  cierre: string
  recursos: string[]
  tics: string[]
  criteriosEvaluacion?: Array<{
    criterio: string
    logrado: string
    parcial: string
    proximo: string
  }>
}

export interface UnidadExport {
  numero: number
  nombre: string
  oasBasales: string[]         // ["MU02 OA 01: Descripción...", ...]
  oasComplementarios: string[]
  clases: ClaseExport[]
}

export interface ExportData {
  nivel: string                // "4to Básico"
  asignatura: string           // "Música"
  unidades: UnidadExport[]
}

// ---------------------------------------------------------------------------
// Helpers de estilo (replicando el formato del documento de Freddy)
// ---------------------------------------------------------------------------

const FONT = "Calibri"
const FONT_SIZE = 22       // half-points → 11pt
const FONT_SIZE_TITLE = 112 // half-points → 56pt

const CELL_BORDER = {
  top:    { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  left:   { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  right:  { style: BorderStyle.SINGLE, size: 4, color: "000000" },
}

// Párrafo con estilo "Subtitle" (cuerpo principal del documento de referencia)
function subtitle(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: FONT_SIZE })],
    spacing: { after: 160, line: 259 },
  })
}

// Párrafo vacío (separador)
function spacer(): Paragraph {
  return subtitle("")
}

// Elemento de lista con bullet "-"
function listItem(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: FONT_SIZE })],
    bullet: { level: 0 },
    spacing: { after: 80, line: 259 },
  })
}

// Sección encabezada (negrita, como los labels del documento)
function sectionHeader(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: FONT_SIZE, bold: true })],
    spacing: { after: 80, line: 259 },
  })
}

function unidadTitle(unidad: UnidadExport): string {
  const nombre = (unidad.nombre || "").trim()
  if (/^unidad\b/i.test(nombre)) return nombre
  return `Unidad ${unidad.numero} — ${nombre || "Sin nombre"}`
}

// Tabla de rúbrica de evaluación
function rubricTable(
  criterios: Array<{ criterio: string; logrado: string; parcial: string; proximo: string }>
): Table {
  const COL_WIDTH = 2207 // DXA (~1.5 inches)

  const headerRow = new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: "Criterios / Niveles", font: FONT, size: FONT_SIZE, bold: true })] })],
        borders: CELL_BORDER,
        width: { size: COL_WIDTH, type: WidthType.DXA },
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: "(4 pts) Logrado", font: FONT, size: FONT_SIZE, bold: true })] })],
        borders: CELL_BORDER,
        width: { size: COL_WIDTH, type: WidthType.DXA },
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: "(3 pts) Parcialmente Logrado", font: FONT, size: FONT_SIZE, bold: true })] })],
        borders: CELL_BORDER,
        width: { size: COL_WIDTH, type: WidthType.DXA },
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: "(2 pts) Próximo a Lograr", font: FONT, size: FONT_SIZE, bold: true })] })],
        borders: CELL_BORDER,
        width: { size: COL_WIDTH, type: WidthType.DXA },
      }),
    ],
  })

  const dataRows = criterios.map(c =>
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: c.criterio, font: FONT, size: FONT_SIZE })] })], borders: CELL_BORDER, width: { size: COL_WIDTH, type: WidthType.DXA } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: c.logrado,  font: FONT, size: FONT_SIZE })] })], borders: CELL_BORDER, width: { size: COL_WIDTH, type: WidthType.DXA } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: c.parcial,  font: FONT, size: FONT_SIZE })] })], borders: CELL_BORDER, width: { size: COL_WIDTH, type: WidthType.DXA } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: c.proximo,  font: FONT, size: FONT_SIZE })] })], borders: CELL_BORDER, width: { size: COL_WIDTH, type: WidthType.DXA } }),
      ],
    })
  )

  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 8828, type: WidthType.DXA },
  })
}

// ---------------------------------------------------------------------------
// Generador principal
// ---------------------------------------------------------------------------

export function generarPlanificacionDocx(data: ExportData): Document {
  const children: (Paragraph | Table)[] = []

  // Título principal
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Planificaciones ${data.nivel}`,
          font: FONT,
          size: FONT_SIZE_TITLE,
          bold: true,
        }),
      ],
      heading: HeadingLevel.TITLE,
      spacing: { before: 0, after: 0 },
    })
  )
  children.push(spacer())

  // Por cada unidad
  for (const unidad of data.unidades) {
    children.push(subtitle(unidadTitle(unidad)))
    children.push(spacer())

    // Objetivos basales
    children.push(sectionHeader("Objetivos basales:"))
    if (unidad.oasBasales.length > 0) {
      for (const oa of unidad.oasBasales) children.push(listItem(oa))
    } else {
      children.push(subtitle("(Sin objetivos basales definidos)"))
    }
    children.push(spacer())

    // Complementarios
    children.push(sectionHeader("Complementarios:"))
    if (unidad.oasComplementarios.length > 0) {
      for (const oa of unidad.oasComplementarios) children.push(listItem(oa))
    } else {
      children.push(subtitle("(Sin objetivos complementarios definidos)"))
    }
    children.push(spacer())

    // Por cada clase
    for (const clase of unidad.clases) {
      children.push(sectionHeader(`Clase ${String(clase.numero).padStart(2, "0")}`))
      children.push(spacer())

      // Objetivos de aprendizaje ocupados
      children.push(sectionHeader("Objetivos aprendizajes ocupados:"))
      if (clase.oasOcupados.length > 0) {
        for (const oa of clase.oasOcupados) children.push(listItem(oa))
      } else {
        children.push(subtitle("(No especificados)"))
      }
      children.push(spacer())

      // Indicadores de evaluación
      children.push(sectionHeader("Indicadores de evaluación utilizados:"))
      if (clase.indicadores.length > 0) {
        for (const ind of clase.indicadores) children.push(listItem(ind))
      } else {
        children.push(subtitle("(No especificados)"))
      }
      children.push(spacer())

      // Objetivo de la clase
      children.push(sectionHeader("Objetivo de la clase"))
      children.push(subtitle(clase.objetivo || "(Sin objetivo definido)"))
      children.push(spacer())

      // Inicio de clase
      children.push(sectionHeader("Inicio de clase:"))
      children.push(subtitle(clase.inicio || "(Sin registro)"))
      children.push(spacer())

      // Actividad de inicio
      if (clase.actividadInicio) {
        children.push(sectionHeader("Actividad de inicio:"))
        children.push(subtitle(clase.actividadInicio))
        children.push(spacer())
      }

      // Desarrollo
      children.push(sectionHeader("Desarrollo:"))
      if (clase.desarrollo) {
        // Dividir en párrafos por saltos de línea
        const parrafos = clase.desarrollo.split(/\n+/).filter(p => p.trim())
        for (const parrafo of parrafos) {
          children.push(subtitle(parrafo.trim()))
        }
      } else {
        children.push(subtitle("(Sin registro)"))
      }
      children.push(spacer())

      // Cierre
      children.push(sectionHeader("Cierre:"))
      children.push(subtitle(clase.cierre || "(Sin registro)"))
      children.push(spacer())

      // Recursos ocupados
      children.push(sectionHeader("Recursos ocupados:"))
      const todosRecursos = [...(clase.recursos || []), ...(clase.tics || [])]
      if (todosRecursos.length > 0) {
        for (const recurso of todosRecursos) children.push(listItem(recurso))
      } else {
        children.push(subtitle("(Sin materiales especificados)"))
      }
      children.push(spacer())

      // Evaluación (rúbrica)
      if (clase.criteriosEvaluacion && clase.criteriosEvaluacion.length > 0) {
        children.push(sectionHeader("Evaluación:"))
        children.push(spacer())
        children.push(rubricTable(clase.criteriosEvaluacion))
        children.push(spacer())
      }

      children.push(spacer())
    }

    children.push(spacer())
  }

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4 en DXA
            margin: {
              top:    convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left:   convertInchesToTwip(1),
              right:  convertInchesToTwip(1),
            },
          },
        },
        children,
      },
    ],
  })
}

// ---------------------------------------------------------------------------
// Utilidades: convertir HTML de Quill a texto plano
// ---------------------------------------------------------------------------

export function htmlToPlainTextForExport(html: string): string {
  if (!html) return ""
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rsquo;/g, "’")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
