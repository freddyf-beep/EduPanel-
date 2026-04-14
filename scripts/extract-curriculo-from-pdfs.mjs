import { readdirSync, readFileSync, statSync, writeFileSync } from "fs"
import { basename, extname, join, relative } from "path"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import {
  PROJECT_ROOT,
  buildDocId,
  ensureDir,
  normalizeTextId,
  writeJsonFile,
} from "./curriculo-common.mjs"

const SOURCE_DIR = join(PROJECT_ROOT, "PDF CURSOS")
const OUTPUT_DIR = join(PROJECT_ROOT, "Archivos de Curriculum", "json_extraido")
const TEXT_DIR = join(PROJECT_ROOT, "Archivos de Curriculum", "texto_extraido")
const LOG_DIR = join(OUTPUT_DIR, "_logs")

const STYLE_MAP = {
  [normalizeTextId("Educación Física y Salud")]: {
    summarySplit: 270,
    columnSplit: 110,
  },
  [normalizeTextId("Lenguaje y Comunicación")]: {
    summarySplit: 110,
    columnSplit: 110,
  },
  [normalizeTextId("Corporalidad y Movimiento")]: null,
}

function walkPdfFiles(dirPath) {
  const entries = []
  for (const name of readdirSync(dirPath)) {
    const fullPath = join(dirPath, name)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      entries.push(...walkPdfFiles(fullPath))
      continue
    }
    if (extname(name).toLowerCase() === ".pdf") {
      entries.push(fullPath)
    }
  }
  return entries
}

function normalizeForMatch(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
}

function cleanInlineText(text) {
  return (text || "")
    .replace(/\u00ad/g, "")
    .replace(/\u001e/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function cleanLine(rawLine) {
  return cleanInlineText(rawLine)
    .replace(/^Ú$/, "")
    .replace(/^!$/, "")
    .trim()
}

function isBulletLine(line) {
  return /^[›•\-\u00fa]/.test(line.trim())
}

function stripBullet(line) {
  return line.replace(/^[›•\-\u00fa]\s*/, "").trim()
}

function joinWrappedLines(lines) {
  const merged = []
  for (const rawLine of lines) {
    const line = cleanLine(rawLine)
    if (!line) continue

    if (merged.length === 0) {
      merged.push(line)
      continue
    }

    if (merged.at(-1).endsWith("-")) {
      merged[merged.length - 1] = `${merged.at(-1).slice(0, -1)}${line}`
      continue
    }

    merged.push(line)
  }

  return merged
}

function joinParagraph(lines) {
  return cleanInlineText(joinWrappedLines(lines).join(" "))
}

function parseBulletArray(lines) {
  const joined = joinWrappedLines(lines)
  const items = []

  for (const line of joined) {
    if (isBulletLine(line)) {
      items.push(stripBullet(line))
      continue
    }

    if (items.length === 0) {
      items.push(line)
      continue
    }

    items[items.length - 1] = cleanInlineText(`${items.at(-1)} ${line}`)
  }

  return items.filter(Boolean)
}

function parseCommaSeparatedArray(lines) {
  const paragraph = joinParagraph(lines)
  if (!paragraph) return []

  return paragraph
    .split(/\s*,\s*/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

function lineLooksLikeHeader(line) {
  const normalized = normalizeForMatch(line)
  return (
    normalized === "" ||
    /^unidad\d+$/.test(normalized) ||
    normalized === "programadeestudio" ||
    normalized.startsWith("programadeestudio") ||
    normalized.startsWith("educacionfisicaysalud") ||
    normalized.startsWith("lenguajeycomunicacion") ||
    normalized === "ejemplosdeactividades" ||
    normalized === "ejemplosdeevaluacion" ||
    normalized === "objetivosdeaprendizaje" ||
    normalized === "indicadoresdeevaluacionsugeridos" ||
    normalized === "seesperaquelosestudiantesseancapacesde" ||
    normalized === "losestudiantesquehanalcanzadoesteaprendizaje" ||
    normalized === "resumendelaunidad" ||
    normalized === "orientacionesdidacticasparalaunidad" ||
    /^\d+$/.test(normalized)
  )
}

function titleCaseFallback(value) {
  return value
    .split(/\s+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")
}

function canonicalNivel(folderName) {
  const normalized = normalizeTextId(folderName)
  const map = {
    "1ro_basico": "1ro Básico",
    "2do_basico": "2do Básico",
    "3ro_basico": "3ro Básico",
    "4to_basico": "4to Básico",
    "5to_basico": "5to Básico",
    "6to_basico": "6to Básico",
    "7mo_basico": "7mo Básico",
    "8vo_basico": "8vo Básico",
    "1ro_medio": "1ro Medio",
    "2do_medio": "2do Medio",
    "3ro_medio": "3ro Medio",
    "4to_medio": "4to Medio",
    "nt1_2": "NT1-2",
  }
  return map[normalized] || titleCaseFallback(folderName)
}

function canonicalAsignatura(folderName) {
  const normalized = normalizeTextId(folderName)
  const map = {
    [normalizeTextId("Educacion Fisica")]: "Educación Física y Salud",
    [normalizeTextId("Educación Física")]: "Educación Física y Salud",
    [normalizeTextId("Lenguaje y Comunicacion")]: "Lenguaje y Comunicación",
    [normalizeTextId("Lenguaje y Comunicación")]: "Lenguaje y Comunicación",
    [normalizeTextId("movimiento y corporalidad")]: "Corporalidad y Movimiento",
    [normalizeTextId("Corporalidad y Movimiento")]: "Corporalidad y Movimiento",
    [normalizeTextId("Musica")]: "Música",
  }
  return map[normalized] || titleCaseFallback(folderName)
}

async function extractPageData(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber)
  const textContent = await page.getTextContent()
  const items = textContent.items
    .map((item) => ({
      pageNumber,
      str: cleanInlineText(item.str),
      x: item.transform[4],
      y: item.transform[5],
    }))
    .filter((item) => item.str)

  return {
    pageNumber,
    items,
    fullLines: groupItemsIntoLines(items),
  }
}

function groupItemsIntoLines(items) {
  const rows = new Map()

  for (const item of items) {
    const key = Math.round(item.y * 2) / 2
    if (!rows.has(key)) rows.set(key, [])
    rows.get(key).push(item)
  }

  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([y, row]) => ({
      y,
      text: cleanLine(row.sort((a, b) => a.x - b.x).map((item) => item.str).join(" ")),
    }))
    .filter((line) => line.text)
}

function getRegionLines(page, split, side) {
  const filtered = page.items.filter((item) => (side === "left" ? item.x < split : item.x >= split))
  return groupItemsIntoLines(filtered)
}

function linesToDebugText(lines) {
  return lines.map((line) => line.text).join("\n")
}

function pageDebugBlock(page, style) {
  const left = getRegionLines(page, style.summarySplit || style.columnSplit, "left")
  const right = getRegionLines(page, style.summarySplit || style.columnSplit, "right")
  return [
    `===== PAGE ${page.pageNumber} FULL =====`,
    linesToDebugText(page.fullLines),
    "",
    `===== PAGE ${page.pageNumber} LEFT =====`,
    linesToDebugText(left),
    "",
    `===== PAGE ${page.pageNumber} RIGHT =====`,
    linesToDebugText(right),
    "",
  ].join("\n")
}

function extractUnitMarker(text) {
  const matches = [...(text || "").matchAll(/\bUnidad\s+(\d+)\b/gi)]
  if (matches.length === 0) return null
  return Number(matches.at(-1)[1])
}

function getSectionForPage(pageText) {
  const normalized = normalizeForMatch(pageText)
  if (
    normalized.includes("estructuradelprogramadeestudio") ||
    normalized.includes("paginaresumen") ||
    normalized.includes("objetivosdeaprendizajeeindicadoresdeevaluacionsugeridossonlosobjetivosdeaprendizaje") ||
    normalized.includes("ejemplosdeactividadesobjetivosdeaprendizajesonlosqueespecificanlasbasescurriculares") ||
    normalized.includes("ejemplosdeevaluacionobjetivosdeaprendizajesonlosqueespecificanlasbasescurriculares")
  ) {
    return "skip"
  }
  if (normalized.includes("resumendelaunidad")) return "summary"
  if (normalized.includes("ejemplosdeevaluacion")) return "evaluation"
  if (normalized.includes("ejemplosdeactividades")) return "activities"
  if (
    normalized.includes("objetivosdeaprendizaje") &&
    normalized.includes("indicadoresdeevaluacionsugeridos")
  ) {
    return "oas"
  }
  if (normalized.includes("orientacionesdidacticasparalaunidad")) return "skip"
  if (normalized.includes("lecturassugeridas")) return "skip"
  return null
}

function collectUnitsFromPages(pages) {
  const units = new Map()
  let currentUnit = null
  let currentSection = null
  let pendingMarker = null

  for (const page of pages) {
    const pageText = linesToDebugText(page.fullLines)
    const marker = extractUnitMarker(pageText)
    const section = getSectionForPage(pageText)

    if (marker) {
      pendingMarker = marker
      if (!section && currentUnit && marker !== currentUnit) {
        currentSection = null
      }
    }

    if (section === "summary") {
      const summaryUnit = marker || pendingMarker
      if (!summaryUnit) continue

      currentUnit = summaryUnit
      currentSection = "summary"

      if (!units.has(summaryUnit)) {
        units.set(summaryUnit, {
          number: summaryUnit,
          summaryPages: [],
          oaPages: [],
          activityPages: [],
          evaluationPages: [],
        })
      }
    }

    if (section === "skip") continue

    if (section && section !== "summary") {
      if (marker && units.has(marker)) {
        currentUnit = marker
      }
      currentSection = section
    }

    if (!currentUnit || !currentSection) continue

    const unit = units.get(currentUnit)
    if (currentSection === "summary") unit.summaryPages.push(page)
    if (currentSection === "oas") unit.oaPages.push(page)
    if (currentSection === "activities") unit.activityPages.push(page)
    if (currentSection === "evaluation") unit.evaluationPages.push(page)
  }

  return [...units.values()].sort((a, b) => a.number - b.number)
}

function filterMeaningfulLines(lines) {
  return lines
    .map((line) => (typeof line === "string" ? cleanLine(line) : cleanLine(line.text)))
    .filter((line) => line && !lineLooksLikeHeader(line))
}

function filterActivityBodyLines(lines) {
  return lines
    .map((line) => (typeof line === "string" ? cleanLine(line) : cleanLine(line.text)))
    .filter(Boolean)
    .filter((line) => {
      const normalized = normalizeForMatch(line)
      return !(
        normalized === "" ||
        normalized === "programadeestudio" ||
        normalized.startsWith("programadeestudio") ||
        normalized.startsWith("educacionfisicaysalud") ||
        normalized.startsWith("lenguajeycomunicacion") ||
        /^unidad\d+$/.test(normalized)
      )
    })
}

function parseSummary(unit, style, parserType) {
  const summaryLines = unit.summaryPages.flatMap((page) => {
    const left = filterMeaningfulLines(getRegionLines(page, style.summarySplit, "left"))
    const right = filterMeaningfulLines(getRegionLines(page, style.summarySplit, "right"))
    return [...left, ...right]
  })

  const sectionHeadings = new Map([
    ["proposito", "proposito"],
    ["conocimientosprevios", "conocimientos_previos"],
    ["palabrasclave", "palabras_clave"],
    ["conocimientos", "conocimientos"],
    ["habilidades", "habilidades"],
    ["actitudes", "actitudes"],
    ["propositogeneraldelnucleo", "proposito"],
  ])

  const sections = {
    proposito: [],
    conocimientos_previos: [],
    palabras_clave: [],
    conocimientos: [],
    habilidades: [],
    actitudes: [],
  }

  let currentSection = null
  for (const line of summaryLines) {
    const normalized = normalizeForMatch(line)
    if (sectionHeadings.has(normalized)) {
      currentSection = sectionHeadings.get(normalized)
      continue
    }

    if (!currentSection) continue
    sections[currentSection].push(line)
  }

  return {
    numero_unidad: unit.number,
    nombre_unidad: parserType === "nt" ? "Corporalidad y Movimiento" : `Unidad ${unit.number}`,
    proposito: joinParagraph(sections.proposito),
    conocimientos_previos: parseBulletArray(sections.conocimientos_previos),
    palabras_clave: parseCommaSeparatedArray(sections.palabras_clave),
    conocimientos: parseBulletArray(sections.conocimientos),
    habilidades: parseBulletArray(sections.habilidades),
    actitudes: parseBulletArray(sections.actitudes),
  }
}

function extractOaMarkers(lines) {
  return lines
    .map((line, index) => {
      const match = cleanLine(line.text).match(/^OA\s*_?\s*(\d+)/i)
      if (!match) return null
      return { index, number: Number(match[1]), y: line.y }
    })
    .filter(Boolean)
}

function linesBetweenIndexes(lines, startIndex, endIndex) {
  return lines.slice(startIndex, endIndex).map((line) => line.text)
}

function parseObjectiveDescription(lines) {
  return joinParagraph(
    lines.map((line) => line.replace(/^[›•\u00fa]\s*/, ""))
  )
}

function parseIndicatorsByBounds(rightLines, startY, endY) {
  const relevant = rightLines
    .filter((line) => !lineLooksLikeHeader(line.text))
    .filter((line) => line.y <= startY + 2 && (endY == null || line.y > endY + 2))
    .map((line) => line.text)

  return parseBulletArray(relevant)
}

function parseOAs(unit, style) {
  const objectives = []

  for (const page of unit.oaPages) {
    const leftLines = getRegionLines(page, style.columnSplit, "left")
    const rightLines = getRegionLines(page, style.columnSplit, "right")
    const markers = extractOaMarkers(leftLines)
    if (markers.length === 0) continue

    for (let index = 0; index < markers.length; index += 1) {
      const marker = markers[index]
      const nextMarker = markers[index + 1]
      const descriptionLines = linesBetweenIndexes(
        leftLines,
        marker.index + 1,
        nextMarker ? nextMarker.index : leftLines.length
      ).filter((line) => !lineLooksLikeHeader(line))

      objectives.push({
        tipo: "OA",
        numero: marker.number,
        descripcion: parseObjectiveDescription(descriptionLines),
        indicadores: parseIndicatorsByBounds(rightLines, marker.y, nextMarker?.y ?? null),
      })
    }
  }

  return objectives
}

function uniqueNumbers(values) {
  return [...new Set(values.filter((value) => Number.isFinite(value)))]
}

function oasFromSidebar(lines) {
  return uniqueNumbers(
    lines
      .map((line) => {
        const match = cleanLine(line.text).match(/^OA\s*_?\s*(\d+)/i)
        return match ? Number(match[1]) : null
      })
  )
}

function inlineOaNumbers(text) {
  return uniqueNumbers(
    [...text.matchAll(/OA\s*_?\s*(\d+)/gi)].map((match) => Number(match[1]))
  )
}

function looksLikeSectionTitle(line) {
  const cleaned = cleanLine(line)
  if (!cleaned || lineLooksLikeHeader(cleaned) || isBulletLine(cleaned)) return false
  if (/^OA\s*_?\s*\d+/i.test(cleaned)) return false
  if (/^(Actividad|Criterios de evaluaci[oó]n|Indicadores de evaluaci[oó]n|Observaciones al docente)/i.test(cleaned)) return false
  if (/^[a-z]/.test(cleaned)) return false
  return cleaned.length <= 80
}

function sentenceLooksLikeDescription(line) {
  return /^(El|La|Los|Las|Al|A la|A los|A las|En|Luego|Después|Antes|Mientras|Se|Un|Una)\b/i.test(line)
}

function shortenActivityName(text) {
  const cleaned = cleanInlineText(text)
    .replace(/[.:;]+$/g, "")
    .trim()
  if (!cleaned) return ""

  const words = cleaned.split(/\s+/g)
  if (words.length <= 8) return cleaned
  return `${words.slice(0, 8).join(" ")}...`
}

function resolveActivityName(rest, currentTitle, activityNumber) {
  const safeTitle = cleanInlineText(currentTitle)
  const safeRest = cleanInlineText(rest)

  if (safeTitle) {
    if (!safeRest) return safeTitle
    if (sentenceLooksLikeDescription(safeRest) || safeRest.length > 70 || /[?!.:]/.test(safeRest)) {
      return safeTitle
    }
  }

  if (safeRest) return shortenActivityName(safeRest)
  if (safeTitle) return safeTitle
  return `Actividad ${activityNumber}`
}

function parseActivities(unit, style) {
  const activities = []
  let current = null
  let currentTitle = ""
  let currentOas = []

  const closeCurrent = () => {
    if (!current) return
    const description = joinParagraph(current.descriptionLines)
    const inferredOas = uniqueNumbers([
      ...current.pageOas,
      ...inlineOaNumbers(description),
      ...inlineOaNumbers(current.name),
    ])

    activities.push({
      nombre: current.name || `Actividad ${activities.length + 1}`,
      oas_asociados: inferredOas,
      descripcion: description,
    })
    current = null
  }

  for (const page of unit.activityPages) {
    const sidebarLines = getRegionLines(page, style.columnSplit, "left")
    const bodyLines = filterActivityBodyLines(getRegionLines(page, style.columnSplit, "right"))
    const sidebarOas = oasFromSidebar(sidebarLines)
    if (sidebarOas.length > 0) currentOas = sidebarOas

    for (let index = 0; index < bodyLines.length; index += 1) {
      const line = bodyLines[index]
      const activityMatch = line.match(/^(\d+)\s*(.*)$/)

      if (/^Observaciones al docente/i.test(line)) {
        closeCurrent()
        currentTitle = ""
        continue
      }

      if (activityMatch) {
        closeCurrent()

        const rest = cleanLine(activityMatch[2] || "")
        current = {
          name: "",
          descriptionLines: [],
          pageOas: [...currentOas],
        }

        current.name = resolveActivityName(rest, currentTitle, activityMatch[1])

        if (rest && current.name !== shortenActivityName(rest)) {
          current.descriptionLines.push(rest)
        } else if (rest && currentTitle && current.name === currentTitle) {
          current.descriptionLines.push(rest)
        }

        currentTitle = ""
        continue
      }

      if (!current) {
        if (looksLikeSectionTitle(line)) {
          currentTitle = line
        }
        continue
      }

      if (
        (!current.name || /^Actividad \d+$/.test(current.name)) &&
        looksLikeSectionTitle(line) &&
        current.descriptionLines.length === 0
      ) {
        current.name = shortenActivityName(line)
        continue
      }

      current.descriptionLines.push(line)
    }
  }

  closeCurrent()
  return activities.filter((activity) => activity.descripcion)
}

function collectCriteriaLines(lines) {
  const relevant = filterMeaningfulLines(lines)
    .filter((line) => !/^Ejemplo\s+\d+/i.test(line))
    .filter((line) => !/^OA\s*_?\s*\d+/i.test(line))
    .filter((line) => !/^Actividad$/i.test(line))
    .filter((line) => !/^Pauta de respuestas$/i.test(line))
    .filter((line) => !/^Al evaluar, se sugiere considerar los siguientes criterios:?$/i.test(line))
    .filter((line) => !/^Indicadores de evaluaci[oó]n$/i.test(line))

  return parseBulletArray(relevant)
}

function parseEvaluations(unit) {
  const pageLines = unit.evaluationPages.flatMap((page) => page.fullLines.map((line) => line.text))
  const filteredLines = pageLines
    .map(cleanLine)
    .filter(Boolean)
    .filter((line) => !lineLooksLikeHeader(line))

  const evaluations = []
  let current = null
  let mode = null

  const closeCurrent = () => {
    if (!current) return

    current.oas_evaluados = uniqueNumbers(current.oas_evaluados)
    current.actividad_evaluacion = joinParagraph(current.activityLines)
    current.criterios_evaluacion = {
      criterios: collectCriteriaLines(current.criteriaLines),
    }

    delete current.activityLines
    delete current.criteriaLines
    evaluations.push(current)
    current = null
    mode = null
  }

  for (const line of filteredLines) {
    if (/^Ejemplo\s+\d+/i.test(line)) {
      closeCurrent()
      current = {
        titulo: line,
        oas_evaluados: [],
        activityLines: [],
        criteriaLines: [],
      }
      continue
    }

    if (!current) continue

    const oaMatch = line.match(/^OA\s*_?\s*(\d+)/i)
    if (oaMatch) {
      current.oas_evaluados.push(Number(oaMatch[1]))
      continue
    }

    if (/^Actividad$/i.test(line)) {
      mode = "activity"
      continue
    }

    if (/^Criterios de evaluaci[oó]n$/i.test(line) || /^Pauta de respuestas$/i.test(line)) {
      mode = "criteria"
      continue
    }

    if (/^Indicadores de evaluaci[oó]n$/i.test(line)) {
      mode = null
      continue
    }

    if (mode === "criteria") {
      current.criteriaLines.push(line)
      continue
    }

    if (mode === "activity") {
      current.activityLines.push(line)
      continue
    }
  }

  closeCurrent()

  return evaluations.filter((evaluation) => evaluation.actividad_evaluacion)
}

function buildAdecuacionesDua(asignatura) {
  if (normalizeTextId(asignatura) === normalizeTextId("Corporalidad y Movimiento")) {
    return {
      estrategias_neurodiversidad:
        "Ofrecer secuencias cortas de movimiento con apoyos visuales y demostración corporal, alternando exploración libre con consignas breves, música suave para regular la activación y materiales manipulables que permitan anticipar, repetir y autorregular la acción motriz.",
    }
  }

  return {
    estrategias_neurodiversidad:
      "Alternar instrucciones breves con demostraciones corporales, integrar música o ritmos para anticipar transiciones, permitir pausas activas guiadas y ofrecer apoyos visuales simples para sostener la atención, la autorregulación y la participación durante las actividades de la unidad.",
  }
}

function parseNtEntry({ nivel, asignatura, pages }) {
  const stripNtArtifacts = (text) =>
    cleanInlineText(
      (text || "")
        .replace(/Desarrollo Personal y Social \/ N[uú]cleo.*$/i, "")
        .replace(/\b\d+\s+Bases Curriculares de la Educaci[oó]n Parvularia.*$/i, "")
        .replace(/Cap[ií]tulo 2 \/ Organizaci[oó]n Curricular.*$/i, "")
    )

  const allLines = pages.flatMap((page) => page.fullLines.map((line) => line.text)).map(cleanLine).filter(Boolean)
  const purposeStart = allLines.findIndex((line) => normalizeForMatch(line) === "propositogeneraldelnucleo")
  const purposeEnd = allLines.findIndex(
    (line, index) => index > purposeStart && /^(Objetivos de Aprendizaje transversales|Primer Nivel)/i.test(line)
  )
  const proposito = stripNtArtifacts(joinParagraph(
    purposeStart >= 0
      ? allLines.slice(purposeStart + 1, purposeEnd > purposeStart ? purposeEnd : undefined)
      : []
  ))

  const transitionStart = allLines.findIndex((line) => /^Tercer Nivel/i.test(line))
  const objectiveLines = transitionStart >= 0
    ? allLines
        .slice(transitionStart + 1)
        .filter((line) => {
          const normalized = normalizeForMatch(line)
          return !(
            normalized === normalizeForMatch("Corporalidad y Movimiento") ||
            normalized.startsWith(normalizeForMatch("Desarrollo Personal y Social")) ||
            normalized.startsWith(normalizeForMatch("Capítulo 2")) ||
            normalized.startsWith(normalizeForMatch("Bases Curriculares de la Educación Parvularia"))
          )
        })
    : []
  const objectives = []
  let current = null

  for (const line of objectiveLines) {
    const match = line.match(/^(\d+)\.\s*(.*)$/)
    if (match) {
      if (current) {
        objectives.push(current)
      }
      current = {
        tipo: "OA",
        numero: Number(match[1]),
        descripcion: stripNtArtifacts(match[2].trim()),
        indicadores: [],
      }
      continue
    }

    if (!current) continue
    current.descripcion = stripNtArtifacts(`${current.descripcion} ${line}`)
  }

  if (current) objectives.push(current)

  return [
    {
      nivel,
      asignatura,
      unidad: {
        numero_unidad: 1,
        nombre_unidad: "Corporalidad y Movimiento",
        proposito,
        conocimientos_previos: [],
        palabras_clave: [],
        conocimientos: [],
        habilidades: [],
        actitudes: [],
        objetivos_aprendizaje: objectives,
        actividades_sugeridas: [],
        ejemplos_evaluacion: [],
        adecuaciones_dua: buildAdecuacionesDua(asignatura),
      },
    },
  ]
}

function buildEntries({ nivel, asignatura, parserType, units, style, pages }) {
  if (parserType === "nt") {
    return parseNtEntry({ nivel, asignatura, pages })
  }

  return units.map((unit) => {
    const summary = parseSummary(unit, style, parserType)

    return {
      nivel,
      asignatura,
      unidad: {
        ...summary,
        objetivos_aprendizaje: parseOAs(unit, style),
        actividades_sugeridas: parseActivities(unit, style),
        ejemplos_evaluacion: parseEvaluations(unit),
        adecuaciones_dua: buildAdecuacionesDua(asignatura),
      },
    }
  })
}

async function processPdf(pdfPath) {
  const relPath = relative(SOURCE_DIR, pdfPath)
  const [nivelFolder, asignaturaFolder] = relPath.split(/[\\/]/)
  if (!nivelFolder || !asignaturaFolder) {
    throw new Error(`No pude inferir nivel/asignatura desde ${relPath}`)
  }

  const nivel = canonicalNivel(nivelFolder)
  const asignatura = canonicalAsignatura(asignaturaFolder)
  const subjectKey = normalizeTextId(asignatura)
  const parserType = subjectKey === normalizeTextId("Corporalidad y Movimiento")
    ? "nt"
    : subjectKey === normalizeTextId("Lenguaje y Comunicación")
      ? "lenguaje"
      : "ef"

  const style = STYLE_MAP[subjectKey] || STYLE_MAP[normalizeTextId("Educación Física y Salud")]
  const data = new Uint8Array(readFileSync(pdfPath))
  const pdf = await getDocument({ data }).promise
  const pages = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    pages.push(await extractPageData(pdf, pageNumber))
  }

  const units = parserType === "nt" ? [] : collectUnitsFromPages(pages)
  const entries = buildEntries({ nivel, asignatura, parserType, units, style, pages })
  const docId = buildDocId(asignatura, nivel)

  ensureDir(TEXT_DIR)
  ensureDir(OUTPUT_DIR)
  ensureDir(LOG_DIR)

  writeFileSync(
    join(TEXT_DIR, `${docId}.txt`),
    pages.map((page) => pageDebugBlock(page, style || { summarySplit: 110, columnSplit: 110 })).join("\n"),
    "utf8"
  )

  writeJsonFile(join(OUTPUT_DIR, `${docId}.json`), entries)

  return {
    nivel,
    asignatura,
    docId,
    pdf: basename(pdfPath),
    unidades: entries.length,
  }
}

async function main() {
  const filterText = process.argv.slice(2).join(" ").trim().toLowerCase() || null
  const pdfs = walkPdfFiles(SOURCE_DIR)
  const results = []

  for (const pdfPath of pdfs) {
    const relPath = relative(SOURCE_DIR, pdfPath).toLowerCase()
    if (filterText && !relPath.includes(filterText)) continue

    const result = await processPdf(pdfPath)
    results.push(result)
    console.log(JSON.stringify(result, null, 2))
  }

  writeJsonFile(join(LOG_DIR, "extraction-summary.json"), {
    generatedAt: new Date().toISOString(),
    results,
  })
}

main().catch((error) => {
  console.error("EXTRACTION_ERROR", error)
  process.exitCode = 1
})
