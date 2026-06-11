import { NextRequest, NextResponse } from "next/server"
import {
  AlignmentType,
  BorderStyle,
  convertInchesToTwip,
  Document,
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

function paragraph(text: string, opts?: { bold?: boolean; size?: number; center?: boolean; color?: string }) {
  return new Paragraph({
    alignment: opts?.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    children: [
      new TextRun({
        text,
        bold: opts?.bold ?? false,
        color: opts?.color,
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
}) {
  const { lista, alumnoNombre, grupoNombre, profesorNombre = "", colegio = "" } = opts
  const children: (Paragraph | Table)[] = [
    paragraph("LISTA DE COTEJO", { bold: true, size: 16, center: true }),
  ]

  if (colegio) children.push(paragraph(colegio, { bold: true, size: 12, center: true }))
  children.push(
    paragraph(lista.nombre || "Lista de cotejo", { bold: true, size: 13, center: true }),
    paragraph(
      [
        `Asignatura: ${lista.asignatura}`,
        `Curso: ${lista.curso}`,
        lista.unidadNombre ? `Unidad: ${lista.unidadNombre}` : "",
      ].filter(Boolean).join("   "),
      { size: 10 }
    )
  )
  if (profesorNombre) children.push(paragraph(`Profesor/a: ${profesorNombre}`, { size: 10 }))
  if (alumnoNombre) {
    children.push(paragraph(`${grupoNombre ? `${grupoNombre}   ` : ""}Estudiante: ${alumnoNombre}`, { bold: true, size: 11 }))
  }
  children.push(new Paragraph({ text: "" }))
  return children
}

function bloquesCurriculares(lista: ListaCotejoTemplate): Paragraph[] {
  const bloques: Paragraph[] = []

  if (lista.oas?.length) {
    const seleccionados = lista.oas.filter(oa => oa.seleccionado)
    const regulares = seleccionados.filter(oa => oa.tipo !== "oat")
    const transversales = seleccionados.filter(oa => oa.tipo === "oat")

    if (regulares.length) {
      bloques.push(paragraph("Objetivos de Aprendizaje e indicadores:", { bold: true, size: 10 }))
      regulares.forEach(oa => {
        const etiqueta = oa.esPropio ? "OA propio" : `OA ${oa.numero}`
        bloques.push(paragraph(`${etiqueta}: ${oa.descripcion}`, { size: 9 }))
        const indicadores = oa.indicadores.filter(ind => ind.seleccionado).map(ind => ind.texto)
        if (indicadores.length) bloques.push(paragraph(`Indicadores: ${indicadores.join(" ")}`, { size: 8 }))
      })
      bloques.push(new Paragraph({ text: "" }))
    }

    if (transversales.length) {
      bloques.push(paragraph("Objetivos de Aprendizaje de Actitud:", { bold: true, size: 10 }))
      transversales.forEach(oa => {
        const etiqueta = oa.esPropio ? "OAA" : `OAA ${oa.numero}`
        bloques.push(paragraph(`${etiqueta}: ${oa.descripcion}`, { size: 9 }))
      })
      bloques.push(new Paragraph({ text: "" }))
    }
    return bloques
  }

  const metadatos = lista.metadatosCurriculares
  if (!metadatos) return bloques

  const pushSection = (titulo: string, values: string[]) => {
    if (!values?.length) return
    bloques.push(paragraph(titulo, { bold: true, size: 10 }))
    values.forEach(value => bloques.push(paragraph(`- ${value}`, { size: 9 })))
    bloques.push(new Paragraph({ text: "" }))
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
      tableHeader: true,
      children: [
        celda("Seccion", { bold: true, bg: "D9D9D9", width: 18 }),
        celda("Indicador observable", { bold: true, bg: "D9D9D9", width: 52 }),
        celda(escala[0], { bold: true, bg: "C6EFCE", width: 10, centro: true }),
        celda(escala[1], { bold: true, bg: "FFC7CE", width: 10, centro: true }),
        celda("Notas / DUA", { bold: true, bg: "D9D9D9", width: 10 }),
      ],
    }),
  ]

  lista.secciones.forEach(seccion => {
    seccion.indicadores.forEach(indicador => {
      const respuesta = respuestas?.[indicador.id]
      rows.push(new TableRow({
        children: [
          celda(seccion.nombre, { width: 18 }),
          celda(indicador.texto, { width: 52 }),
          celda(respuesta === true ? "X" : "", { width: 10, centro: true, bold: true }),
          celda(respuesta === false ? "X" : "", { width: 10, centro: true, bold: true }),
          celda([
            indicador.esTransversal ? "OAT" : "",
            indicador.focoDiferenciadoActivo ? `DUA: ${indicador.focoDiferenciadoTexto || "canal alternativo"}` : "",
          ].filter(Boolean).join(" | "), { width: 10, size: 8 }),
        ],
      }))
    })
  })

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
    } as any,
    rows,
  })
}

function generarDocEstudiante(
  lista: ListaCotejoTemplate,
  estudiante: EstudianteListaCotejo,
  grupoNombre: string,
  profesorNombre?: string,
  colegio?: string
): (Paragraph | Table)[] {
  const puntaje = puntajeEstudiante(estudiante, lista)
  const nota = notaEstudiante(estudiante, lista)
  const children: (Paragraph | Table)[] = [
    ...cabeceraLista({
      lista,
      alumnoNombre: `${estudiante.nombre}${estudiante.hasPie ? " [PIE]" : ""}`,
      grupoNombre,
      profesorNombre,
      colegio,
    }),
    ...bloquesCurriculares(lista),
    tablaLista(lista, estudiante.respuestas),
    new Paragraph({ text: "" }),
    paragraph(
      `Puntaje total: ${puntaje} / ${lista.puntajeMaximo}   Nota final: ${nota.toFixed(1)}   Exigencia: ${estudiante.hasPie ? "50% PIE" : "60%"}`,
      { bold: true, size: 11, color: nota >= 4 ? "375623" : "9C0006" }
    ),
  ]

  if (estudiante.observaciones) {
    children.push(paragraph(`Observaciones: ${estudiante.observaciones}`, { size: 10 }))
  }
  return children
}

function tablaListado(lista: ListaCotejoTemplate, evaluacion: ListaCotejoEvaluacion): Table {
  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        celda("Grupo", { bold: true, bg: "D9D9D9", width: 18 }),
        celda("Estudiante", { bold: true, bg: "D9D9D9", width: 34 }),
        celda("PIE", { bold: true, bg: "D9D9D9", width: 8, centro: true }),
        celda("Puntaje", { bold: true, bg: "D9D9D9", width: 14, centro: true }),
        celda("%", { bold: true, bg: "D9D9D9", width: 10, centro: true }),
        celda("Nota", { bold: true, bg: "D9D9D9", width: 10, centro: true }),
        celda("Estado", { bold: true, bg: "D9D9D9", width: 14, centro: true }),
      ],
    }),
  ]

  evaluacion.grupos.forEach(grupo => {
    grupo.estudiantes.forEach(estudiante => {
      const puntaje = puntajeEstudiante(estudiante, lista)
      const nota = notaEstudiante(estudiante, lista)
      rows.push(new TableRow({
        children: [
          celda(grupo.nombre, { width: 18 }),
          celda(estudiante.nombre, { width: 34 }),
          celda(estudiante.hasPie ? "Si" : "", { width: 8, centro: true }),
          celda(`${puntaje}/${lista.puntajeMaximo}`, { width: 14, centro: true }),
          celda(`${estudiante.porcentaje ?? 0}%`, { width: 10, centro: true }),
          celda(nota.toFixed(1), { width: 10, centro: true, bold: true, color: nota >= 4 ? "375623" : "9C0006" }),
          celda(estudiante.completado ? "Completo" : "Incompleto", { width: 14, centro: true }),
        ],
      }))
    })
  })

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })
}

function resumenGlobal(lista: ListaCotejoTemplate, evaluacion: ListaCotejoEvaluacion): Paragraph {
  const estudiantes = evaluacion.grupos.flatMap(grupo => grupo.estudiantes)
  const promedio = estudiantes.length
    ? estudiantes.reduce((sum, est) => sum + notaEstudiante(est, lista), 0) / estudiantes.length
    : 0
  const aprobados = estudiantes.filter(est => notaEstudiante(est, lista) >= 4).length
  return paragraph(`Total: ${estudiantes.length} estudiantes   Promedio: ${promedio.toFixed(1)}   Aprobados: ${aprobados}/${estudiantes.length}`, { bold: true, size: 10 })
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
    } | null

    if (!body) return NextResponse.json({ error: "Datos invalidos" }, { status: 400 })

    const { lista, evaluacion, modo = "grupo", estudianteId, profesorNombre, colegio } = body
    if (!isValidListaPayload(lista)) return NextResponse.json({ error: "Lista invalida" }, { status: 400 })
    if (!isValidEvaluacionPayload(evaluacion)) return NextResponse.json({ error: "Evaluacion invalida" }, { status: 400 })

    const pageMargin = {
      top: convertInchesToTwip(0.75),
      bottom: convertInchesToTwip(0.75),
      left: convertInchesToTwip(0.75),
      right: convertInchesToTwip(0.75),
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
      children = generarDocEstudiante(lista, estudianteEncontrado, grupoNombre, profesorNombre, colegio)
      filename = `${safeFilename(`lista_cotejo_${estudianteEncontrado.nombre}`)}.docx`
    } else if (modo === "listado") {
      children = [
        ...cabeceraLista({ lista, profesorNombre, colegio }),
        tablaListado(lista, evaluacion),
        new Paragraph({ text: "" }),
        resumenGlobal(lista, evaluacion),
      ]
      filename = `${safeFilename(`lista_notas_${lista.nombre}_${lista.curso}`)}.docx`
    } else {
      children = [
        ...cabeceraLista({ lista, profesorNombre, colegio }),
        ...bloquesCurriculares(lista),
        paragraph(`Indicadores: ${getIndicadoresLista(lista).length}`, { bold: true, size: 10 }),
        new Paragraph({ text: "" }),
      ]

      evaluacion.grupos.forEach(grupo => {
        if (grupo.estudiantes.length === 0) return
        children.push(paragraph(grupo.nombre, { bold: true, size: 14 }), tablaListado(lista, { ...evaluacion, grupos: [grupo] }), new Paragraph({ text: "" }))
        grupo.estudiantes.forEach(estudiante => {
          children.push(...generarDocEstudiante(lista, estudiante, grupo.nombre, profesorNombre, colegio), new Paragraph({ text: "" }))
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
