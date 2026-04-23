import { NextRequest, NextResponse } from "next/server"
import {
  Document, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, Packer,
  convertInchesToTwip, HeadingLevel,
} from "docx"
import type { RubricaTemplate, EvaluacionRubrica, EstudianteEvaluacion } from "@/lib/rubricas"
import { calcularPuntajeEstudiante, calcularNota as libCalcNota } from "@/lib/rubricas"

function calcNota(puntaje: number, max: number): number {
  return libCalcNota(puntaje, max)
}

function calcPuntaje(puntajes: Record<string, number>, partes: RubricaTemplate["partes"]): number {
  return calcularPuntajeEstudiante(puntajes, partes)
}

function celda(text: string, opts?: {
  bold?: boolean
  bg?: string
  width?: number
  color?: string
  centro?: boolean
  size?: number
}) {
  return new TableCell({
    shading: opts?.bg ? { fill: opts.bg } : undefined,
    width: opts?.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    children: [
      new Paragraph({
        alignment: opts?.centro ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [
          new TextRun({
            text,
            bold: opts?.bold ?? false,
            color: opts?.color,
            size: (opts?.size ?? 9) * 2,
            font: "Calibri",
          }),
        ],
      }),
    ],
  })
}

function filaCabecera(usaPonderaciones = false): TableRow {
  if (usaPonderaciones) {
    return new TableRow({
      tableHeader: true,
      children: [
        celda("Criterio",               { bold: true, bg: "D9D9D9", width: 20, size: 9 }),
        celda("(4 pts) Logrado",        { bold: true, bg: "C6EFCE", width: 17, size: 9 }),
        celda("(3 pts) Casi logrado",   { bold: true, bg: "BDD7EE", width: 17, size: 9 }),
        celda("(2 pts) Parcialmente",   { bold: true, bg: "FFEB9C", width: 17, size: 9 }),
        celda("(1 pt) Por lograr",      { bold: true, bg: "FFC7CE", width: 17, size: 9 }),
        celda("Pond.",                  { bold: true, bg: "E8D5F5", width: 7, centro: true, size: 9 }),
        celda("Pts",                    { bold: true, bg: "D9D9D9", width: 5, centro: true, size: 9 }),
      ],
    })
  }
  return new TableRow({
    tableHeader: true,
    children: [
      celda("Criterio",               { bold: true, bg: "D9D9D9", width: 22, size: 9 }),
      celda("(4 pts) Logrado",        { bold: true, bg: "C6EFCE", width: 19, size: 9 }),
      celda("(3 pts) Casi logrado",   { bold: true, bg: "BDD7EE", width: 19, size: 9 }),
      celda("(2 pts) Parcialmente",   { bold: true, bg: "FFEB9C", width: 19, size: 9 }),
      celda("(1 pt) Por lograr",      { bold: true, bg: "FFC7CE", width: 19, size: 9 }),
      celda("Pts",                    { bold: true, bg: "D9D9D9", width: 2, centro: true, size: 9 }),
    ],
  })
}

function filaCriterio(
  nombre: string,
  niveles: RubricaTemplate["partes"][0]["criterios"][0]["niveles"],
  ponderacion: number | undefined,
  puntaje: number | undefined,
  usaPonderaciones = false
): TableRow {
  const ptsStr = puntaje !== undefined ? String(puntaje) : ""
  const pondStr = `×${ponderacion ?? 1}`
  if (usaPonderaciones) {
    return new TableRow({
      children: [
        celda(nombre,                                 { width: 20, size: 9 }),
        celda(niveles.logrado.descripcion,            { width: 17, size: 9 }),
        celda(niveles.casiLogrado.descripcion,        { width: 17, size: 9 }),
        celda(niveles.parcialmenteLogrado.descripcion,{ width: 17, size: 9 }),
        celda(niveles.porLograr.descripcion,          { width: 17, size: 9 }),
        celda(pondStr,                                { width: 7, centro: true, bold: true, color: "7B2FBE", size: 9 }),
        celda(ptsStr,                                 { width: 5, centro: true, bold: true, size: 9 }),
      ],
    })
  }
  return new TableRow({
    children: [
      celda(nombre,                          { width: 22, size: 9 }),
      celda(niveles.logrado.descripcion,            { width: 19, size: 9 }),
      celda(niveles.casiLogrado.descripcion,        { width: 19, size: 9 }),
      celda(niveles.parcialmenteLogrado.descripcion,{ width: 19, size: 9 }),
      celda(niveles.porLograr.descripcion,          { width: 19, size: 9 }),
      celda(ptsStr,                          { width: 2, centro: true, bold: true, size: 9 }),
    ],
  })
}

function seccionParte(
  parte: RubricaTemplate["partes"][0],
  usaPonderaciones: boolean,
  puntajes?: Record<string, number>
): (Paragraph | Table)[] {
  const numColumnas = usaPonderaciones ? 7 : 6
  const tabla = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      left:   { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      right:  { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
    } as any,
    rows: [
      // Fila de parte
      new TableRow({
        children: [
          new TableCell({
            columnSpan: numColumnas,
            shading: { fill: "E8E4F3" },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: parte.nombre + (parte.oasVinculados.length ? ` (${parte.oasVinculados.join(", ")})` : ""),
                    bold: true, size: 20, font: "Calibri",
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      filaCabecera(usaPonderaciones),
      ...parte.criterios.map(criterio =>
        filaCriterio(criterio.nombre, criterio.niveles, criterio.ponderacion, puntajes?.[criterio.id], usaPonderaciones)
      ),
    ],
  })

  return [
    new Paragraph({ text: "" }),
    tabla,
  ]
}

// ─── Generar documento por estudiante ─────────────────────────────────────────
function bloquesCurriculares(rubrica: RubricaTemplate): Paragraph[] {
  const metadatos = rubrica.metadatosCurriculares
  if (!metadatos) return []

  const bloques: Paragraph[] = []

  const pushSection = (titulo: string, values: string[]) => {
    if (!values?.length) return
    bloques.push(
      new Paragraph({
        children: [new TextRun({ text: titulo, bold: true, size: 20, font: "Calibri" })],
      })
    )
    values.forEach(value => {
      bloques.push(
        new Paragraph({
          children: [new TextRun({ text: `• ${value}`, size: 18, font: "Calibri" })],
        })
      )
    })
    bloques.push(new Paragraph({ text: "" }))
  }

  pushSection("Objetivos de aprendizaje:", metadatos.objetivos)
  pushSection("Indicadores:", metadatos.indicadores)
  pushSection("Objetivos transversales:", metadatos.objetivosTransversales)

  return bloques
}

function generarDocEstudiante(
  rubrica: RubricaTemplate,
  est: EstudianteEvaluacion,
  grupoNombre: string
): (Paragraph | Table)[] {
  const puntaje = calcPuntaje(est.puntajes, rubrica.partes)
  const nota = calcNota(puntaje, rubrica.puntajeMaximo)

  const elementos: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "RÚBRICA DE EVALUACIÓN", bold: true, size: 32, font: "Calibri" })],
    }),
    new Paragraph({
      children: [new TextRun({
        text: `Asignatura: ${rubrica.asignatura}   Curso: ${rubrica.curso}`,
        size: 20, font: "Calibri",
      })],
    }),
    new Paragraph({
      children: [new TextRun({
        text: `${grupoNombre}   Nombre: ${est.nombre}${est.hasPie ? "  [PIE]" : ""}`,
        bold: true, size: 22, font: "Calibri",
      })],
    }),
    new Paragraph({ text: "" }),
  ]

  elementos.push(...bloquesCurriculares(rubrica))

  for (const parte of rubrica.partes) {
    elementos.push(...seccionParte(parte, rubrica.usaPonderaciones ?? false, est.puntajes))
  }

  // Totales
  elementos.push(
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [
        new TextRun({ text: `Puntaje total: `, bold: true, size: 22, font: "Calibri" }),
        new TextRun({ text: `${puntaje} / ${rubrica.puntajeMaximo}`, size: 22, font: "Calibri" }),
        new TextRun({ text: `     Nota Final: `, bold: true, size: 22, font: "Calibri" }),
        new TextRun({ text: nota.toFixed(1), bold: true, size: 24, font: "Calibri",
          color: nota >= 4.0 ? "375623" : "9C0006" }),
      ],
    }),
  )

  if (est.observaciones) {
    elementos.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Observaciones: ", bold: true, size: 20, font: "Calibri" }),
          new TextRun({ text: est.observaciones, size: 20, font: "Calibri" }),
        ],
      })
    )
  }

  return elementos
}

// ─── POST /api/export-rubrica ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { rubrica, evaluacion }: { rubrica: RubricaTemplate; evaluacion: EvaluacionRubrica } = await req.json()

    const secciones: (Paragraph | Table)[] = [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: rubrica.nombre, bold: true, size: 36, font: "Calibri" })],
      }),
      new Paragraph({
        children: [new TextRun({
          text: `${rubrica.asignatura} · ${rubrica.curso} · ${rubrica.puntajeMaximo} pts máx`,
          size: 22, font: "Calibri", italics: true,
        })],
      }),
      new Paragraph({ text: "" }),
    ]

    secciones.push(...bloquesCurriculares(rubrica))

    // Resumen por grupo
    for (const grupo of evaluacion.grupos) {
      if (grupo.estudiantes.length === 0) continue

      secciones.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: grupo.nombre, bold: true, size: 28, font: "Calibri" })],
        }),
        new Paragraph({ text: "" }),
      )

      // Tabla resumen del grupo
      const tablaResumen = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              celda("Alumno",   { bold: true, bg: "D9D9D9", width: 40, size: 9 }),
              celda("Puntaje",  { bold: true, bg: "D9D9D9", width: 20, centro: true, size: 9 }),
              celda("Nota",     { bold: true, bg: "D9D9D9", width: 15, centro: true, size: 9 }),
              celda("Estado",   { bold: true, bg: "D9D9D9", width: 25, centro: true, size: 9 }),
            ],
          }),
          ...grupo.estudiantes.map(est => {
            const pts = calcPuntaje(est.puntajes, rubrica.partes)
            const nota = calcNota(pts, rubrica.puntajeMaximo)
            return new TableRow({
              children: [
                celda(est.nombre + (est.hasPie ? " [PIE]" : ""), { width: 40, size: 9 }),
                celda(`${pts}/${rubrica.puntajeMaximo}`,          { width: 20, centro: true, size: 9 }),
                celda(nota.toFixed(1),  { width: 15, centro: true, bold: true, size: 9,
                  color: nota >= 4.0 ? "375623" : "9C0006" }),
                celda(est.completado ? "Completo" : "Incompleto", { width: 25, centro: true, size: 9 }),
              ],
            })
          }),
        ],
      })

      secciones.push(tablaResumen, new Paragraph({ text: "" }))

      // Detalle individual
      for (const est of grupo.estudiantes) {
        secciones.push(...generarDocEstudiante(rubrica, est, grupo.nombre))
        secciones.push(new Paragraph({
          pageBreakBefore: false,
          children: [new TextRun({ text: "", break: 1 })],
        }))
      }
    }

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.8),
              bottom: convertInchesToTwip(0.8),
              left: convertInchesToTwip(0.8),
              right: convertInchesToTwip(0.8),
            },
          },
        },
        children: secciones,
      }],
    })

    const buf = await Packer.toBuffer(doc)
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="rubrica_${rubrica.nombre}.docx"`,
      },
    })
  } catch (err) {
    console.error("[export-rubrica]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al generar Word" },
      { status: 500 }
    )
  }
}
