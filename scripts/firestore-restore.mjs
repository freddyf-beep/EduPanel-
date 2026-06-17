import { readFile } from "fs/promises"
import { dirname, join, resolve } from "path"
import { fileURLToPath } from "url"
import { gunzip } from "zlib"
import { promisify } from "util"
import { cert, deleteApp, getApps, initializeApp } from "firebase-admin/app"
import { GeoPoint, Timestamp, getFirestore, initializeFirestore } from "firebase-admin/firestore"

const unzip = promisify(gunzip)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = resolve(__dirname, "..")
const BACKUP_FORMAT = "edupanel.firestore.backup.v1"
const originalEnvKeys = new Set(Object.keys(process.env))

function parseArgs(argv) {
  const args = {
    backupPath: null,
    apply: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--apply") {
      args.apply = true
    } else if (arg === "--help" || arg === "-h") {
      printHelp()
      process.exit(0)
    } else if (!args.backupPath) {
      args.backupPath = arg
    } else {
      throw new Error(`Argumento no reconocido: ${arg}`)
    }
  }

  if (!args.backupPath) {
    throw new Error("Debes indicar la ruta del backup .json o .json.gz")
  }

  return args
}

function printHelp() {
  console.log(`Uso:
  node scripts/firestore-restore.mjs <backup.json|backup.json.gz> [--apply]

Sin --apply solo muestra un resumen. Con --apply sobrescribe los documentos del backup.`)
}

async function loadEnvFile(filePath, { overrideFileValues = false } = {}) {
  let raw
  try {
    raw = await readFile(filePath, "utf8")
  } catch (error) {
    if (error.code === "ENOENT") return
    throw error
  }

  for (const line of raw.replace(/\u0000/g, "").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([^#=\s]+)\s*=\s*(.*)\s*$/)
    if (!match) continue

    const key = match[1].trim()
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    if (originalEnvKeys.has(key)) continue
    if (process.env[key] === undefined || overrideFileValues) {
      process.env[key] = value
    }
  }
}

async function loadBackupEnv() {
  await loadEnvFile(join(PROJECT_ROOT, ".env.local"))
  await loadEnvFile(join(PROJECT_ROOT, ".env.backup.local"), { overrideFileValues: true })
}

function env(name, fallback = "") {
  const value = process.env[name]
  return value === undefined || value === null || value === "" ? fallback : value
}

function boolEnv(name) {
  return ["1", "true", "yes", "si", "on"].includes(env(name).toLowerCase())
}

function initAdminApp() {
  const projectId = env("FIREBASE_ADMIN_PROJECT_ID")
  const clientEmail = env("FIREBASE_ADMIN_CLIENT_EMAIL")
  const privateKeyRaw = env("FIREBASE_ADMIN_PRIVATE_KEY")

  if (!projectId || !clientEmail || !privateKeyRaw) {
    throw new Error(
      "Faltan credenciales Admin de Firebase. Completa FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL y FIREBASE_ADMIN_PRIVATE_KEY en .env.local."
    )
  }

  const existing = getApps()
  if (existing.length > 0) return existing[0]

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
    }),
    projectId,
  })
}

function initFirestore(app) {
  if (boolEnv("FIRESTORE_PREFER_REST")) {
    return initializeFirestore(app, { preferRest: true })
  }

  return getFirestore(app)
}

async function readBackupFile(filePath) {
  const resolved = resolve(PROJECT_ROOT, filePath)
  const raw = await readFile(resolved)
  const text = resolved.endsWith(".gz")
    ? (await unzip(raw)).toString("utf8")
    : raw.toString("utf8")

  return JSON.parse(text)
}

function restoreFirestoreValue(value, db) {
  if (value === null || value === undefined) return value
  if (typeof value !== "object") return value
  if (Array.isArray(value)) return value.map((item) => restoreFirestoreValue(item, db))

  if (value.__type === "timestamp") {
    return new Timestamp(value.seconds, value.nanoseconds)
  }

  if (value.__type === "date") {
    return new Date(value.iso)
  }

  if (value.__type === "bytes") {
    return Buffer.from(value.base64, "base64")
  }

  if (value.__type === "geopoint") {
    return new GeoPoint(value.latitude, value.longitude)
  }

  if (value.__type === "reference") {
    return db.doc(value.path)
  }

  const output = {}
  for (const [key, nestedValue] of Object.entries(value)) {
    output[key] = restoreFirestoreValue(nestedValue, db)
  }
  return output
}

async function restoreDocuments(db, documents) {
  let batch = db.batch()
  let pending = 0
  let restored = 0

  for (const doc of documents) {
    batch.set(db.doc(doc.path), restoreFirestoreValue(doc.data, db))
    pending += 1
    restored += 1

    if (pending >= 450) {
      await batch.commit()
      batch = db.batch()
      pending = 0
    }
  }

  if (pending > 0) {
    await batch.commit()
  }

  return restored
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  await loadBackupEnv()

  const backup = await readBackupFile(args.backupPath)
  if (backup.format !== BACKUP_FORMAT) {
    throw new Error(`Formato de backup inesperado: ${backup.format || "sin formato"}`)
  }

  const summary = {
    ok: true,
    dryRun: !args.apply,
    projectIdFromBackup: backup.projectId,
    targetProjectId: env("FIREBASE_ADMIN_PROJECT_ID"),
    createdAt: backup.createdAt,
    collectionCount: backup.collectionCount,
    documentCount: backup.documentCount,
  }

  if (!args.apply) {
    console.log(JSON.stringify(summary, null, 2))
    return
  }

  const app = initAdminApp()
  const db = initFirestore(app)
  const restoredDocumentCount = await restoreDocuments(db, backup.documents || [])
  await deleteApp(app).catch(() => {})

  console.log(JSON.stringify({
    ...summary,
    restoredDocumentCount,
  }, null, 2))
}

main().catch((error) => {
  console.error("FIRESTORE_RESTORE_ERROR", error)
  process.exitCode = 1
})
