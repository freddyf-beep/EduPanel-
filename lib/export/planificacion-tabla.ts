import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ImageRun,
  AlignmentType,
  Header,
  TableLayoutType,
  VerticalAlignTable,
  PageOrientation,
  convertInchesToTwip,
} from "docx"
import type { ExportData, UnidadExport } from "./planificacion-docx"

// ─────────────────────────────────────────────────────────────────────────────
// Tipos extendidos para el formato tabla
// ─────────────────────────────────────────────────────────────────────────────

export interface UnidadTablaExport extends UnidadExport {
  start?: string                              // "dd/mm/yyyy"
  end?: string                                // "dd/mm/yyyy"
  indicadoresPorOa?: Record<string, string[]> // "OA 01: desc" → ["ind1", "ind2"]
}

export interface EncabezadoExport {
  logoIzqBase64?: string  // data:image/jpeg;base64,...
  textoIzq?: string       // multi-línea con \n
  logoDerBase64?: string
  textoDer?: string
}

export interface ExportDataTabla extends Omit<ExportData, "unidades"> {
  semestre: 1 | 2 | "ambos"
  unidades: UnidadTablaExport[]
  encabezado?: EncabezadoExport
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes de estilo (replicando el formato DOCX subido)
// ─────────────────────────────────────────────────────────────────────────────

const FONT       = "Calibri"
const SIZE_BODY  = 22   // 11pt en half-points
const SIZE_TITLE = 48   // 24pt en half-points
const SIZE_H2    = 28   // 14pt en half-points
const FILL_BLUE  = "DEEBF6"  // color de encabezados de tabla del colegio

// A4 (11906 DXA) - 2 × 1440 DXA de margen = 9026 usable
const PAGE_WIDTH = 15840
const PAGE_HEIGHT = 12240
const PAGE_MARGIN_X = 1417
const PAGE_MARGIN_Y = 1701
const PAGE_HEADER = 708
const USABLE_WIDTH = 12996
const HEADER_SIDE_WIDTH = 3000
const HEADER_CENTER_WIDTH = USABLE_WIDTH - HEADER_SIDE_WIDTH * 2
const HEADER_LOGO_MAX_WIDTH = 76
const HEADER_LOGO_MAX_HEIGHT = 64
const INFO_LABEL_WIDTH = 3539
const INFO_VALUE_WIDTH = USABLE_WIDTH - INFO_LABEL_WIDTH
const OA_WIDTH = 4477
const INDICATORS_WIDTH = 4465
const STRATEGY_WIDTH = USABLE_WIDTH - OA_WIDTH - INDICATORS_WIDTH

const BORDER = {
  top:    { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  left:   { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  right:  { style: BorderStyle.SINGLE, size: 4, color: "000000" },
}

// Bordes invisibles para el encabezado (filas con logos sin marco)
const NO_BORDER = {
  top:    { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
  left:   { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
  right:  { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
}

// Helper: convierte data URI base64 → Uint8Array para ImageRun
function base64ToBytes(dataUri: string): Uint8Array | null {
  if (!dataUri) return null
  const m = dataUri.match(/^data:image\/(\w+);base64,(.+)$/)
  const b64 = m ? m[2] : dataUri
  try {
    if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"))
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

// Detecta tipo de imagen del data URI (jpg | png | gif | bmp). Default: jpg.
function detectImageType(dataUri: string): "jpg" | "png" | "gif" | "bmp" {
  const m = dataUri.match(/^data:image\/(\w+);base64,/)
  const t = m ? m[1].toLowerCase() : "jpeg"
  if (t === "jpeg" || t === "jpg") return "jpg"
  if (t === "png") return "png"
  if (t === "gif") return "gif"
  if (t === "bmp") return "bmp"
  return "jpg"
}

function readUInt16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1]
}

function readUInt16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readUInt32BE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0
}

function readUInt32LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0
}

function getImageDimensions(bytes: Uint8Array, type: "jpg" | "png" | "gif" | "bmp"): { width: number; height: number } | null {
  if (type === "png" && bytes.length >= 24) {
    return { width: readUInt32BE(bytes, 16), height: readUInt32BE(bytes, 20) }
  }

  if (type === "gif" && bytes.length >= 10) {
    return { width: readUInt16LE(bytes, 6), height: readUInt16LE(bytes, 8) }
  }

  if (type === "bmp" && bytes.length >= 26) {
    return { width: readUInt32LE(bytes, 18), height: Math.abs(readUInt32LE(bytes, 22)) }
  }

  if (type === "jpg" && bytes.length >= 4) {
    let offset = 2
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++
        continue
      }

      const marker = bytes[offset + 1]
      const isStartOfFrame =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker)

      const length = readUInt16BE(bytes, offset + 2)
      if (length < 2 || offset + 2 + length > bytes.length) break

      if (isStartOfFrame) {
        return {
          height: readUInt16BE(bytes, offset + 5),
          width: readUInt16BE(bytes, offset + 7),
        }
      }

      offset += 2 + length
    }
  }

  return null
}

function fitImageToHeader(bytes: Uint8Array, type: "jpg" | "png" | "gif" | "bmp"): { width: number; height: number } {
  const dimensions = getImageDimensions(bytes, type)
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    return { width: 60, height: 60 }
  }

  const scale = Math.min(
    HEADER_LOGO_MAX_WIDTH / dimensions.width,
    HEADER_LOGO_MAX_HEIGHT / dimensions.height
  )

  return {
    width: Math.max(1, Math.round(dimensions.width * scale)),
    height: Math.max(1, Math.round(dimensions.height * scale)),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de párrafo
// ─────────────────────────────────────────────────────────────────────────────

function p(text: string, bold = false, size = SIZE_BODY): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: text ?? "", font: FONT, size, bold })],
    spacing: { after: 80 },
  })
}

// Construye el encabezado real de Word (logos + textos a ambos lados)
function buildEncabezado(enc: EncabezadoExport): Header | null {
  const hayContenido =
    enc.logoIzqBase64 || enc.textoIzq?.trim() || enc.logoDerBase64 || enc.textoDer?.trim()
  if (!hayContenido) return null

  const buildSide = (logo?: string, texto?: string): Paragraph[] => {
    const out: Paragraph[] = []
    if (logo) {
      const bytes = base64ToBytes(logo)
      if (bytes) {
        const type = detectImageType(logo)
        const transformation = fitImageToHeader(bytes, type)
        out.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new ImageRun({
            type,
            data: bytes,
            transformation,
          } as any)],
          spacing: { after: 25 },
        }))
      }
    }
    if (texto?.trim()) {
      for (const line of texto.split("\n").map(l => l.trim()).filter(Boolean)) {
        out.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: line, font: FONT, size: 16, bold: true })],
          spacing: { after: 0, line: 200 },
        }))
      }
    }
    if (out.length === 0) out.push(new Paragraph({ children: [new TextRun({ text: "", font: FONT, size: 16 })] }))
    return out
  }

  const headerCellMargins = {
    marginUnitType: WidthType.DXA,
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  }

  const row = new TableRow({
    children: [
      new TableCell({
        children: buildSide(enc.logoIzqBase64, enc.textoIzq),
        borders: NO_BORDER,
        margins: headerCellMargins,
        verticalAlign: VerticalAlignTable.TOP,
        width: { size: HEADER_SIDE_WIDTH, type: WidthType.DXA },
      }),
      new TableCell({
        children: [new Paragraph({ text: "" })],
        borders: NO_BORDER,
        margins: headerCellMargins,
        width: { size: HEADER_CENTER_WIDTH, type: WidthType.DXA },
      }),
      new TableCell({
        children: buildSide(enc.logoDerBase64, enc.textoDer),
        borders: NO_BORDER,
        margins: headerCellMargins,
        verticalAlign: VerticalAlignTable.TOP,
        width: { size: HEADER_SIDE_WIDTH, type: WidthType.DXA },
      }),
    ],
  })

  const headerTable = new Table({
    width: { size: USABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [HEADER_SIDE_WIDTH, HEADER_CENTER_WIDTH, HEADER_SIDE_WIDTH],
    layout: TableLayoutType.FIXED,
    rows: [row],
    borders: {
      top:           NO_BORDER.top,
      bottom:        NO_BORDER.bottom,
      left:          NO_BORDER.left,
      right:         NO_BORDER.right,
      insideHorizontal: NO_BORDER.top,
      insideVertical:   NO_BORDER.left,
    },
  })

  return new Header({
    children: [headerTable],
  })
}

function spacer(): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: "", font: FONT, size: SIZE_BODY })],
    spacing: { after: 200 },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabla 1 — Información de unidad (2 columnas)
// ─────────────────────────────────────────────────────────────────────────────

function tablaInfoUnidad(unidad: UnidadTablaExport, numero: number): Table {
  const labelCell = (text: string) =>
    new TableCell({
      children: [p(text, true)],
      borders: BORDER,
      width: { size: INFO_LABEL_WIDTH, type: WidthType.DXA },
      shading: { fill: FILL_BLUE },
    })

  const valueCell = (text: string) =>
    new TableCell({
      children: [p(text)],
      borders: BORDER,
      width: { size: INFO_VALUE_WIDTH, type: WidthType.DXA },
    })

  // Propósito: descripción limpia del primer OA basal (sin prefijo "OA N:")
  const proposito = unidad.oasBasales.length > 0
    ? unidad.oasBasales[0].replace(/^OA\s*\d+[:\-–]\s*/i, "").trim()
    : ""

  const oft = unidad.oasTransversales.join(" / ")
  const fechas =
    unidad.start && unidad.end
      ? `${unidad.start} – ${unidad.end}`
      : unidad.start || ""

  return new Table({
    width: { size: USABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [INFO_LABEL_WIDTH, INFO_VALUE_WIDTH],
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ children: [labelCell(`Nombre Unidad ${numero}`), valueCell(unidad.nombre)] }),
      new TableRow({ children: [labelCell("Fecha de inicio y término"),  valueCell(fechas)] }),
      new TableRow({ children: [labelCell("Propósito de la unidad"),     valueCell(proposito)] }),
      new TableRow({ children: [labelCell("Conocimientos previos"),      valueCell("")] }),
      new TableRow({ children: [labelCell("Conocimientos a desarrollar"), valueCell("")] }),
      new TableRow({ children: [labelCell("Habilidades"),                 valueCell("")] }),
      new TableRow({ children: [labelCell("Recursos / Materiales"),      valueCell("")] }),
      new TableRow({ children: [labelCell("Vínculo OFT"),                valueCell(oft)] }),
    ],
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabla 2 — Objetivos de Aprendizaje e Indicadores (3 columnas)
// ─────────────────────────────────────────────────────────────────────────────

function tablaObjetivos(unidad: UnidadTablaExport): Table {
  const W1 = OA_WIDTH
  const W2 = INDICATORS_WIDTH
  const W3 = STRATEGY_WIDTH

  const hCell = (text: string, w: number) =>
    new TableCell({
      children: [p(text, true)],
      borders: BORDER,
      width: { size: w, type: WidthType.DXA },
      shading: { fill: FILL_BLUE },
    })

  const dCell = (lines: string[], w: number) =>
    new TableCell({
      children:
        lines.length > 0
          ? lines.map(l => p(l))
          : [p("")],
      borders: BORDER,
      width: { size: w, type: WidthType.DXA },
    })

  const headerRow = new TableRow({
    children: [
      hCell("Objetivos de Aprendizaje", W1),
      hCell("Indicadores de Evaluación", W2),
      hCell("Estrategia de evaluación con ponderación", W3),
    ],
  })

  const dataRows =
    unidad.oasBasales.length > 0
      ? unidad.oasBasales.map(oa =>
          new TableRow({
            children: [
              dCell([oa], W1),
              dCell(unidad.indicadoresPorOa?.[oa] ?? [], W2),
              dCell([], W3),
            ],
          })
        )
      : [
          new TableRow({
            children: [
              new TableCell({
                children: [p("(Sin objetivos definidos)")],
                borders: BORDER,
                width: { size: USABLE_WIDTH, type: WidthType.DXA },
                columnSpan: 3,
              }),
            ],
          }),
        ]

  return new Table({
    width: { size: USABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [W1, W2, W3],
    layout: TableLayoutType.FIXED,
    rows: [headerRow, ...dataRows],
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtrado de unidades por semestre
// ─────────────────────────────────────────────────────────────────────────────

function filtrarPorSemestre(
  unidades: UnidadTablaExport[],
  semestre: 1 | 2 | "ambos"
): UnidadTablaExport[] {
  if (semestre === "ambos") return unidades
  return unidades.filter(u => {
    if (!u.start) return true // sin fecha → incluir siempre
    const parts = u.start.split("/")
    const mes = parseInt(parts[1] ?? "0", 10)
    return semestre === 1 ? mes >= 1 && mes <= 6 : mes >= 7 && mes <= 12
  })
}

function tituloSemestre(semestre: 1 | 2 | "ambos"): string {
  if (semestre === 1) return "PRIMER SEMESTRE"
  if (semestre === 2) return "SEGUNDO SEMESTRE"
  return "ANUAL"
}

// ─────────────────────────────────────────────────────────────────────────────
// Generador principal
// ─────────────────────────────────────────────────────────────────────────────

export function generarPlanificacionTablaDocx(data: ExportDataTabla): Document {
  const semestre = data.semestre ?? "ambos"
  const unidades = filtrarPorSemestre(data.unidades, semestre)
  const year = new Date().getFullYear()

  const children: (Paragraph | Table)[] = []

  const header = data.encabezado ? buildEncabezado(data.encabezado) : null

  // Título principal — centrado, en cursiva, como el formato del colegio
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `PLANIFICACIÓN ${tituloSemestre(semestre)} ${year}`,
          font: FONT,
          size: 24,
          bold: true,
          italics: true,
          color: "4472C4",
        }),
      ],
      border: {
        top: { style: BorderStyle.SINGLE, size: 4, color: "4472C4", space: 10 },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "4472C4", space: 10 },
      },
      indent: { left: 864, right: 864 },
      spacing: { before: 360, after: 360, line: 259 },
    })
  )

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: semestre === 1 ? "SEMESTRE 1:" : semestre === 2 ? "SEMESTRE 2:" : "PLANIFICACIÃ“N ANUAL:",
          font: FONT,
          size: SIZE_BODY,
          bold: true,
        }),
      ],
      spacing: { after: 80 },
    })
  )

  let unidadNum = 1
  for (const u of unidades) {
    // Si el nombre ya empieza con "Unidad", evitar la duplicación
    // Tabla 1 — info
    children.push(tablaInfoUnidad(u, unidadNum))
    children.push(spacer())

    // Tabla 2 — OAs + indicadores
    children.push(tablaObjetivos(u))
    children.push(spacer())
    children.push(spacer())

    unidadNum++
  }

  return new Document({
    sections: [
      {
        headers: header ? { default: header } : undefined,
        properties: {
          page: {
            size: { width: PAGE_HEIGHT, height: PAGE_WIDTH, orientation: PageOrientation.LANDSCAPE },
            margin: {
              top:    PAGE_MARGIN_Y,
              bottom: PAGE_MARGIN_Y,
              left:   PAGE_MARGIN_X,
              right:  PAGE_MARGIN_X,
              header: PAGE_HEADER,
            },
          },
        },
        children,
      },
    ],
  })
}
