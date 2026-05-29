import { createHash } from "crypto"
import { createReadStream, createWriteStream } from "fs"
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "fs/promises"
import { dirname, basename, join, resolve } from "path"
import { fileURLToPath } from "url"
import { pipeline } from "stream/promises"
import { createGzip } from "zlib"
import { spawn } from "child_process"
import { cert, deleteApp, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, initializeFirestore } from "firebase-admin/firestore"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = resolve(__dirname, "..")
const BACKUP_FORMAT = "edupanel.firestore.backup.v1"
const BACKUP_STATUS_FILE = "backup-status.json"
const BACKUP_LOCK_FILE = "backup-lock.json"

const originalEnvKeys = new Set(Object.keys(process.env))

function parseArgs(argv) {
  const args = {
    outDir: null,
    remote: false,
    plainJsonOnly: false,
    trigger: "manual-cli",
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--out-dir") {
      args.outDir = argv[i + 1]
      i += 1
    } else if (arg === "--remote") {
      args.remote = true
    } else if (arg === "--plain-json-only") {
      args.plainJsonOnly = true
    } else if (arg === "--trigger") {
      args.trigger = argv[i + 1] || args.trigger
      i += 1
    } else if (arg === "--help" || arg === "-h") {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`Argumento no reconocido: ${arg}`)
    }
  }

  return args
}

function printHelp() {
  console.log(`Uso:
  node scripts/firestore-backup.mjs [--out-dir backups/firestore] [--remote] [--trigger manual-admin]

Opciones:
  --out-dir <ruta>       Carpeta local donde guardar el respaldo.
  --remote               Envia el respaldo al servidor Ubuntu via SSH/SCP.
  --plain-json-only      No crea archivo .gz, solo JSON.
  --trigger <origen>     Etiqueta el origen del respaldo (ej. manual-admin, scheduled-hourly).

Variables requeridas:
  FIREBASE_ADMIN_PROJECT_ID
  FIREBASE_ADMIN_CLIENT_EMAIL
  FIREBASE_ADMIN_PRIVATE_KEY

Variables remotas opcionales:
  BACKUP_REMOTE_USER
  BACKUP_REMOTE_HOST
  BACKUP_REMOTE_PORT
  BACKUP_REMOTE_DIR
  BACKUP_REMOTE_IDENTITY_FILE`)
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

function shouldKeepPlainJson(args) {
  if (args.plainJsonOnly) return true
  const value = process.env.BACKUP_KEEP_PLAIN_JSON
  if (value === undefined || value === null || value === "") return true
  return ["1", "true", "yes", "si", "on"].includes(String(value).toLowerCase())
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

function serializeFirestoreValue(value) {
  if (value === null || value === undefined) return value
  if (typeof value !== "object") return value

  if (typeof value.toDate === "function" && typeof value.seconds === "number" && typeof value.nanoseconds === "number") {
    return {
      __type: "timestamp",
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
      iso: value.toDate().toISOString(),
    }
  }

  if (value instanceof Date) {
    return {
      __type: "date",
      iso: value.toISOString(),
    }
  }

  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return {
      __type: "bytes",
      base64: Buffer.from(value).toString("base64"),
    }
  }

  if (typeof value.toBase64 === "function" && value.constructor?.name === "Bytes") {
    return {
      __type: "bytes",
      base64: value.toBase64(),
    }
  }

  if (typeof value.latitude === "number" && typeof value.longitude === "number") {
    return {
      __type: "geopoint",
      latitude: value.latitude,
      longitude: value.longitude,
    }
  }

  if (typeof value.path === "string" && value.firestore) {
    return {
      __type: "reference",
      path: value.path,
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeFirestoreValue(item))
  }

  const output = {}
  for (const [key, nestedValue] of Object.entries(value)) {
    output[key] = serializeFirestoreValue(nestedValue)
  }
  return output
}

async function exportCollection(collectionRef, collector) {
  collector.collections.add(collectionRef.path)

  const snapshot = await collectionRef.get()
  const docs = [...snapshot.docs].sort((a, b) => a.ref.path.localeCompare(b.ref.path))

  for (const docSnap of docs) {
    collector.documents.push({
      path: docSnap.ref.path,
      id: docSnap.id,
      collectionPath: docSnap.ref.parent.path,
      createTime: docSnap.createTime?.toDate?.().toISOString?.() ?? null,
      updateTime: docSnap.updateTime?.toDate?.().toISOString?.() ?? null,
      data: serializeFirestoreValue(docSnap.data()),
    })

    const subcollections = await docSnap.ref.listCollections()
    const sortedSubcollections = subcollections.sort((a, b) => a.path.localeCompare(b.path))
    for (const subcollection of sortedSubcollections) {
      await exportCollection(subcollection, collector)
    }
  }
}

async function exportFirestore(db) {
  const collector = {
    collections: new Set(),
    documents: [],
  }

  const rootCollections = await db.listCollections()
  const sortedRootCollections = rootCollections.sort((a, b) => a.path.localeCompare(b.path))
  for (const collectionRef of sortedRootCollections) {
    await exportCollection(collectionRef, collector)
  }

  return {
    format: BACKUP_FORMAT,
    createdAt: new Date().toISOString(),
    projectId: env("FIREBASE_ADMIN_PROJECT_ID"),
    collectionCount: collector.collections.size,
    documentCount: collector.documents.length,
    collections: [...collector.collections].sort(),
    documents: collector.documents.sort((a, b) => a.path.localeCompare(b.path)),
  }
}

async function gzipFile(sourcePath, targetPath) {
  await pipeline(createReadStream(sourcePath), createGzip({ level: 9 }), createWriteStream(targetPath))
}

async function sha256File(filePath) {
  const hash = createHash("sha256")
  await pipeline(createReadStream(filePath), hash)
  return hash.digest("hex")
}

async function pruneOldBackups(outDir) {
  const retentionDays = Number(env("BACKUP_RETENTION_DAYS", "0"))
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return []

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const removed = []
  const entries = await readdir(outDir, { withFileTypes: true }).catch(() => [])

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!entry.name.startsWith("edupanel-firestore-")) continue
    if (![".json", ".gz", ".sha256"].some((suffix) => entry.name.endsWith(suffix))) continue

    const filePath = join(outDir, entry.name)
    const info = await stat(filePath)
    if (info.mtimeMs >= cutoff) continue

    await unlink(filePath)
    removed.push(filePath)
  }

  return removed
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"))
  } catch (error) {
    if (error.code === "ENOENT") return null
    throw error
  }
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function writeStatusFile(statusPath, nextState) {
  await writeFile(statusPath, `${JSON.stringify(nextState, null, 2)}\n`, "utf8")
}

async function readStatusFile(statusPath) {
  return (await readJsonIfExists(statusPath)) || {
    version: 1,
    updatedAt: null,
    running: null,
    lastSuccess: null,
    lastFailure: null,
  }
}

async function acquireBackupLock({ lockPath, statusPath, running }) {
  const existingLock = await readJsonIfExists(lockPath)
  if (existingLock?.pid && isProcessAlive(existingLock.pid)) {
    const started = existingLock.startedAt ? ` desde ${existingLock.startedAt}` : ""
    throw new Error(`Ya hay un respaldo en curso${started}.`)
  }

  if (existingLock) {
    await unlink(lockPath).catch(() => {})
  }

  const currentStatus = await readStatusFile(statusPath)
  await writeFile(lockPath, `${JSON.stringify(running, null, 2)}\n`, "utf8")
  await writeStatusFile(statusPath, {
    ...currentStatus,
    version: 1,
    updatedAt: new Date().toISOString(),
    running,
  })
}

async function finalizeBackupStatus({ statusPath, running, lastSuccess = undefined, lastFailure = undefined }) {
  const currentStatus = await readStatusFile(statusPath)
  await writeStatusFile(statusPath, {
    ...currentStatus,
    version: 1,
    updatedAt: new Date().toISOString(),
    running: null,
    lastSuccess: lastSuccess === undefined ? currentStatus.lastSuccess : lastSuccess,
    lastFailure: lastFailure === undefined ? currentStatus.lastFailure : lastFailure,
  })
}

function sshCommonArgs({ scp = false } = {}) {
  const args = []
  const port = env("BACKUP_REMOTE_PORT", "22")
  const identityFile = env("BACKUP_REMOTE_IDENTITY_FILE")

  if (scp) {
    args.push("-P", port)
  } else {
    args.push("-p", port)
  }

  if (identityFile) {
    args.push("-i", resolve(PROJECT_ROOT, identityFile))
  }

  return args
}

function shQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`
}

function runCommand(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      shell: false,
    })

    child.on("error", rejectPromise)
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise()
      } else {
        rejectPromise(new Error(`${command} termino con codigo ${code}`))
      }
    })
  })
}

async function uploadToRemote(files) {
  const user = env("BACKUP_REMOTE_USER")
  const host = env("BACKUP_REMOTE_HOST")
  const remoteDir = env("BACKUP_REMOTE_DIR")

  if (!user || !host || !remoteDir) {
    throw new Error(
      "Faltan datos del servidor remoto. Completa BACKUP_REMOTE_USER, BACKUP_REMOTE_HOST y BACKUP_REMOTE_DIR en .env.backup.local o .env.local."
    )
  }

  const target = `${user}@${host}`
  await runCommand("ssh", [...sshCommonArgs(), target, `mkdir -p ${shQuote(remoteDir)}`])
  await runCommand("scp", [...sshCommonArgs({ scp: true }), ...files, `${target}:${remoteDir}/`])

  return {
    host,
    user,
    dir: remoteDir,
    files: files.map((filePath) => basename(filePath)),
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  await loadBackupEnv()

  const outDir = resolve(PROJECT_ROOT, args.outDir || env("BACKUP_LOCAL_DIR", "backups/firestore"))
  await mkdir(outDir, { recursive: true })
  const statusPath = join(outDir, BACKUP_STATUS_FILE)
  const lockPath = join(outDir, BACKUP_LOCK_FILE)
  const startedAt = new Date().toISOString()
  const keepPlainJson = shouldKeepPlainJson(args)
  const shouldUploadRemote = args.remote || boolEnv("BACKUP_REMOTE_ENABLED")
  const running = {
    pid: process.pid,
    startedAt,
    trigger: args.trigger,
    outDir,
    remoteRequested: shouldUploadRemote,
  }

  await acquireBackupLock({ lockPath, statusPath, running })

  let app = null

  try {
    app = initAdminApp()
    const db = initFirestore(app)

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const backupBaseName = `edupanel-firestore-${timestamp}`
    const jsonPath = join(outDir, `${backupBaseName}.json`)
    const gzipPath = `${jsonPath}.gz`
    const checksumPath = join(outDir, `${backupBaseName}.sha256`)

    const snapshot = await exportFirestore(db)
    await writeFile(jsonPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8")

    let archivePath = jsonPath
    if (!args.plainJsonOnly) {
      await gzipFile(jsonPath, gzipPath)
      archivePath = gzipPath
      if (!keepPlainJson) {
        await unlink(jsonPath).catch(() => {})
      }
    }

    const checksum = await sha256File(archivePath)
    await writeFile(checksumPath, `${checksum}  ${basename(archivePath)}\n`, "utf8")

    const removedByRetention = await pruneOldBackups(outDir)
    const remote = shouldUploadRemote ? await uploadToRemote([archivePath, checksumPath]) : null
    const finishedAt = new Date().toISOString()
    const summary = {
      ok: true,
      trigger: args.trigger,
      startedAt,
      finishedAt,
      durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
      format: BACKUP_FORMAT,
      projectId: snapshot.projectId,
      collectionCount: snapshot.collectionCount,
      documentCount: snapshot.documentCount,
      localJsonPath: args.plainJsonOnly || keepPlainJson ? jsonPath : null,
      localArchivePath: archivePath,
      checksumPath,
      checksum,
      keepPlainJson,
      removedByRetention,
      remote,
    }

    await finalizeBackupStatus({
      statusPath,
      running,
      lastSuccess: summary,
      lastFailure: null,
    })

    console.log(JSON.stringify(summary, null, 2))
  } catch (error) {
    await finalizeBackupStatus({
      statusPath,
      running,
      lastFailure: {
        ok: false,
        trigger: args.trigger,
        startedAt,
        finishedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : String(error),
      },
    }).catch(() => {})
    throw error
  } finally {
    if (app) {
      await deleteApp(app).catch(() => {})
    }
    await unlink(lockPath).catch(() => {})
  }
}

main().catch(async (error) => {
  console.error("FIRESTORE_BACKUP_ERROR", error)
  process.exitCode = 1
})
