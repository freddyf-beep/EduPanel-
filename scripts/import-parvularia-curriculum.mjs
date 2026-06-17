import { readFileSync, readdirSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { createRequire } from "module"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, "..")
const sourceDir = process.argv.find((arg) => arg.startsWith("--source="))?.slice("--source=".length)
  || "C:/Users/fredd/Desktop/Bases_Curriculares_Parvularia"
const shouldWrite = process.argv.includes("--yes")

function loadEnv() {
  const raw = readFileSync(join(rootDir, ".env.local"), "utf8")
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const idx = trimmed.indexOf("=")
    if (idx < 0) continue
    const key = trimmed.slice(0, idx).trim()
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "")
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv()

const require = createRequire(import.meta.url)
const admin = require("firebase-admin")

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  })
}

const db = admin.firestore()

function normalizeKeyPart(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
}

function buildDocId(asignatura, nivel) {
  return `${normalizeKeyPart(asignatura)}_${normalizeKeyPart(nivel)}`.replace(/^_+|_+$/g, "")
}

function parseObjectiveCode(codigo) {
  const raw = String(codigo || "")
  const numberMatch = raw.match(/\b(?:OA|OAT)\s*(\d+)/i)
  const typeMatch = raw.match(/\b(OAT|OA)\b/i)
  return {
    numero: numberMatch ? Number(numberMatch[1]) : null,
    tipo: typeMatch ? typeMatch[1].toUpperCase() : "OA",
  }
}

function readEntries() {
  return readdirSync(sourceDir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => {
      const data = JSON.parse(readFileSync(join(sourceDir, file), "utf8"))
      return { file, data }
    })
}

function validateEntry(file, data) {
  const issues = []
  if (!data?.ambito) issues.push("Falta ambito")
  if (!data?.nivel) issues.push("Falta nivel")
  if (!Array.isArray(data?.nucleos) || data.nucleos.length === 0) issues.push("No trae nucleos")

  for (const nucleo of data?.nucleos || []) {
    if (!nucleo.nucleo) issues.push(`Nucleo sin nombre en ${file}`)
    if (!Array.isArray(nucleo.objetivos) || nucleo.objetivos.length === 0) {
      issues.push(`Nucleo sin objetivos: ${nucleo.nucleo || "(sin nombre)"}`)
    }
    const seen = new Set()
    for (const objetivo of nucleo.objetivos || []) {
      const parsed = parseObjectiveCode(objetivo.codigo)
      if (!parsed.numero) issues.push(`Objetivo sin numero: ${objetivo.codigo || "(sin codigo)"}`)
      if (parsed.numero && seen.has(parsed.numero)) issues.push(`Objetivo repetido ${parsed.numero} en ${nucleo.nucleo}`)
      if (parsed.numero) seen.add(parsed.numero)
      if (!objetivo.descripcion) issues.push(`Objetivo sin descripcion: ${objetivo.codigo || "(sin codigo)"}`)
    }
  }

  return issues
}

async function writeEntry({ file, data }) {
  const docId = buildDocId(data.ambito, data.nivel)
  const docRef = db.collection("curriculo").doc(docId)
  const totalOas = data.nucleos.reduce((sum, nucleo) => sum + (nucleo.objetivos || []).length, 0)

  console.log(`${shouldWrite ? "IMPORT" : "DRY"} ${docId} <- ${file} (${data.nucleos.length} nucleos, ${totalOas} objetivos)`)
  if (!shouldWrite) return

  await db.recursiveDelete(docRef).catch(() => null)
  await docRef.set({
    ready: true,
    asignatura: data.ambito,
    nivel: data.nivel,
    esParvularia: true,
    tipoCurriculo: "bases_parvularia_2018",
    estructura: "ambito_tramo_nucleos",
    titulo_pagina: data.titulo_pagina || "",
    fuente: "Bases Curriculares de la Educación Parvularia 2018",
    actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
  })

  for (const [index, nucleo] of data.nucleos.entries()) {
    const unidadNumero = index + 1
    const unidadRef = docRef.collection("unidades").doc(`unidad_${unidadNumero}`)
    await unidadRef.set({
      numero_unidad: unidadNumero,
      nombre_unidad: nucleo.nucleo,
      ambito: data.ambito,
      nivel_parvularia: data.nivel,
      proposito: "",
      conocimientos_previos: [],
      palabras_clave: [data.ambito, data.nivel, nucleo.nucleo],
      conocimientos: [],
      habilidades: [],
      actitudes: [],
      adecuaciones_dua: "",
    })

    for (const objetivo of nucleo.objetivos || []) {
      const parsed = parseObjectiveCode(objetivo.codigo)
      if (!parsed.numero) continue
      await unidadRef.collection("objetivos_aprendizaje").doc(`oa_${parsed.numero}`).set({
        tipo: parsed.tipo,
        numero: parsed.numero,
        codigo: objetivo.codigo,
        descripcion: objetivo.descripcion,
        indicadores: [],
        nucleo: nucleo.nucleo,
        ambito: data.ambito,
        nivel_parvularia: data.nivel,
      })
    }
  }
}

async function main() {
  const entries = readEntries()
  const allIssues = []
  for (const entry of entries) {
    const issues = validateEntry(entry.file, entry.data)
    if (issues.length) allIssues.push({ file: entry.file, issues })
  }

  if (allIssues.length) {
    console.error("Errores de validacion:")
    for (const item of allIssues) {
      console.error(`- ${item.file}`)
      item.issues.forEach((issue) => console.error(`  * ${issue}`))
    }
    process.exit(2)
  }

  for (const entry of entries) {
    await writeEntry(entry)
  }

  if (!shouldWrite) {
    console.log("Dry-run: no se escribio nada. Ejecuta con --yes para importar.")
  }
}

main().catch((error) => {
  console.error("Error:", error)
  process.exit(1)
})
