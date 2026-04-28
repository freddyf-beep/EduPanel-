import { NextRequest, NextResponse } from "next/server"
import { readFileSync, existsSync } from "fs"
import { join } from "path"
import {
  Document, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, Packer,
  convertInchesToTwip, HeadingLevel, ImageRun,
} from "docx"
import type { RubricaTemplate, EvaluacionRubrica, EstudianteEvaluacion } from "@/lib/rubricas"
import { calcularPuntajeEstudiante, calcularNota as libCalcNota } from "@/lib/rubricas"

// ─── Logo escuela ─────────────────────────────────────────────────────────────
function cargarLogo(logoBase64?: string): Buffer | null {
  // Preferir el logo del perfil del usuario (base64 desde Firestore)
  if (logoBase64) {
    try {
      const base64Data = logoBase64.includes(",") ? logoBase64.split(",")[1] : logoBase64
      return Buffer.from(base64Data, "base64")
    } catch { /* silencioso */ }
  }
  // Fallback: logo del filesystem
  try {
    const logoPath = join(process.cwd(), "public", "logo-escuela.jpg")
    if (existsSync(logoPath)) return readFileSync(logoPath)
  } catch { /* silencioso */ }
  return null
}

// Detecta si un data URL es PNG o JPEG
function detectLogoType(logoBase64?: string): "jpg" | "png" {
  if (logoBase64?.includes("image/png")) return "png"
  return "jpg"
}

function exigenciaEstudiante(est?: Pick<EstudianteEvaluacion, "hasPie">): number {
  return est?.hasPie ? 0.5 : 0.6
}

function calcNota(puntaje: number, max: number, est?: Pick<EstudianteEvaluacion, "hasPie">): number {
  return libCalcNota(puntaje, max, exigenciaEstudiante(est))
}

function calcPuntaje(puntajes: Record<string, number>, partes: RubricaTemplate["partes"]): number {
  return calcularPuntajeEstudiante(puntajes, partes)
}

function safeFilename(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
  return normalized || "rubrica"
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
  const bloques: Paragraph[] = []

  // ── Usar rubrica.oas si existe (lista editable por el profe) ──────────────
  if (rubrica.oas && rubrica.oas.length > 0) {
    const oasSelec = rubrica.oas.filter(o => o.seleccionado)
    const oasRegulares = oasSelec.filter(o => o.tipo !== "oat")
    const oasTransversales = oasSelec.filter(o => o.tipo === "oat")

    if (oasRegulares.length > 0) {
      bloques.push(new Paragraph({
        children: [new TextRun({ text: "Objetivos de Aprendizaje (OA) e Indicadores de Evaluación:", bold: true, size: 20, font: "Calibri" })],
      }))
      for (const oa of oasRegulares) {
        const etiqueta = oa.esPropio ? "OA Propio" : `OA ${oa.numero}`
        bloques.push(new Paragraph({
          children: [
            new TextRun({ text: `${etiqueta}: `, bold: true, size: 18, font: "Calibri" }),
            new TextRun({ text: oa.descripcion, size: 18, font: "Calibri" }),
          ],
        }))
        const indsSelec = oa.indicadores.filter(i => i.seleccionado)
        if (indsSelec.length > 0) {
          bloques.push(new Paragraph({
            children: [new TextRun({ text: `Indicadores: ${indsSelec.map(i => i.texto).join(" ")  }`, size: 17, font: "Calibri", italics: true })],
          }))
        }
      }
      bloques.push(new Paragraph({ text: "" }))
    }

    if (oasTransversales.length > 0) {
      bloques.push(new Paragraph({
        children: [new TextRun({ text: "Objetivos de Aprendizaje de Actitud (OAA) Transversales evaluados:", bold: true, size: 20, font: "Calibri" })],
      }))
      for (const oa of oasTransversales) {
        const etiqueta = oa.esPropio ? "OAA" : `OAA ${oa.numero}`
        bloques.push(new Paragraph({
          children: [
            new TextRun({ text: `${etiqueta}: `, bold: true, size: 18, font: "Calibri" }),
            new TextRun({ text: oa.descripcion, size: 18, font: "Calibri" }),
          ],
        }))
      }
      bloques.push(new Paragraph({ text: "" }))
    }

    return bloques
  }

  // ── Fallback: metadatosCurriculares (sistema anterior) ───────────────────
  const metadatos = rubrica.metadatosCurriculares
  if (!metadatos) return []

  const pushSection = (titulo: string, values: string[]) => {
    if (!values?.length) return
    bloques.push(
      new Paragraph({
        children: [new TextRun({ text: titulo, bold: true, size: 20, font: "Calibri" })],
      })
    )
    values.forEach(value => {
      bloques.push(new Paragraph({
        children: [new TextRun({ text: `• ${value}`, size: 18, font: "Calibri" })],
      }))
    })
    bloques.push(new Paragraph({ text: "" }))
  }

  pushSection("Objetivos de aprendizaje:", metadatos.objetivos)
  pushSection("Indicadores:", metadatos.indicadores)
  pushSection("Objetivos transversales:", metadatos.objetivosTransversales)

  return bloques
}

function cabeceraEscuela(opts: {
  rubrica: RubricaTemplate
  alumnoNombre?: string
  grupoNombre?: string
  profesorNombre?: string
  colegio?: string
  logoBase64?: string
}): (Paragraph | Table)[] {
  const { rubrica, alumnoNombre, grupoNombre, profesorNombre = "", colegio = "", logoBase64 } = opts
  const logo = cargarLogo(logoBase64)
  const logoType = detectLogoType(logoBase64)
  const elementos: (Paragraph | Table)[] = []

  // Logo
  if (logo) {
    elementos.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            data: logo,
            transformation: { width: 68, height: 94 },
            type: logoType,
          }),
        ],
      })
    )
  }

  // Título y escuela
  elementos.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "RÚBRICA DE EVALUACIÓN", bold: true, size: 32, font: "Calibri" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: colegio, bold: true, size: 24, font: "Calibri" })],
    })
  )

  // Profesor + metadata
  const metaLinea1 = profesorNombre ? `Profesor/a: ${profesorNombre}` : ""
  const metaLinea2 = [
    `Asignatura: ${rubrica.asignatura}`,
    `Nivel: ${rubrica.curso}`,
    rubrica.unidadNombre ? `Unidad: ${rubrica.unidadNombre}` : "",
  ].filter(Boolean).join("   ")

  if (metaLinea1) {
    elementos.push(
      new Paragraph({
        children: [new TextRun({ text: metaLinea1, size: 20, font: "Calibri" })],
      })
    )
  }
  elementos.push(
    new Paragraph({
      children: [new TextRun({ text: metaLinea2, size: 20, font: "Calibri" })],
    })
  )

  // Grupo y alumno (si aplica)
  if (alumnoNombre) {
    const grupoTexto = grupoNombre ? `${grupoNombre}   ` : ""
    elementos.push(
      new Paragraph({
        children: [new TextRun({
          text: `${grupoTexto}Nombre: ${alumnoNombre}`,
          bold: true, size: 22, font: "Calibri",
        })],
      })
    )
  }

  elementos.push(new Paragraph({ text: "" }))
  return elementos
}

function generarDocEstudiante(
  rubrica: RubricaTemplate,
  est: EstudianteEvaluacion,
  grupoNombre: string,
  profesorNombre?: string,
  colegio?: string,
  logoBase64?: string
): (Paragraph | Table)[] {
  const puntaje = calcPuntaje(est.puntajes, rubrica.partes)
  const nota = calcNota(puntaje, rubrica.puntajeMaximo, est)

  const elementos: (Paragraph | Table)[] = cabeceraEscuela({
    rubrica,
    alumnoNombre: `${est.nombre}${est.hasPie ? "  [PIE]" : ""}`,
    grupoNombre,
    profesorNombre,
    colegio,
    logoBase64,
  })

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
        new TextRun({ text: `     Exigencia: ${est.hasPie ? "50% PIE" : "60%"}`, size: 18, font: "Calibri" }),
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
    const body: {
      rubrica: RubricaTemplate
      evaluacion: EvaluacionRubrica
      modo?: "grupo" | "alumno" | "listado"
      estudianteId?: string
      profesorNombre?: string
      colegio?: string
      logoBase64?: string
    } = await req.json()
    const { rubrica, evaluacion, modo = "grupo", estudianteId, profesorNombre, colegio, logoBase64 } = body

    const pageMargin = {
      top: convertInchesToTwip(0.8),
      bottom: convertInchesToTwip(0.8),
      left: convertInchesToTwip(0.8),
      right: convertInchesToTwip(0.8),
    }

    // ── Modo "por alumno": generar doc individual ────────────────────────────
    if (modo === "alumno" && estudianteId) {
      let alumnoEst: EstudianteEvaluacion | undefined
      let grupoNombre = ""
      for (const grupo of evaluacion.grupos) {
        const found = grupo.estudiantes.find(e => e.estudianteId === estudianteId)
        if (found) { alumnoEst = found; grupoNombre = grupo.nombre; break }
      }
      if (!alumnoEst) {
        return NextResponse.json({ error: "Alumno no encontrado" }, { status: 404 })
      }
      const elements = generarDocEstudiante(rubrica, alumnoEst, grupoNombre, profesorNombre, colegio, logoBase64)
      const doc = new Document({
        sections: [{ properties: { page: { margin: pageMargin } }, children: elements }],
      })
      const buf = await Packer.toBuffer(doc)
      const filename = `${safeFilename(`rubrica_${alumnoEst.nombre}`)}.docx`
      return new NextResponse(buf, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      })
    }

    // ── Modo "listado": tabla única con todos los alumnos ───────────────────
    if (modo === "listado") {
      const header = cabeceraEscuela({ rubrica, profesorNombre, colegio, logoBase64 })

      // Tabla de alumnos
      const filas: TableRow[] = [
        new TableRow({
          tableHeader: true,
          children: [
            celda("Grupo",      { bold: true, bg: "D9D9D9", width: 20, size: 9 }),
            celda("Alumno",     { bold: true, bg: "D9D9D9", width: 40, size: 9 }),
            celda("PIE",        { bold: true, bg: "D9D9D9", width: 8,  centro: true, size: 9 }),
            celda("Puntaje",    { bold: true, bg: "D9D9D9", width: 17, centro: true, size: 9 }),
            celda("Nota",       { bold: true, bg: "D9D9D9", width: 15, centro: true, size: 9 }),
          ],
        }),
      ]

      for (const grupo of evaluacion.grupos) {
        for (const est of grupo.estudiantes) {
          const pts  = calcPuntaje(est.puntajes, rubrica.partes)
          const nota = calcNota(pts, rubrica.puntajeMaximo, est)
          filas.push(
            new TableRow({
              children: [
                celda(grupo.nombre,                    { width: 20, size: 9 }),
                celda(est.nombre,                      { width: 40, size: 9 }),
                celda(est.hasPie ? "✓" : "",           { width: 8,  centro: true, size: 9 }),
                celda(`${pts} / ${rubrica.puntajeMaximo}`, { width: 17, centro: true, size: 9 }),
                celda(nota.toFixed(1),                 {
                  width: 15, centro: true, bold: true, size: 10,
                  color: nota >= 4.0 ? "375623" : "9C0006",
                }),
              ],
            })
          )
        }
      }

      const tablaListado = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        borders: {
          top:    { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
          left:   { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
          right:  { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
        } as any,
        rows: filas,
      })

      // Totales globales al pie
      const todosLosEst = evaluacion.grupos.flatMap(g => g.estudiantes)
      const promedio = todosLosEst.length
        ? todosLosEst.reduce((sum, e) => {
            const n = calcNota(calcPuntaje(e.puntajes, rubrica.partes), rubrica.puntajeMaximo, e)
            return sum + n
          }, 0) / todosLosEst.length
        : 0
      const aprobados = todosLosEst.filter(e =>
        calcNota(calcPuntaje(e.puntajes, rubrica.partes), rubrica.puntajeMaximo, e) >= 4.0
      ).length

      const resumen = new Paragraph({
        children: [
          new TextRun({ text: `Total: ${todosLosEst.length} alumnos`, size: 18, font: "Calibri" }),
          new TextRun({ text: `   ·   Promedio: ${promedio.toFixed(1)}`, bold: true, size: 18, font: "Calibri" }),
          new TextRun({ text: `   ·   Aprobados: ${aprobados}/${todosLosEst.length}`, size: 18, font: "Calibri" }),
        ],
      })

      const elements = [...header, tablaListado, new Paragraph({ text: "" }), resumen]
      const doc = new Document({
        sections: [{ properties: { page: { margin: pageMargin } }, children: elements }],
      })
      const buf = await Packer.toBuffer(doc)
      const filename = `${safeFilename(`lista_notas_${rubrica.nombre}_${rubrica.curso}`)}.docx`
      return new NextResponse(buf, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      })
    }

    // ── Modo "por grupo" (default) ───────────────────────────────────────────
    const secciones: (Paragraph | Table)[] = [
      ...cabeceraEscuela({ rubrica, profesorNombre, colegio, logoBase64 }),
      ...bloquesCurriculares(rubrica),
    ]

    // Resumen por grupo
    for (const grupo of evaluacion.grupos) {
      if (grupo.estudiantes.length === 0) continue

      secciones.push(
        new Paragraph({
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
            const nota = calcNota(pts, rubrica.puntajeMaximo, est)
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

      // Detalle individual (una rúbrica completa por alumno)
      for (const est of grupo.estudiantes) {
        secciones.push(...generarDocEstudiante(rubrica, est, grupo.nombre, profesorNombre, colegio, logoBase64))
        // Separador visual entre alumnos
        secciones.push(new Paragraph({
          children: [new TextRun({ text: "", break: 1 })],
        }))
      }
    }

    const doc = new Document({
      sections: [{ properties: { page: { margin: pageMargin } }, children: secciones }],
    })

    const buf = await Packer.toBuffer(doc)
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safeFilename(`rubrica_${rubrica.nombre}_grupos`)}.docx"`,
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
