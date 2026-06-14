import { NextRequest, NextResponse } from "next/server"
import {
  AlignmentType,
  BorderStyle,
  convertInchesToTwip,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx"
import { verifyAllowedUser } from "@/lib/auth/verify-token"
import {
  calcularNotaLista,
  calcularPuntajeLista,
  getIndicadoresLista,
  type EstudianteListaCotejo,
  type ListaCotejoEvaluacion,
  type ListaCotejoTemplate,
} from "@/lib/listas-cotejo"

type ExportModo = "grupo" | "alumno" | "listado"

function safeFilename(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
  return normalized || "lista_cotejo"
}

function isValidListaPayload(value: unknown): value is ListaCotejoTemplate {
  const lista = value as ListaCotejoTemplate | undefined
  return Boolean(
    lista &&
    typeof lista.nombre === "string" &&
    typeof lista.asignatura === "string" &&
    typeof lista.curso === "string" &&
    typeof lista.puntajeMaximo === "number" &&
    Array.isArray(lista.secciones) &&
    lista.secciones.every(seccion => seccion && Array.isArray(seccion.indicadores))
  )
}

function isValidEvaluacionPayload(value: unknown): value is ListaCotejoEvaluacion {
  const evaluacion = value as ListaCotejoEvaluacion | undefined
  return Boolean(
    evaluacion &&
    Array.isArray(evaluacion.grupos) &&
    evaluacion.grupos.every(grupo => grupo && Array.isArray(grupo.estudiantes))
  )
}

function exigenciaEstudiante(estudiante: Pick<EstudianteListaCotejo, "hasPie">): number {
  return estudiante.hasPie ? 0.5 : 0.6
}

function puntajeEstudiante(estudiante: EstudianteListaCotejo, lista: ListaCotejoTemplate): number {
  return estudiante.puntaje ?? calcularPuntajeLista(estudiante.respuestas || {}, lista)
}

function notaEstudiante(estudiante: EstudianteListaCotejo, lista: ListaCotejoTemplate): number {
  return estudiante.nota ?? calcularNotaLista(
    puntajeEstudiante(estudiante, lista),
    lista.puntajeMaximo,
    exigenciaEstudiante(estudiante)
  )
}

function cargarLogo(logoBase64?: string): Buffer | null {
  if (logoBase64) {
    try {
      const base64Data = logoBase64.includes(",") ? logoBase64.split(",")[1] : logoBase64
      return Buffer.from(base64Data, "base64")
    } catch { return null }
  }
  return null
}

function detectLogoType(logoBase64?: string): "jpg" | "png" {
  if (logoBase64?.includes("image/png")) return "png"
  return "jpg"
}

// Paleta del documento: grises suaves y pasteles sutiles para Si/No
const COLOR_TEXTO = "262626"
const COLOR_GRIS = "595959"
const COLOR_VERDE = "375623"
const COLOR_ROJO = "9C0006"
const COLOR_AMBAR = "9C5700"
const BG_GRIS = "F2F2F2"
const BG_VERDE = "E2EFDA"
const BG_ROJO = "FBE4E4"
const BORDE = "CFCFCF"

const bordesTabla = {
  top: { style: BorderStyle.SINGLE, size: 4, color: BORDE },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDE },
  left: { style: BorderStyle.SINGLE, size: 4, color: BORDE },
  right: { style: BorderStyle.SINGLE, size: 4, color: BORDE },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: BORDE },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: BORDE },
}

// Separador mínimo entre bloques (evita que dos tablas contiguas se fusionen)
function espaciador(): Paragraph {
  return new Paragraph({
    spacing: { before: 0, after: 0 },
    children: [new TextRun({ text: "", size: 6, font: "Calibri" })],
  })
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
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({
        alignment: opts?.centro ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { before: 0, after: 0 },
        children: [
          new TextRun({
            text,
            bold: opts?.bold ?? false,
            color: opts?.color ?? COLOR_TEXTO,
            size: (opts?.size ?? 9) * 2,
            font: "Calibri",
          }),
        ],
      }),
    ],
  })
}

function paragraph(text: string, opts?: {
  bold?: boolean
  size?: number
  center?: boolean
  color?: string
  spaceBefore?: number
  spaceAfter?: number
  pageBreak?: boolean
}) {
  return new Paragraph({
    alignment: opts?.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    pageBreakBefore: opts?.pageBreak ?? false,
    spacing: { before: opts?.spaceBefore ?? 0, after: opts?.spaceAfter ?? 40 },
    children: [
      new TextRun({
        text,
        bold: opts?.bold ?? false,
        color: opts?.color ?? COLOR_TEXTO,
        size: (opts?.size ?? 10) * 2,
        font: "Calibri",
      }),
    ],
  })
}

function cabeceraLista(opts: {
  lista: ListaCotejoTemplate
  alumnoNombre?: string
  grupoNombre?: string
  profesorNombre?: string
  colegio?: string
  logoBase64?: string
  pageBreak?: boolean
}) {
  const { lista, alumnoNombre, grupoNombre, profesorNombre = "", colegio = "", logoBase64, pageBreak = false } = opts
  const logo = cargarLogo(logoBase64)
  const logoType = detectLogoType(logoBase64)
  const children: (Paragraph | Table)[] = []

  if (logo) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      pageBreakBefore: pageBreak,
      spacing: { before: 0, after: 40 },
      children: [new ImageRun({ data: logo, transformation: { width: 68, height: 68 }, type: logoType })],
    }))
  }

  if (colegio) {
    children.push(paragraph(colegio, { bold: true, size: 9, center: true, color: COLOR_GRIS, pageBreak: pageBreak && !logo, spaceAfter: 20 }))
  }
  children.push(
    paragraph("LISTA DE COTEJO", { bold: true, size: 14, center: true, pageBreak: pageBreak && !colegio && !logo, spaceAfter: 20 }),
    paragraph(lista.nombre || "Lista de cotejo", { bold: true, size: 12, center: true, color: COLOR_GRIS, spaceAfter: 60 })
  )

  const metaTexto = [
    `Asignatura: ${lista.asignatura}`,
    `Curso: ${lista.curso}`,
    lista.unidadNombre ? `Unidad: ${lista.unidadNombre}` : "",
    profesorNombre ? `Profesor/a: ${profesorNombre}` : "",
  ].filter(Boolean).join("    |    ")

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: alumnoNombre ? 80 : 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BORDE, space: 4 } },
    children: [new TextRun({ text: metaTexto, size: 9 * 2, color: COLOR_GRIS, font: "Calibri" })],
  }))

  if (alumnoNombre) {
    children.push(new Paragraph({
      shading: { fill: BG_GRIS },
      spacing: { before: 0, after: 120 },
      children: [
        new TextRun({ text: `Estudiante: ${alumnoNombre}`, bold: true, size: 11 * 2, color: COLOR_TEXTO, font: "Calibri" }),
        ...(grupoNombre
          ? [new TextRun({ text: `    ·    ${grupoNombre}`, size: 10 * 2, color: COLOR_GRIS, font: "Calibri" })]
          : []),
      ],
    }))
  }
  return children
}

function bloquesCurriculares(lista: ListaCotejoTemplate): Paragraph[] {
  const bloques: Paragraph[] = []

  if (lista.oas?.length) {
    const seleccionados = lista.oas.filter(oa => oa.seleccionado)
    const regulares = seleccionados.filter(oa => oa.tipo !== "oat")
    const transversales = seleccionados.filter(oa => oa.tipo === "oat")

    if (regulares.length) {
      bloques.push(paragraph("Objetivos de Aprendizaje e indicadores:", { bold: true, size: 10, spaceAfter: 20 }))
      regulares.forEach(oa => {
        const etiqueta = oa.esPropio ? "OA propio" : `OA ${oa.numero}`
        bloques.push(paragraph(`${etiqueta}: ${oa.descripcion}`, { size: 9, spaceAfter: 20 }))
        const indicadores = oa.indicadores.filter(ind => ind.seleccionado).map(ind => ind.texto)
        if (indicadores.length) bloques.push(paragraph(`Indicadores: ${indicadores.join(" ")}`, { size: 8, color: COLOR_GRIS, spaceAfter: 20 }))
      })
    }

    if (transversales.length) {
      bloques.push(paragraph("Objetivos de Aprendizaje de Actitud:", { bold: true, size: 10, spaceBefore: 60, spaceAfter: 20 }))
      transversales.forEach(oa => {
        const etiqueta = oa.esPropio ? "OAA" : `OAA ${oa.numero}`
        bloques.push(paragraph(`${etiqueta}: ${oa.descripcion}`, { size: 9, spaceAfter: 20 }))
      })
    }
    return bloques
  }

  const metadatos = lista.metadatosCurriculares
  if (!metadatos) return bloques

  const pushSection = (titulo: string, values: string[]) => {
    if (!values?.length) return
    bloques.push(paragraph(titulo, { bold: true, size: 10, spaceBefore: bloques.length ? 60 : 0, spaceAfter: 20 }))
    values.forEach(value => bloques.push(paragraph(`- ${value}`, { size: 9, spaceAfter: 20 })))
  }

  pushSection("Objetivos de aprendizaje:", metadatos.objetivos)
  pushSection("Indicadores:", metadatos.indicadores)
  pushSection("Objetivos transversales:", metadatos.objetivosTransversales)
  return bloques
}

function tablaLista(lista: ListaCotejoTemplate, respuestas?: Record<string, boolean>): Table {
  const escala = lista.escalaDicotomica || ["Si", "No"]
  const rows: TableRow[] = [
    new TableRow({
      children: [
        celda("Sección", { bold: true, bg: BG_GRIS, width: 16 }),
        celda("Indicador observable", { bold: true, bg: BG_GRIS, width: 50 }),
        celda(escala[0], { bold: true, bg: BG_VERDE, width: 8, centro: true, color: COLOR_VERDE }),
        celda(escala[1], { bold: true, bg: BG_ROJO, width: 8, centro: true, color: COLOR_ROJO }),
        celda("Notas / DUA", { bold: true, bg: BG_GRIS, width: 18 }),
      ],
    }),
  ]

  lista.secciones.forEach(seccion => {
    seccion.indicadores.forEach((indicador, idx) => {
      const respuesta = respuestas?.[indicador.id]
      rows.push(new TableRow({
        children: [
          celda(idx === 0 ? seccion.nombre : "", { width: 16, bold: idx === 0, size: 8.5, color: COLOR_GRIS }),
          celda(indicador.texto, { width: 50 }),
          celda(respuesta === true ? "X" : "", { width: 8, centro: true, bold: true, color: COLOR_VERDE }),
          celda(respuesta === false ? "X" : "", { width: 8, centro: true, bold: true, color: COLOR_ROJO }),
          celda([
            indicador.esTransversal ? "OAT" : "",
            indicador.focoDiferenciadoActivo ? `DUA: ${indicador.focoDiferenciadoTexto || "canal alternativo"}` : "",
          ].filter(Boolean).join(" | "), { width: 18, size: 8, color: COLOR_GRIS }),
        ],
      }))
    })
  })

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: bordesTabla,
    rows,
  })
}

function resumenEstudiante(lista: ListaCotejoTemplate, estudiante: EstudianteListaCotejo): Table {
  const puntaje = puntajeEstudiante(estudiante, lista)
  const nota = notaEstudiante(estudiante, lista)
  const aprobado = nota >= 4
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: bordesTabla,
    rows: [
      new TableRow({
        children: [
          celda(`Puntaje: ${puntaje} / ${lista.puntajeMaximo}`, { bold: true, bg: BG_GRIS, width: 34, centro: true, size: 10 }),
          celda(`Nota final: ${nota.toFixed(1)}`, {
            bold: true,
            bg: aprobado ? BG_VERDE : BG_ROJO,
            color: aprobado ? COLOR_VERDE : COLOR_ROJO,
            width: 33,
            centro: true,
            size: 11,
          }),
          celda(`Exigencia: ${estudiante.hasPie ? "50% (PIE)" : "60%"}`, { bold: true, bg: BG_GRIS, width: 33, centro: true, size: 10 }),
        ],
      }),
    ],
  })
}

function generarDocEstudiante(
  lista: ListaCotejoTemplate,
  estudiante: EstudianteListaCotejo,
  grupoNombre: string,
  profesorNombre?: string,
  colegio?: string,
  pageBreak = false,
  logoBase64?: string
): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [
    ...cabeceraLista({
      lista,
      alumnoNombre: `${estudiante.nombre}${estudiante.hasPie ? " [PIE]" : ""}`,
      grupoNombre,
      profesorNombre,
      colegio,
      logoBase64,
      pageBreak,
    }),
    ...bloquesCurriculares(lista),
    espaciador(),
    tablaLista(lista, estudiante.respuestas),
    espaciador(),
    resumenEstudiante(lista, estudiante),
  ]

  if (estudiante.observaciones) {
    children.push(paragraph(`Observaciones: ${estudiante.observaciones}`, { size: 9, color: COLOR_GRIS, spaceBefore: 80 }))
  }
  return children
}

function tablaListado(lista: ListaCotejoTemplate, evaluacion: ListaCotejoEvaluacion): Table {
  const rows: TableRow[] = [
    new TableRow({
      children: [
        celda("Grupo", { bold: true, bg: BG_GRIS, width: 16 }),
        celda("Estudiante", { bold: true, bg: BG_GRIS, width: 32 }),
        celda("PIE", { bold: true, bg: BG_GRIS, width: 8, centro: true }),
        celda("Puntaje", { bold: true, bg: BG_GRIS, width: 14, centro: true }),
        celda("%", { bold: true, bg: BG_GRIS, width: 8, centro: true }),
        celda("Nota", { bold: true, bg: BG_GRIS, width: 8, centro: true }),
        celda("Estado", { bold: true, bg: BG_GRIS, width: 14, centro: true }),
      ],
    }),
  ]

  evaluacion.grupos.forEach(grupo => {
    grupo.estudiantes.forEach(estudiante => {
      const puntaje = puntajeEstudiante(estudiante, lista)
      const nota = notaEstudiante(estudiante, lista)
      rows.push(new TableRow({
        children: [
          celda(grupo.nombre, { width: 16, size: 8.5, color: COLOR_GRIS }),
          celda(estudiante.nombre, { width: 32 }),
          celda(estudiante.hasPie ? "Si" : "", { width: 8, centro: true }),
          celda(`${puntaje}/${lista.puntajeMaximo}`, { width: 14, centro: true }),
          celda(`${estudiante.porcentaje ?? 0}%`, { width: 8, centro: true }),
          celda(nota.toFixed(1), { width: 8, centro: true, bold: true, color: nota >= 4 ? COLOR_VERDE : COLOR_ROJO }),
          celda(estudiante.completado ? "Completo" : "Incompleto", {
            width: 14,
            centro: true,
            size: 8.5,
            color: estudiante.completado ? COLOR_VERDE : COLOR_AMBAR,
          }),
        ],
      }))
    })
  })

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: bordesTabla, rows })
}

function resumenGlobal(lista: ListaCotejoTemplate, evaluacion: ListaCotejoEvaluacion): Paragraph {
  const estudiantes = evaluacion.grupos.flatMap(grupo => grupo.estudiantes)
  const promedio = estudiantes.length
    ? estudiantes.reduce((sum, est) => sum + notaEstudiante(est, lista), 0) / estudiantes.length
    : 0
  const aprobados = estudiantes.filter(est => notaEstudiante(est, lista) >= 4).length
  return paragraph(
    `Total: ${estudiantes.length} estudiantes    |    Promedio: ${promedio.toFixed(1)}    |    Aprobados: ${aprobados}/${estudiantes.length}`,
    { bold: true, size: 10, spaceBefore: 120 }
  )
}

export async function POST(req: NextRequest) {
  const authCheck = await verifyAllowedUser(req)
  if (!authCheck.ok) return authCheck.response

  try {
    const body = await req.json().catch(() => null) as {
      lista?: ListaCotejoTemplate
      evaluacion?: ListaCotejoEvaluacion
      modo?: ExportModo
      estudianteId?: string
      profesorNombre?: string
      colegio?: string
      logoBase64?: string
    } | null

    if (!body) return NextResponse.json({ error: "Datos invalidos" }, { status: 400 })

    const { lista, evaluacion, modo = "grupo", estudianteId, profesorNombre, colegio, logoBase64 } = body
    if (!isValidListaPayload(lista)) return NextResponse.json({ error: "Lista invalida" }, { status: 400 })
    if (!isValidEvaluacionPayload(evaluacion)) return NextResponse.json({ error: "Evaluacion invalida" }, { status: 400 })

    const pageMargin = {
      top: convertInchesToTwip(0.5),
      bottom: convertInchesToTwip(0.5),
      left: convertInchesToTwip(0.5),
      right: convertInchesToTwip(0.5),
    }

    let children: (Paragraph | Table)[]
    let filename = `${safeFilename(`lista_cotejo_${lista.nombre}_${lista.curso}`)}.docx`

    if (modo === "alumno" && estudianteId) {
      let estudianteEncontrado: EstudianteListaCotejo | undefined
      let grupoNombre = ""
      for (const grupo of evaluacion.grupos) {
        const encontrado = grupo.estudiantes.find(estudiante => estudiante.estudianteId === estudianteId)
        if (encontrado) {
          estudianteEncontrado = encontrado
          grupoNombre = grupo.nombre
          break
        }
      }
      if (!estudianteEncontrado) {
        return NextResponse.json({ error: "Estudiante no encontrado" }, { status: 404 })
      }
      children = generarDocEstudiante(lista, estudianteEncontrado, grupoNombre, profesorNombre, colegio, false, logoBase64)
      filename = `${safeFilename(`lista_cotejo_${estudianteEncontrado.nombre}`)}.docx`
    } else if (modo === "listado") {
      children = [
        ...cabeceraLista({ lista, profesorNombre, colegio, logoBase64 }),
        tablaListado(lista, evaluacion),
        resumenGlobal(lista, evaluacion),
      ]
      filename = `${safeFilename(`lista_notas_${lista.nombre}_${lista.curso}`)}.docx`
    } else {
      children = [
        ...cabeceraLista({ lista, profesorNombre, colegio, logoBase64 }),
        ...bloquesCurriculares(lista),
        paragraph(`Indicadores: ${getIndicadoresLista(lista).length}`, { bold: true, size: 10, spaceBefore: 60 }),
      ]

      evaluacion.grupos.forEach(grupo => {
        if (grupo.estudiantes.length === 0) return
        children.push(
          paragraph(grupo.nombre, { bold: true, size: 13, spaceBefore: 160, spaceAfter: 60 }),
          tablaListado(lista, { ...evaluacion, grupos: [grupo] })
        )
        grupo.estudiantes.forEach(estudiante => {
          children.push(...generarDocEstudiante(lista, estudiante, grupo.nombre, profesorNombre, colegio, true, logoBase64))
        })
      })
      filename = `${safeFilename(`lista_cotejo_${lista.nombre}_grupos`)}.docx`
    }

    const doc = new Document({
      sections: [{ properties: { page: { margin: pageMargin } }, children }],
    })
    const buf = await Packer.toBuffer(doc)

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error("[export-lista-cotejo]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al generar Word" },
      { status: 500 }
    )
  }
}
