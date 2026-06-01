import { NextRequest, NextResponse } from "next/server"
import mammoth from "mammoth"
import type {
  ListaCotejoMetadatosCurriculares,
  ListaCotejoTemplate,
  SeccionListaCotejo,
  IndicadorListaCotejo,
} from "@/lib/listas-cotejo"
import { calcularPuntajeMaximoLista } from "@/lib/listas-cotejo"
import { verifyAllowedUser } from "@/lib/auth/verify-token"

interface MetaListaCotejo {
  nombre: string
  asignatura: string
  curso: string
  unidad: string
}

interface ParsedListaCotejo {
  meta: MetaListaCotejo
  metadatosCurriculares: ListaCotejoMetadatosCurriculares
  secciones: SeccionListaCotejo[]
  puntajePorSi: number
  instruccionesMetodologicas?: string
  escalaDicotomica?: [string, string]
  nombreEstablecimiento?: string
  rbd?: string
  docenteNombre?: string
}

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function normalizeLine(linea: string): string {
  return linea.replace(/\s+/g, " ").trim()
}

function getNextValueAfterLabel(lineas: string[], index: number): string {
  for (let i = index + 1; i < lineas.length; i++) {
    const value = normalizeLine(lineas[i])
    if (!value) continue
    if (/^[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ\s/]+:\s*$/i.test(value)) return ""
    return value
  }
  return ""
}

function parseRoman(token: string, fallback: number): number {
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
  return romanMap[token.trim().toUpperCase()] ?? fallback
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

function extraerMeta(lineas: string[]): MetaListaCotejo {
  const meta: MetaListaCotejo = {
    nombre: "",
    asignatura: "Musica",
    curso: "",
    unidad: "",
  }

  lineas.forEach((raw, index) => {
    const linea = normalizeLine(raw)
    if (!linea) return

    if (/^Curso:\s*$/i.test(linea)) {
      meta.curso = getNextValueAfterLabel(lineas, index) || meta.curso
      return
    }
    if (/^Curso:\s*.+/i.test(linea)) {
      meta.curso = linea.replace(/^Curso:\s*/i, "").trim() || meta.curso
      return
    }

    if (/^Asignatura:\s*$/i.test(linea)) {
      meta.asignatura = getNextValueAfterLabel(lineas, index) || meta.asignatura
      return
    }
    if (/^Asignatura:\s*.+/i.test(linea)) {
      meta.asignatura = linea.replace(/^Asignatura:\s*/i, "").trim() || meta.asignatura
      return
    }

    if (/^Contenidos?:\s*/i.test(linea)) {
      meta.unidad = linea.replace(/^Contenidos?:\s*/i, "").trim() || meta.unidad
      return
    }

    if (/^Unidad:\s*/i.test(linea)) {
      meta.unidad = linea.replace(/^Unidad:\s*/i, "").trim() || meta.unidad
    }
  })

  meta.nombre = ["Lista de cotejo", meta.asignatura, meta.curso]
    .filter(Boolean)
    .join(" - ")

  return meta
}

function extraerPuntajePorSi(lineas: string[]): number {
  for (const linea of lineas) {
    const match = normalizeLine(linea).match(/S[ií]\s*\(\s*(\d+(?:[,.]\d+)?)\s*pts?\s*\)/i)
    if (!match) continue
    const puntaje = Number.parseFloat(match[1].replace(",", "."))
    if (Number.isFinite(puntaje) && puntaje > 0) return puntaje
  }
  return 2 // Default to 2 if not found (like in our generated file)
}

function esLineaCabecera(linea: string): boolean {
  const l = linea.toLowerCase()
  return (
    /^Indicadores?\s+de\s+Evaluaci[oó]n$/i.test(linea) ||
    /^S[ií](?:\s*\(\s*\d+(?:[,.]\d+)?\s*pts?\s*\))?$/i.test(linea) ||
    /^No(?:\s*\(\s*\d+(?:[,.]\d+)?\s*pts?\s*\))?$/i.test(linea) ||
    /^Puntaje$/i.test(linea) ||
    l === "n°" ||
    l.includes("indicador de logro general") ||
    l.includes("metadatos de inclusión")
  )
}

function esLineaFinal(linea: string): boolean {
  return /Puntaje\s+Total/i.test(linea) ||
    /Total\s+de\s+puntos/i.test(linea) ||
    /Nota\s+Final/i.test(linea) ||
    /Observaciones/i.test(linea)
}

function findStartIndex(lineas: string[]): number {
  const header = lineas.findIndex(linea => /^Indicadores?\s+de\s+Evaluaci[oó]n$/i.test(linea) || /indicador de logro general/i.test(linea))
  if (header !== -1) {
    let i = header + 1
    while (i < lineas.length && esLineaCabecera(lineas[i])) i++
    return i
  }

  const firstSection = lineas.findIndex(linea => /^[IVXLC]+\.\s+.+/i.test(linea))
  if (firstSection !== -1) return firstSection

  const firstIndicator = lineas.findIndex(linea => /^\d+[.)]\s+.+/.test(linea))
  return firstIndicator === -1 ? 0 : firstIndicator
}

function buildSeccion(orden: number, nombre = "Indicadores"): SeccionListaCotejo {
  return {
    id: uid("sec"),
    orden,
    nombre,
    oasVinculados: extractCurricularRefs(nombre),
    indicadores: [],
  }
}

function extraerMetadatosCurriculares(
  lineas: string[],
  secciones: SeccionListaCotejo[]
): ListaCotejoMetadatosCurriculares {
  const objetivos: string[] = []
  const objetivosTransversales: string[] = []

  lineas.forEach(raw => {
    const linea = normalizeLine(raw)
    if (/^OA\s*\d+\s*[:.-]/i.test(linea)) objetivos.push(linea)
    if (/^OAA(?:\s*[A-Z0-9]+)?\s*[:.-]/i.test(linea)) objetivosTransversales.push(linea)
  })

  return {
    objetivos,
    indicadores: secciones.flatMap(seccion => seccion.indicadores.map(indicador => indicador.texto)),
    objetivosTransversales,
  }
}

function extraerEscalaDicotomica(lineas: string[]): [string, string] | undefined {
  for (const linea of lineas) {
    const norm = normalizeLine(linea).toLowerCase()
    if (norm.includes("logrado") && norm.includes("no logrado")) {
      return ["Logrado", "No logrado"]
    }
    if (norm.includes("presente") && norm.includes("ausente")) {
      return ["Presente", "Ausente"]
    }
    if (norm.includes("sí") && norm.includes("no")) {
      return ["Sí", "No"]
    }
    if (norm.includes("si") && norm.includes("no")) {
      return ["Sí", "No"]
    }
  }
  return undefined
}

function extraerInstrucciones(lineas: string[]): string | undefined {
  for (const linea of lineas) {
    if (/^Instrucciones:\s*.+/i.test(linea)) {
      return linea.replace(/^Instrucciones:\s*/i, "").trim()
    }
  }
  return undefined
}

function extraerTrazabilidad(lineas: string[]) {
  let docenteNombre = ""
  let nombreEstablecimiento = ""
  let rbd = ""

  lineas.forEach(linea => {
    const l = normalizeLine(linea)
    if (/^Docente:\s*.+/i.test(l)) {
      docenteNombre = l.replace(/^Docente:\s*/i, "").trim()
    }
    if (/^Establecimiento:\s*.+/i.test(l)) {
      nombreEstablecimiento = l.replace(/^Establecimiento:\s*/i, "").trim()
    }
    if (/^RBD:\s*.+/i.test(l)) {
      rbd = l.replace(/^RBD:\s*/i, "").trim()
    }
  })

  return { docenteNombre, nombreEstablecimiento, rbd }
}

export function parsearTextoListaCotejo(texto: string): ParsedListaCotejo {
  const lineas = texto
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean)

  const startIndex = findStartIndex(lineas)
  const meta = extraerMeta(startIndex > 0 ? lineas.slice(0, startIndex) : lineas)
  const puntajePorSi = extraerPuntajePorSi(lineas)
  
  const lineasAntesStart = lineas.slice(0, startIndex)
  const instruccionesMetodologicas = extraerInstrucciones(lineasAntesStart)
  const escalaDicotomica = extraerEscalaDicotomica(lineasAntesStart)
  const trazabilidad = extraerTrazabilidad(lineasAntesStart)

  const secciones: SeccionListaCotejo[] = []
  let seccionActual: SeccionListaCotejo | null = null
  let ultimoIndicadorId: string | null = null
  let nextSectionOrder = 1

  for (let i = startIndex; i < lineas.length; i++) {
    const linea = lineas[i]
    if (esLineaFinal(linea) && secciones.some(seccion => seccion.indicadores.length > 0)) break
    if (esLineaCabecera(linea)) continue

    const sectionMatch = linea.match(/^([IVXLC]+)\.\s+(.+)$/i)
    if (sectionMatch) {
      seccionActual = buildSeccion(
        parseRoman(sectionMatch[1], nextSectionOrder),
        `${sectionMatch[1].toUpperCase()}. ${sectionMatch[2].trim()}`
      )
      nextSectionOrder = seccionActual.orden + 1
      secciones.push(seccionActual)
      ultimoIndicadorId = null
      continue
    }

    const indicadorMatch = linea.match(/^(\d+)[.)]\s+(.+)$/)
    if (indicadorMatch) {
      if (!seccionActual) {
        seccionActual = buildSeccion(nextSectionOrder)
        nextSectionOrder += 1
        secciones.push(seccionActual)
      }

      const textoIndicador = indicadorMatch[2].trim()
      const indicador: IndicadorListaCotejo = {
        id: uid("ind"),
        orden: seccionActual.indicadores.length + 1,
        texto: textoIndicador,
        oasVinculados: extractCurricularRefs(textoIndicador),
        puedoFilmarloConfirmado: true,
      }
      seccionActual.indicadores.push(indicador)
      ultimoIndicadorId = indicador.id
      continue
    }

    // Single number (multi-line style, e.g. "1")
    if (/^\d+$/.test(linea)) {
      if (!seccionActual) {
        seccionActual = buildSeccion(nextSectionOrder)
        nextSectionOrder += 1
        secciones.push(seccionActual)
      }
      const indicador: IndicadorListaCotejo = {
        id: uid("ind"),
        orden: seccionActual.indicadores.length + 1,
        texto: "",
        oasVinculados: [],
        puedoFilmarloConfirmado: true,
      }
      seccionActual.indicadores.push(indicador)
      ultimoIndicadorId = indicador.id
      continue
    }

    if (seccionActual && ultimoIndicadorId) {
      const idx = seccionActual.indicadores.findIndex(ind => ind.id === ultimoIndicadorId)
      if (idx !== -1) {
        const ind = seccionActual.indicadores[idx]
        
        let isSpecial = false
        
        if (/(🌱|OAT\s+Actitudinal|OAT)/i.test(linea)) {
          ind.esTransversal = true
          isSpecial = true
        }
        
        if (/(♿|Canal\s+Alt|Dec\s*83)/i.test(linea)) {
          ind.focoDiferenciadoActivo = true
          const match = linea.match(/(?:♿|Canal\s+Alt\s*\(Dec\s*83\)|♿\s*Canal\s*Alt\s*\(Dec\s*83\)|Canal\s+Alt|Dec\s*83):\s*(.+)$/i)
          if (match) {
            ind.focoDiferenciadoTexto = match[1].trim()
          } else {
            ind.focoDiferenciadoTexto = linea.replace(/^[♿🌱\s]*(Canal\s+Alt\s*\(Dec\s*83\)|Canal\s+Alt|Dec\s*83):?/i, "").trim()
          }
          isSpecial = true
        }
        
        if (
          /^\[\s*\]$/.test(linea) ||
          /^\[\s*[xX]?\s*\]$/.test(linea) ||
          /^(Sí|No|Logrado|No logrado|Presente|Ausente)$/i.test(linea) ||
          /^(Sí|No|Logrado|No logrado|Presente|Ausente)\s*\(\s*\d+\s*pts?\s*\)$/i.test(linea) ||
          esLineaCabecera(linea)
        ) {
          isSpecial = true
        }
        
        if (!isSpecial && !/^[-–—]+$/.test(linea)) {
          ind.texto = normalizeLine(`${ind.texto} ${linea}`).trim()
          ind.oasVinculados = extractCurricularRefs(ind.texto)
        }
      }
    }
  }

  const seccionesValidas = secciones.filter(seccion => seccion.indicadores.length > 0)
  return {
    meta,
    metadatosCurriculares: extraerMetadatosCurriculares(lineas.slice(0, startIndex), seccionesValidas),
    secciones: seccionesValidas.map((seccion, index) => ({ ...seccion, orden: index + 1 })),
    puntajePorSi,
    instruccionesMetodologicas,
    escalaDicotomica,
    nombreEstablecimiento: trazabilidad.nombreEstablecimiento,
    rbd: trazabilidad.rbd,
    docenteNombre: trazabilidad.docenteNombre,
  }
}

export async function POST(req: NextRequest) {
  const authCheck = await verifyAllowedUser(req)
  if (!authCheck.ok) return authCheck.response

  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: "No se envio ningun archivo" }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const { value: texto } = await mammoth.extractRawText({ buffer })
    const {
      meta,
      metadatosCurriculares,
      secciones,
      puntajePorSi,
      instruccionesMetodologicas,
      escalaDicotomica,
      nombreEstablecimiento,
      rbd,
      docenteNombre,
    } = parsearTextoListaCotejo(texto)

    if (secciones.length === 0) {
      return NextResponse.json(
        { error: "No se encontraron indicadores de lista de cotejo en el Word. Revisa que tenga criterios numerados y columnas Si/No." },
        { status: 422 }
      )
    }

    const lista: Omit<ListaCotejoTemplate, "id"> = {
      nombre: meta.nombre,
      asignatura: meta.asignatura,
      curso: meta.curso,
      unidadNombre: meta.unidad,
      metadatosCurriculares,
      secciones,
      puntajePorSi,
      puntajeMaximo: calcularPuntajeMaximoLista(secciones, puntajePorSi),
      instruccionesMetodologicas,
      escalaDicotomica,
      nombreEstablecimiento,
      rbd,
      docenteNombre,
    }

    return NextResponse.json(lista)
  } catch (err) {
    console.error("[parse-lista-cotejo]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al parsear el Word" },
      { status: 500 }
    )
  }
}
