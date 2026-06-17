/**
 * exportar-clases-unidad.mjs
 * ────────────────────────────────
 * SOLO LECTURA — Extrae datos de clases de la Unidad 2 de
 * Música - 3ro Básico y genera un Word listo para imprimir.
 *
 * Uso:  node scripts/exportar-clases-unidad.mjs
 */

import { readFileSync, writeFileSync } from "fs"
import { createRequire } from "module"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"
import { homedir } from "os"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, "..")
const require = createRequire(import.meta.url)

// ─── Cargar .env.local ──────────────────────────────────────
function loadEnv() {
  try {
    const raw = readFileSync(resolve(PROJECT_ROOT, ".env.local"), "utf8")
    for (const line of raw.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const idx = trimmed.indexOf("=")
      if (idx < 0) continue
      const key = trimmed.slice(0, idx).trim()
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "")
      if (!process.env[key]) process.env[key] = val
    }
  } catch (e) {
    console.error("❌ No se pudo cargar .env.local:", e.message)
    process.exit(1)
  }
}

loadEnv()

// ─── Dependencias ───────────────────────────────────────────
let admin, docx
try {
  admin = require("firebase-admin")
} catch {
  console.error("❌ firebase-admin no instalado")
  process.exit(1)
}
try {
  docx = require("docx")
} catch {
  console.error("❌ docx no instalado")
  process.exit(1)
}

const projectId   = process.env.FIREBASE_ADMIN_PROJECT_ID
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
const privateKey  = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n")

if (!projectId || !clientEmail || !privateKey) {
  console.error("❌ Faltan variables FIREBASE_ADMIN_* en .env.local")
  process.exit(1)
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  })
}

const db = admin.firestore()
const auth = admin.auth()

// ─── Constantes ──────────────────────────────────────────────
const ASIGNATURA = "Música"
const CURSO_DB   = "3°"          // Como aparece en Firestore
const CURSO_LABEL = "3ro Básico" // Nombre en el Word
const EMAIL      = "freddyfiguea@gmail.com"
const DESKTOP    = resolve(homedir(), "Desktop")

// ─── Desestructurar docx exports ────────────────────────────
const {
  Document, Packer, Paragraph, TextRun,
  Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, BorderStyle,
} = docx

// ─── Estilos (siguiendo el patrón del proyecto) ──────────────
const FONT = "Calibri"
const FONT_SZ = 18         // half-points → 9pt
const FONT_SZ_BOLD = 18
const FONT_SZ_TITLE = 32   // 16pt

const BORDER = {
  top:    { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  left:   { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  right:  { style: BorderStyle.SINGLE, size: 4, color: "000000" },
}

// Landscape A4: 297mm × 210mm → twips (1mm ≈ 56.7 twips)
const PAGE_W = 16840
const PAGE_H = 11900
const MARGIN = 900
const TABLE_W = PAGE_W - 2 * MARGIN

// Column widths (twips) — deben sumar TABLE_W
const W_NUM      = 650
const W_FECHA    = 1400
const W_OBJETIVO = 3500
const W_OAS      = 1400
const W_RESUMEN  = TABLE_W - W_NUM - W_FECHA - W_OBJETIVO - W_OAS  // ~7490

// ─── Helpers de datos ────────────────────────────────────────
function buildDocId(asignatura, nivel) {
  return (asignatura + "_" + nivel)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
}

function stripHtml(html) {
  if (!html) return ""
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#?\w+;/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function formatOA(oaId) {
  const s = String(oaId)
  const match = s.match(/^OA[T]?\s*[_\s]?\s*(\d+)$/i)
  if (match) {
    const prefix = s.match(/^OAT/i) ? "OAT" : "OA"
    return `${prefix} ${match[1].padStart(2, "0")}`
  }
  return s
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean)
}

function resumirClase(inicio, desarrollo, cierre) {
  const iniSentences = splitSentences(stripHtml(inicio))
  const desSentences = splitSentences(stripHtml(desarrollo))
  const cieSentences = splitSentences(stripHtml(cierre))

  // Priorizar desarrollo (núcleo de la clase), luego inicio, luego cierre
  const all = [...desSentences, ...iniSentences, ...cieSentences]
  if (!all.length) return "(Sin detalle registrado)"

  const MAX_WORDS = 55
  let summary = ""
  let wordCount = 0

  for (const sentence of all) {
    const words = sentence.split(/\s+/).filter(w => w.length > 0).length
    if (wordCount + words > MAX_WORDS) {
      // Si ya tenemos algo, cortamos; si no, metemos esta frase truncada
      if (summary) break
      const truncated = sentence.split(/\s+/).slice(0, MAX_WORDS).join(" ")
      return truncated + "…"
    }
    summary += (summary ? " " : "") + sentence
    wordCount += words
  }

  return summary
}

// ─── Helpers de Word ─────────────────────────────────────────

/** Celda de encabezado — fondo oscuro, texto blanco, centrado */
function headerCell(text, width) {
  return new TableCell({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 50, after: 50 },
      children: [new TextRun({ text, bold: true, size: FONT_SZ_BOLD, font: FONT, color: "FFFFFF" })],
    })],
    width: { size: width, type: WidthType.DXA },
    borders: BORDER,
    shading: { fill: "333333", type: "solid" },
  })
}

/** Celda de datos */
function dataCell(text, width, opts = {}) {
  const { center } = opts
  return new TableCell({
    children: [new Paragraph({
      alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { before: 40, after: 40 },
      children: [new TextRun({ text: String(text), size: FONT_SZ, font: FONT })],
    })],
    width: { size: width, type: WidthType.DXA },
    borders: BORDER,
  })
}

// ─── Extraer datos ───────────────────────────────────────────
async function extraerUnidad(uid, unidadIndex) {
  const numUnidad = unidadIndex + 1
  const docBase  = buildDocId(ASIGNATURA, CURSO_DB)
  const planId   = `plan_${docBase}`

  console.log(`  Buscando plan: planificaciones_curso/${planId}`)
  const planSnap = await db.collection("users").doc(uid)
    .collection("planificaciones_curso").doc(planId).get()

  if (!planSnap.exists) {
    console.error(`  ❌ Planificación no encontrada`)
    return null
  }

  const plan = planSnap.data()
  const unit = (plan.units || [])[unidadIndex]
  if (!unit) {
    console.error(`  ❌ No existe unidad ${numUnidad}`)
    return null
  }

  console.log(`  📘 "${unit.name}" | ${unit.hours || "?"} h ped. | ${unit.start || "?"} → ${unit.end || "?"}`)

  // Cronograma
  const unidadIdNum = String(unit.id)
  const cronoIds = [...new Set([
    `${docBase}_crono_${unidadIdNum}`,
    `${docBase}_crono_unidad_${unit.id}`,
    `${docBase}_crono_unidad_${numUnidad}`,
  ])]

  let cronograma = null
  for (const cid of cronoIds) {
    const snap = await db.collection("users").doc(uid)
      .collection("cronograma_unidad").doc(cid).get()
    if (snap.exists) { cronograma = snap.data(); break }
  }

  if (!cronograma?.clases?.length) {
    console.error(`  ⚠️ Sin cronograma`)
    return { unidad: unit, clases: [] }
  }

  // Ordenar por fecha
  const parseF = f => {
    if (!f) return "9999-99-99"
    const p = f.split("/")
    return p.length === 3 ? `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}` : f
  }
  const ordenadas = [...cronograma.clases].sort((a, b) =>
    parseF(a.fecha || "").localeCompare(parseF(b.fecha || ""))
  )

  // ─── Resúmenes manuales (proporcionados por el docente) ─────
  const RESUMENES = {
    1: "Se realizó una escucha atenta de la sesión. Luego, los estudiantes cerraron los ojos para identificar las sensaciones que produce la música. A partir de ejemplos musicales clásicos y andinos, los estudiantes conocen el concepto ABA. Por último, se presentó un musicograma, utilizando también las manos para diferenciar una parte de otra.",
    2: "Se finalizó el musicograma iniciado en la clase anterior. Además, se realizó un musicograma libre donde los estudiantes escucharon música clásica de Vivaldi y Mozart, identificando repeticiones y dinámicas a través del movimiento corporal.",
    3: "Se inició el tema de secuencia en teoría musical con la melodía \"Estrellita\", ya conocida por los estudiantes. Se trabajó el marcado del pulso mediante una escucha guiada y una secuencia didáctica orientada a aprender a tocar la pieza.",
    4: "Se retomó el trabajo de secuencia musical con la pieza \"El Ingrato\". Esta clase constituyó la prueba, donde se realizó una declamación completa de la partitura, aplicando los conceptos trabajados previamente.",
    5: "Se explicó el concepto de línea melódica trabajado en clases anteriores y se realizó un ensayo para la prueba. Se hizo una retroalimentación sobre lo realizado por los estudiantes y un breve repaso de los contenidos vistos.",
  }

  // Cargar detalle de cada clase
  const actPrefijos = [...new Set([
    `${docBase}_${unidadIdNum}`,
    `${docBase}_unidad_${unit.id}`,
    `${docBase}_unidad_${numUnidad}`,
  ])]

  const clases = []
  for (const c of ordenadas) {
    let detalle = null
    for (const pf of actPrefijos) {
      const snap = await db.collection("users").doc(uid)
        .collection("actividades_clase").doc(`${pf}_clase${c.numero}`).get()
      if (snap.exists) { detalle = snap.data(); break }
    }
    clases.push({
      numero: c.numero,
      fecha: c.fecha || "Sin fecha",
      oaIds: c.oaIds || [],
      objetivo: detalle?.objetivo || "",
      inicio: detalle?.inicio || "",
      desarrollo: detalle?.desarrollo || "",
      cierre: detalle?.cierre || "",
      resumenManual: RESUMENES[c.numero] || null,
    })
  }

  console.log(`  📊 ${clases.length} clases extraídas`)
  return { unidad: unit, clases }
}

// ─── Generar Word ────────────────────────────────────────────
async function generarWord(data, outputPath) {
  const { unidad, clases } = data

  // Header de tabla
  const rows = [
    new TableRow({
      tableHeader: true,
      children: [
        headerCell("N°", W_NUM),
        headerCell("Fecha", W_FECHA),
        headerCell("Objetivo de la clase", W_OBJETIVO),
        headerCell("OAs", W_OAS),
        headerCell("Resumen de lo realizado", W_RESUMEN),
      ],
    }),
  ]

  // Filas de datos
  for (const c of clases) {
    const resumen = c.resumenManual || resumirClase(c.inicio, c.desarrollo, c.cierre)
    rows.push(new TableRow({
      children: [
        dataCell(c.numero, W_NUM, { center: true }),
        dataCell(c.fecha, W_FECHA, { center: true }),
        dataCell(stripHtml(c.objetivo) || "(Sin objetivo)", W_OBJETIVO),
        dataCell(c.oaIds.map(formatOA).join(", ") || "—", W_OAS, { center: true }),
        dataCell(resumen, W_RESUMEN),
      ],
    }))
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size:   { width: PAGE_W, height: PAGE_H },
          margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
        },
      },
      children: [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          children: [
            new TextRun({
              text: `Unidad 2: ${unidad.name}`,
              bold: true, size: FONT_SZ_TITLE, font: FONT,
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 40 },
          children: [
            new TextRun({
              text: `${ASIGNATURA} — ${CURSO_LABEL}`,
              size: 24, color: "555555", font: FONT,
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
          children: [
            new TextRun({
              text: `Docente: Freddy Figueroa  |  ${unidad.start || "?"} al ${unidad.end || "?"}  |  ${clases.length} clases`,
              size: 20, color: "777777", italics: true, font: FONT,
            }),
          ],
        }),
        new Table({
          width: { size: TABLE_W, type: WidthType.DXA },
          rows,
        }),
      ],
    }],
  })

  const buffer = await Packer.toBuffer(doc)
  writeFileSync(outputPath, buffer)
  console.log(`  📄 ${outputPath}`)
}

// ─── MAIN ─────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════")
  console.log("  Exportador de Clases → Word  (SOLO LECTURA)")
  console.log("═══════════════════════════════════════════════════\n")

  console.log(`🔍 Buscando: ${EMAIL}`)
  const user = await auth.getUserByEmail(EMAIL)
  console.log(`   ✅ ${user.displayName || user.email} (${user.uid})\n`)

  const uid = user.uid

  // Solo Unidad 2 (índice 1)
  console.log("─── Unidad 2 ───")
  const data = await extraerUnidad(uid, 1)
  if (!data || !data.clases.length) {
    console.log("   ❌ No hay datos que exportar.")
    process.exit(0)
  }

  const out = resolve(DESKTOP, "Clases_Unidad_2_Musica_3ro_Basico_v3.docx")
  await generarWord(data, out)

  console.log(`\n✅ Listo: ${out}`)
}

main().catch(err => {
  console.error("\n❌ Error:", err.message)
  console.error(err.stack)
  process.exit(1)
})
