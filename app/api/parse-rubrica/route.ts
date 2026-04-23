import { NextRequest, NextResponse } from "next/server"
import mammoth from "mammoth"
import type {
  RubricaTemplate,
  RubricaParte,
  CriterioRubrica,
  RubricaMetadatosCurriculares,
} from "@/lib/rubricas"

// Parser del Word de rúbrica
// Estructura objetivo:
// - Encabezado con asignatura, nivel, unidad, grupo y nombre
// - Bloque previo a la tabla con OA, indicadores y OAA
// - Tabla con partes del tipo "PARTE N: ..."
// - Criterios con 4 descriptores y puntaje opcional del alumno

function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

interface MetaRubrica {
  nombre: string
  asignatura: string
  nivel: string
  unidad: string
  grupo: string
  alumno: string
}

interface ParsedData {
  meta: MetaRubrica
  metadatosCurriculares: RubricaMetadatosCurriculares
  partes: RubricaParte[]
  puntajesPorCriterio: Record<string, number>
  puntajeTotal: number
  notaFinal: number
  observaciones: string
  usaPonderaciones: boolean
}

function normalizeLine(linea: string): string {
  return linea.replace(/\s+/g, " ").trim()
}

function extraerMeta(lineas: string[]): MetaRubrica {
  const meta: MetaRubrica = {
    nombre: "",
    asignatura: "Música",
    nivel: "",
    unidad: "",
    grupo: "",
    alumno: "",
  }

  for (const raw of lineas) {
    const linea = normalizeLine(raw)
    if (!linea) continue

    if (/Asignatura:/i.test(linea)) {
      const asignatura = linea.match(/Asignatura:\s*(.+?)(?=\s+Nivel:|$)/i)
      const nivel = linea.match(/Nivel:\s*(.+?)(?=\s+Unidad:|$)/i)
      const unidad = linea.match(/Unidad:\s*(.+)$/i)
      if (asignatura) meta.asignatura = asignatura[1].trim()
      if (nivel) meta.nivel = nivel[1].trim()
      if (unidad) meta.unidad = unidad[1].trim()
      continue
    }

    if (/^Grupo\s+\d+/i.test(linea)) {
      meta.grupo = linea
      continue
    }

    if (/^Nombre:/i.test(linea)) {
      meta.alumno = linea.replace(/^Nombre:\s*/i, "").trim()
    }
  }

  if (!meta.nombre && meta.asignatura && meta.nivel) {
    const unidadLabel = meta.unidad ? `${meta.unidad} — ` : ""
    meta.nombre = `Rúbrica ${unidadLabel}${meta.asignatura} ${meta.nivel}`.trim()
  }

  return meta
}

function splitCompoundText(texto: string): string[] {
  const limpio = normalizeLine(texto)
  if (!limpio) return []
  return limpio
    .split(/(?:\s*•\s*|\s*;\s*|\.\s+(?=[A-ZÁÉÍÓÚÑ0-9]))/u)
    .map(item => item.trim())
    .filter(Boolean)
}

function pushUnique(target: string[], value: string) {
  const limpio = normalizeLine(value)
  if (!limpio) return
  if (!target.includes(limpio)) target.push(limpio)
}

function appendToLast(target: string[], value: string) {
  const limpio = normalizeLine(value)
  if (!limpio) return
  if (target.length === 0) {
    target.push(limpio)
    return
  }
  target[target.length - 1] = normalizeLine(`${target[target.length - 1]} ${limpio}`)
}

function isTableHeaderLine(linea: string): boolean {
  return (
    /^Criterio$/i.test(linea) ||
    /^\(4\s*pts?\)\s*Logrado/i.test(linea) ||
    /^\(3\s*pts?\)\s*Casi\s+Logrado/i.test(linea) ||
    /^\(2\s*pts?\)\s*Parcialmente\s+Logrado/i.test(linea) ||
    /^\(1\s*pt\)\s*Por\s+lograr/i.test(linea) ||
    /^Puntaje$/i.test(linea) ||
    /^Ponderaci[oó]n$/i.test(linea)   // columna de ponderación (3ro y 4to básico)
  )
}

function findTableStartIndex(lineas: string[]): number {
  const puntajeIndex = lineas.findIndex(linea => /^Puntaje$/i.test(linea))
  if (puntajeIndex !== -1) return puntajeIndex + 1

  const criterioIndex = lineas.findIndex(linea => /^Criterio$/i.test(linea))
  if (criterioIndex !== -1) {
    let i = criterioIndex + 1
    while (i < lineas.length && isTableHeaderLine(lineas[i])) i++
    return i
  }

  return lineas.findIndex(linea => esParteSeparador(linea, 1).esParte)
}

function extraerMetadatosCurriculares(lineas: string[]): RubricaMetadatosCurriculares {
  const metadatos: RubricaMetadatosCurriculares = {
    objetivos: [],
    indicadores: [],
    objetivosTransversales: [],
  }

  let seccion: "ninguna" | "oa" | "oat" = "ninguna"
  let ultimoTipo: "objetivo" | "indicador" | "oat" | null = null

  for (const raw of lineas) {
    const linea = normalizeLine(raw)
    if (!linea) continue

    if (/Objetivos de Aprendizaje \(OA\).*Indicadores/i.test(linea)) {
      seccion = "oa"
      ultimoTipo = null
      continue
    }

    if (/Objetivos de Aprendizaje de Actitud \(OAA\) Transversales/i.test(linea)) {
      seccion = "oat"
      ultimoTipo = null
      continue
    }

    if (isTableHeaderLine(linea) || /^RÚBRICA DE EVALUACIÓN/i.test(linea) || /^Grupo\s+\d+/i.test(linea) || /^Nombre:/i.test(linea)) {
      continue
    }

    if (seccion === "oa") {
      if (/^OA\s*\d+\s*[:.-]/i.test(linea)) {
        pushUnique(metadatos.objetivos, linea)
        ultimoTipo = "objetivo"
        continue
      }

      if (/^Indicador(?:es)?\s*[:.-]/i.test(linea)) {
        const contenido = linea.replace(/^Indicador(?:es)?\s*[:.-]\s*/i, "")
        splitCompoundText(contenido).forEach(item => pushUnique(metadatos.indicadores, item))
        ultimoTipo = "indicador"
        continue
      }

      if (ultimoTipo === "objetivo") {
        appendToLast(metadatos.objetivos, linea)
      } else if (ultimoTipo === "indicador") {
        splitCompoundText(linea).forEach(item => pushUnique(metadatos.indicadores, item))
      }
      continue
    }

    if (seccion === "oat") {
      if (/^OAA\s*[A-Z0-9]+\s*[:.-]/i.test(linea)) {
        pushUnique(metadatos.objetivosTransversales, linea)
        ultimoTipo = "oat"
        continue
      }

      if (ultimoTipo === "oat") {
        appendToLast(metadatos.objetivosTransversales, linea)
      }
    }
  }

  return metadatos
}

function parseSectionOrder(token: string, fallbackOrder: number): number {
  const limpio = token.trim().toUpperCase()
  const numeric = Number.parseInt(limpio, 10)
  if (Number.isFinite(numeric)) return numeric

  const romanMap: Record<string, number> = {
    I: 1,
    II: 2,
    III: 3,
    IV: 4,
    V: 5,
    VI: 6,
    VII: 7,
    VIII: 8,
    IX: 9,
    X: 10,
  }

  return romanMap[limpio] ?? fallbackOrder
}

function extractCurricularRefs(texto: string): string[] {
  const refs = new Set<string>()

  for (const match of texto.matchAll(/\bOA\s*\d+\b/gi)) {
    refs.add(match[0].toUpperCase().replace(/\s+/g, " "))
  }

  for (const match of texto.matchAll(/\bOAA(?:\s*[A-Z])?\b/gi)) {
    refs.add(match[0].toUpperCase().replace(/\s+/g, " "))
  }

  return Array.from(refs)
}

function esParteSeparador(
  linea: string,
  fallbackOrder: number
): { esParte: boolean; nombre: string; oas: string[]; orden: number } {
  const match = linea.match(/^(PARTE|ETAPA)\s+([0-9IVXLC]+)\s*[:.-]?\s*(.+?)(?:\s*\((.+?)\))?$/i)
  if (!match) return { esParte: false, nombre: "", oas: [], orden: fallbackOrder }

  const tipo = match[1].toUpperCase()
  const orden = parseSectionOrder(match[2], fallbackOrder)
  const titulo = match[3].trim()
  const sufijo = match[4]?.trim()
  const nombre = `${tipo} ${match[2]}: ${titulo}`.trim()
  const oas = extractCurricularRefs([titulo, sufijo].filter(Boolean).join(" "))

  return { esParte: true, nombre, oas, orden }
}

function esCabeceraCriterio(linea: string): boolean {
  return /^\d+\.\s+.+/.test(linea.trim()) && linea.trim().length > 5
}

function esPuntaje(linea: string): boolean {
  return /^\d+$/.test(linea.trim()) && Number.parseInt(linea.trim(), 10) >= 1 && Number.parseInt(linea.trim(), 10) <= 4
}

function esLineaFinal(linea: string): boolean {
  return /Total de puntos/i.test(linea) || /Nota Final/i.test(linea) || /Escala de notas/i.test(linea)
}

function buildEmptyCriterio(nombre: string, orden: number): CriterioRubrica {
  return {
    id: `crit_${uid()}`,
    orden,
    nombre,
    niveles: {
      logrado: { descripcion: "", puntos: 4 },
      casiLogrado: { descripcion: "", puntos: 3 },
      parcialmenteLogrado: { descripcion: "", puntos: 2 },
      porLograr: { descripcion: "", puntos: 1 },
    },
  }
}

function buildEmptyParte(orden: number, nombre?: string): RubricaParte {
  return {
    id: `parte_${uid()}`,
    orden,
    nombre: nombre || `Parte ${orden}`,
    oasVinculados: [],
    criterios: [],
  }
}

function resolveDescriptors(buffer: string[]): [string, string, string, string] {
  const cleaned = buffer.map(normalizeLine).filter(Boolean)
  if (cleaned.length <= 4) {
    return [
      cleaned[0] ?? "",
      cleaned[1] ?? "",
      cleaned[2] ?? "",
      cleaned[3] ?? "",
    ]
  }

  const firstFour = cleaned.slice(0, 4)
  const overflow = cleaned.slice(4)
  firstFour[3] = normalizeLine([firstFour[3], ...overflow].join(" "))
  return [firstFour[0], firstFour[1], firstFour[2], firstFour[3]]
}

export function parsearTextoRubrica(texto: string): ParsedData {
  const lineas = texto
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean)

  const meta = extraerMeta(lineas)
  const tableStartIndex = findTableStartIndex(lineas)
  const headerLines = tableStartIndex > 0 ? lineas.slice(0, tableStartIndex) : lineas
  const metadatosCurriculares = extraerMetadatosCurriculares(headerLines)

  const partes: RubricaParte[] = []
  const puntajesPorCriterio: Record<string, number> = {}
  let puntajeTotal = 0
  let notaFinal = 0
  let observaciones = ""

  let parteActual: RubricaParte | null = null
  let criterioActual: CriterioRubrica | null = null
  let descBuffer: string[] = []
  let recogiendoObservaciones = false
  let nextParteOrder = 1

  const flushCriterio = () => {
    if (!criterioActual || !parteActual) return
    const [d0, d1, d2, d3] = resolveDescriptors(descBuffer)
    criterioActual.niveles.logrado.descripcion = d0
    criterioActual.niveles.casiLogrado.descripcion = d1
    criterioActual.niveles.parcialmenteLogrado.descripcion = d2
    criterioActual.niveles.porLograr.descripcion = d3
    criterioActual.orden = parteActual.criterios.length + 1
    parteActual.criterios.push(criterioActual)
    criterioActual = null
    descBuffer = []
  }

  const flushParte = () => {
    if (!parteActual || parteActual.criterios.length === 0) {
      parteActual = null
      return
    }
    parteActual.orden = partes.length + 1
    partes.push(parteActual)
    parteActual = null
  }

  const startIndex = tableStartIndex >= 0 ? tableStartIndex : 0

  for (let i = startIndex; i < lineas.length; i++) {
    const linea = lineas[i]

    if (esLineaFinal(linea)) {
      flushCriterio()
      for (let j = i; j < Math.min(i + 12, lineas.length); j++) {
        const puntajeMatch = lineas[j].match(/Puntaje total[:\s]+(\d+)/i)
        if (puntajeMatch) puntajeTotal = Number.parseInt(puntajeMatch[1], 10)

        const notaInline = lineas[j].match(/Nota Final[:\s]+([\d,.]+)/i)
        if (notaInline) notaFinal = Number.parseFloat(notaInline[1].replace(",", "."))

        if (/^Nota Final$/i.test(lineas[j]) && j + 1 < lineas.length) {
          const notaNext = Number.parseFloat(lineas[j + 1].replace(",", "."))
          if (Number.isFinite(notaNext)) notaFinal = notaNext
        }

        if (/^Observaciones/i.test(lineas[j])) {
          const contenidoInicial = lineas[j].replace(/^Observaciones:\s*/i, "")
          observaciones = contenidoInicial
          for (let k = j + 1; k < Math.min(j + 12, lineas.length); k++) {
            if (/Escala de notas/i.test(lineas[k])) break
            observaciones = normalizeLine(`${observaciones} ${lineas[k]}`)
          }
        }
      }
      break
    }

    if (/^Observaciones/i.test(linea)) {
      recogiendoObservaciones = true
      observaciones = linea.replace(/^Observaciones:\s*/i, "")
      flushCriterio()
      continue
    }

    if (recogiendoObservaciones) {
      if (/Escala de notas/i.test(linea) || /Puntaje total/i.test(linea)) {
        recogiendoObservaciones = false
      } else {
        observaciones = normalizeLine(`${observaciones} ${linea}`)
        continue
      }
    }

    if (isTableHeaderLine(linea)) continue

    const parteInfo = esParteSeparador(linea, nextParteOrder)
    if (parteInfo.esParte) {
      flushCriterio()
      flushParte()
      parteActual = buildEmptyParte(parteInfo.orden, parteInfo.nombre)
      parteActual.oasVinculados = parteInfo.oas
      nextParteOrder = parteInfo.orden + 1
      continue
    }

    if (esCabeceraCriterio(linea)) {
      flushCriterio()
      if (!parteActual) {
        parteActual = buildEmptyParte(nextParteOrder)
        nextParteOrder += 1
      }
      criterioActual = buildEmptyCriterio(linea, parteActual.criterios.length + 1)
      descBuffer = []
      continue
    }

    if (!criterioActual) continue

    if (esPuntaje(linea)) {
      puntajesPorCriterio[criterioActual.id] = Number.parseInt(linea, 10)
    } else if (/^x([\d.]+)$/i.test(linea)) {
      // valor de ponderación (x1, x1.5, x2, etc.)
      const valor = parseFloat(linea.slice(1))
      if (isFinite(valor) && valor > 0) {
        criterioActual.ponderacion = valor
      }
    } else {
      descBuffer.push(linea)
    }
  }

  flushCriterio()
  flushParte()

  // Detectar si algún criterio tiene ponderación distinta de 1
  const usaPonderaciones = partes.some(p =>
    p.criterios.some(c => c.ponderacion !== undefined && c.ponderacion !== 1)
  )

  return {
    meta,
    metadatosCurriculares,
    partes,
    puntajesPorCriterio,
    puntajeTotal,
    notaFinal,
    observaciones: normalizeLine(observaciones),
    usaPonderaciones,
  }
}

// POST /api/parse-rubrica
// Body: multipart/form-data { file: .docx }
// Retorna: RubricaTemplate parcial, sin id, listo para edición/guardado.

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: "No se envió ningún archivo" }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const { value: texto } = await mammoth.extractRawText({ buffer })
    const { meta, metadatosCurriculares, partes, usaPonderaciones } = parsearTextoRubrica(texto)

    if (partes.length === 0) {
      return NextResponse.json(
        { error: "No se encontraron partes/criterios en el documento. Revisa el formato del Word." },
        { status: 422 }
      )
    }

    // puntajeMaximo considera ponderaciones: Σ(4 × ponderacion_i)
    const puntajeMaximo = partes.reduce(
      (acc, parte) =>
        acc + parte.criterios.reduce((s, c) => s + 4 * (c.ponderacion ?? 1), 0),
      0
    )

    const rubrica: Omit<RubricaTemplate, "id"> = {
      nombre: meta.nombre || `Rúbrica ${meta.unidad}`,
      asignatura: meta.asignatura,
      curso: meta.nivel,
      unidadNombre: meta.unidad,
      metadatosCurriculares,
      partes,
      puntajeMaximo,
      ...(usaPonderaciones && { usaPonderaciones: true }),
    }

    return NextResponse.json(rubrica)
  } catch (err) {
    console.error("[parse-rubrica]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al parsear el Word" },
      { status: 500 }
    )
  }
}
