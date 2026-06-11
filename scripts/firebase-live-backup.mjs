import { createHash } from "crypto"
import { createReadStream, createWriteStream } from "fs"
import { mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from "fs/promises"
import { basename, dirname, join, resolve } from "path"
import { fileURLToPath } from "url"
import { pipeline } from "stream/promises"
import { createGzip } from "zlib"
import { cert, getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore, initializeFirestore } from "firebase-admin/firestore"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = resolve(__dirname, "..")

const FIRESTORE_BACKUP_FORMAT = "edupanel.firestore.backup.v1"
const AUTH_BACKUP_FORMAT = "edupanel.firebase-auth.backup.v1"
const SERVICE_VERSION = 1

const originalEnvKeys = new Set(Object.keys(process.env))
const watchedCollections = new Map()
const knownDocumentPaths = new Set()
const pendingWrites = new Set()
let atomicWriteCounter = 0
let shuttingDown = false
let lastFirestoreChangeAt = null
let lastAuthChangeAt = null
let lastFullSnapshotAt = null
let authState = new Map()
let lastError = null
let firestoreSnapshotRunning = false

function parseArgs(argv) {
  const args = {
    once: false,
    noWatch: false,
  }

  for (const arg of argv) {
    if (arg === "--once") args.once = true
    else if (arg === "--no-watch") args.noWatch = true
    else if (arg === "--help" || arg === "-h") {
      console.log(`Uso:
  node scripts/firebase-live-backup.mjs
  node scripts/firebase-live-backup.mjs --once

Variables:
  FIREBASE_ADMIN_PROJECT_ID
  FIREBASE_ADMIN_CLIENT_EMAIL
  FIREBASE_ADMIN_PRIVATE_KEY
  FIREBASE_LIVE_BACKUP_DIR
  AUTH_POLL_INTERVAL_MS
  FIRESTORE_DISCOVERY_INTERVAL_MS
  FIRESTORE_FULL_SNAPSHOT_INTERVAL_MS`)
      process.exit(0)
    } else {
      throw new Error(`Argumento no reconocido: ${arg}`)
    }
  }

  return args
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

async function loadEnv() {
  await loadEnvFile(join(PROJECT_ROOT, ".env.local"))
  await loadEnvFile(join(PROJECT_ROOT, ".env.backup.local"), { overrideFileValues: true })
  await loadEnvFile(join(PROJECT_ROOT, ".env.live.local"), { overrideFileValues: true })
}

function env(name, fallback = "") {
  const value = process.env[name]
  return value === undefined || value === null || value === "" ? fallback : value
}

function intEnv(name, fallback) {
  const raw = Number(env(name, String(fallback)))
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
}

function initAdminApp() {
  return initAdminAppNamed("[DEFAULT]")
}

function initAdminAppNamed(name) {
  const projectId = env("FIREBASE_ADMIN_PROJECT_ID")
  const clientEmail = env("FIREBASE_ADMIN_CLIENT_EMAIL")
  const privateKeyRaw = env("FIREBASE_ADMIN_PRIVATE_KEY")

  if (!projectId || !clientEmail || !privateKeyRaw) {
    throw new Error("Faltan FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL o FIREBASE_ADMIN_PRIVATE_KEY")
  }

  const existing = getApps().find((app) => app.name === name)
  if (existing) return existing

  const options = {
    credential: cert({
      projectId,
      clientEmail,
      privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
    }),
    projectId,
  }

  return name === "[DEFAULT]"
    ? initializeApp(options)
    : initializeApp(options, name)
}

function initSnapshotFirestore() {
  const app = initAdminAppNamed("edupanel-live-backup-rest")
  return initializeFirestore(app, { preferRest: true })
}

function backupDir() {
  return resolve(PROJECT_ROOT, env("FIREBASE_LIVE_BACKUP_DIR", "backups/firebase-live"))
}

function dirs() {
  const base = backupDir()
  return {
    base,
    firestoreCurrent: join(base, "firestore", "current"),
    firestoreEvents: join(base, "firestore", "events"),
    firestoreSnapshots: join(base, "firestore", "snapshots"),
    authCurrent: join(base, "auth", "current"),
    authEvents: join(base, "auth", "events"),
    authSnapshots: join(base, "auth", "snapshots"),
    logs: join(base, "logs"),
    status: join(base, "status.json"),
  }
}

async function ensureDirs() {
  const all = dirs()
  await Promise.all([
    mkdir(all.firestoreCurrent, { recursive: true }),
    mkdir(all.firestoreEvents, { recursive: true }),
    mkdir(all.firestoreSnapshots, { recursive: true }),
    mkdir(all.authCurrent, { recursive: true }),
    mkdir(all.authEvents, { recursive: true }),
    mkdir(all.authSnapshots, { recursive: true }),
    mkdir(all.logs, { recursive: true }),
  ])
}

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-")
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function encodeSegment(segment) {
  return encodeURIComponent(segment).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

function mirrorDocPath(docPath) {
  return join(dirs().firestoreCurrent, ...docPath.split("/").map(encodeSegment), "__doc.json")
}

async function writeAtomic(filePath, content) {
  await mkdir(dirname(filePath), { recursive: true })
  atomicWriteCounter += 1
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${atomicWriteCounter}.${Math.random().toString(16).slice(2)}.tmp`
  await writeFile(tmp, content, "utf8")
  await rename(tmp, filePath)
}

async function appendJsonl(filePath, item) {
  await mkdir(dirname(filePath), { recursive: true })
  const line = `${JSON.stringify(item)}\n`
  const write = writeFile(filePath, line, { encoding: "utf8", flag: "a" })
  pendingWrites.add(write)
  try {
    await write
  } finally {
    pendingWrites.delete(write)
  }
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
    return { __type: "date", iso: value.toISOString() }
  }

  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { __type: "bytes", base64: Buffer.from(value).toString("base64") }
  }

  if (typeof value.toBase64 === "function" && value.constructor?.name === "Bytes") {
    return { __type: "bytes", base64: value.toBase64() }
  }

  if (typeof value.latitude === "number" && typeof value.longitude === "number") {
    return {
      __type: "geopoint",
      latitude: value.latitude,
      longitude: value.longitude,
    }
  }

  if (typeof value.path === "string" && value.firestore) {
    return { __type: "reference", path: value.path }
  }

  if (Array.isArray(value)) return value.map((item) => serializeFirestoreValue(item))

  const output = {}
  for (const [key, nestedValue] of Object.entries(value)) {
    output[key] = serializeFirestoreValue(nestedValue)
  }
  return output
}

function serializeDocSnapshot(docSnap) {
  return {
    path: docSnap.ref.path,
    id: docSnap.id,
    collectionPath: docSnap.ref.parent.path,
    createTime: docSnap.createTime?.toDate?.().toISOString?.() ?? null,
    updateTime: docSnap.updateTime?.toDate?.().toISOString?.() ?? null,
    data: serializeFirestoreValue(docSnap.data()),
  }
}

async function persistFirestoreDoc(docSnap, changeType, source) {
  const serialized = serializeDocSnapshot(docSnap)
  knownDocumentPaths.add(docSnap.ref.path)
  await writeAtomic(mirrorDocPath(docSnap.ref.path), `${JSON.stringify(serialized, null, 2)}\n`)

  const now = new Date()
  lastFirestoreChangeAt = now.toISOString()
  await appendJsonl(join(dirs().firestoreEvents, `${dayKey(now)}.jsonl`), {
    format: "edupanel.firestore.event.v1",
    observedAt: now.toISOString(),
    projectId: env("FIREBASE_ADMIN_PROJECT_ID"),
    type: changeType,
    source,
    path: docSnap.ref.path,
    collectionPath: docSnap.ref.parent.path,
    data: serialized.data,
    createTime: serialized.createTime,
    updateTime: serialized.updateTime,
  })
}

async function persistFirestoreDelete(docSnap, source) {
  knownDocumentPaths.delete(docSnap.ref.path)
  await rm(mirrorDocPath(docSnap.ref.path), { force: true }).catch(() => {})

  const now = new Date()
  lastFirestoreChangeAt = now.toISOString()
  await appendJsonl(join(dirs().firestoreEvents, `${dayKey(now)}.jsonl`), {
    format: "edupanel.firestore.event.v1",
    observedAt: now.toISOString(),
    projectId: env("FIREBASE_ADMIN_PROJECT_ID"),
    type: "removed",
    source,
    path: docSnap.ref.path,
    collectionPath: docSnap.ref.parent.path,
  })
}

async function watchSubcollectionsForDoc(docRef, db) {
  try {
    const subcollections = await docRef.listCollections()
    for (const subcollection of subcollections.sort((a, b) => a.path.localeCompare(b.path))) {
      watchCollection(subcollection, db)
    }
  } catch (error) {
    recordError(`No se pudieron listar subcolecciones de ${docRef.path}`, error)
  }
}

function watchCollection(collectionRef, db) {
  if (shuttingDown || watchedCollections.has(collectionRef.path)) return

  let initial = true
  console.log(`[firestore] watch ${collectionRef.path}`)

  const unsubscribe = collectionRef.onSnapshot(
    (snapshot) => {
      const changes = snapshot.docChanges()
      Promise.all(changes.map(async (change) => {
        if (change.type === "removed") {
          await persistFirestoreDelete(change.doc, initial ? "initial-listen" : "listen")
          return
        }

        await persistFirestoreDoc(change.doc, change.type, initial ? "initial-listen" : "listen")
        await watchSubcollectionsForDoc(change.doc.ref, db)
      }))
        .catch((error) => recordError(`Error procesando cambios en ${collectionRef.path}`, error))
        .finally(() => {
          initial = false
        })
    },
    (error) => {
      recordError(`Listener caido en ${collectionRef.path}`, error)
      watchedCollections.delete(collectionRef.path)
      if (!shuttingDown) {
        setTimeout(() => watchCollection(collectionRef, db), 30_000).unref()
      }
    }
  )

  watchedCollections.set(collectionRef.path, unsubscribe)
}

async function discoverRootCollections(db) {
  const rootCollections = await db.listCollections()
  for (const collectionRef of rootCollections.sort((a, b) => a.path.localeCompare(b.path))) {
    watchCollection(collectionRef, db)
  }
}

async function discoverKnownSubcollections(db) {
  const paths = [...knownDocumentPaths].sort()
  for (const docPath of paths) {
    if (shuttingDown) return
    await watchSubcollectionsForDoc(db.doc(docPath), db)
  }
}

async function exportCollection(collectionRef, collector) {
  collector.collections.add(collectionRef.path)
  const snapshot = await withRetry(`get ${collectionRef.path}`, () => collectionRef.get())
  const docs = [...snapshot.docs].sort((a, b) => a.ref.path.localeCompare(b.ref.path))

  for (const docSnap of docs) {
    collector.documents.push(serializeDocSnapshot(docSnap))
    const subcollections = await withRetry(`listCollections ${docSnap.ref.path}`, () => docSnap.ref.listCollections())
    for (const subcollection of subcollections.sort((a, b) => a.path.localeCompare(b.path))) {
      await exportCollection(subcollection, collector)
    }
  }
}

async function exportFirestore(db) {
  const collector = {
    collections: new Set(),
    documents: [],
  }

  const rootCollections = await withRetry("list root collections", () => db.listCollections())
  for (const collectionRef of rootCollections.sort((a, b) => a.path.localeCompare(b.path))) {
    await exportCollection(collectionRef, collector)
  }

  return {
    format: FIRESTORE_BACKUP_FORMAT,
    createdAt: new Date().toISOString(),
    projectId: env("FIREBASE_ADMIN_PROJECT_ID"),
    collectionCount: collector.collections.size,
    documentCount: collector.documents.length,
    collections: [...collector.collections].sort(),
    documents: collector.documents.sort((a, b) => a.path.localeCompare(b.path)),
  }
}

async function collectFiles(rootDir, predicate, output = []) {
  const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const filePath = join(rootDir, entry.name)
    if (entry.isDirectory()) {
      await collectFiles(filePath, predicate, output)
    } else if (entry.isFile() && predicate(filePath)) {
      output.push(filePath)
    }
  }
  return output
}

async function exportFirestoreFromMirror() {
  const files = await collectFiles(dirs().firestoreCurrent, (filePath) => filePath.endsWith(`${encodeSegment("__doc.json")}`) || filePath.endsWith("__doc.json"))
  const documents = []
  const collections = new Set()

  for (const filePath of files.sort()) {
    const doc = JSON.parse(await readFile(filePath, "utf8"))
    if (!doc?.path || !doc?.collectionPath) continue
    documents.push(doc)
    collections.add(doc.collectionPath)
  }

  if (documents.length === 0) {
    throw new Error("El espejo local de Firestore aun no tiene documentos para snapshot.")
  }

  return {
    format: FIRESTORE_BACKUP_FORMAT,
    createdAt: new Date().toISOString(),
    projectId: env("FIREBASE_ADMIN_PROJECT_ID"),
    collectionCount: collections.size,
    documentCount: documents.length,
    collections: [...collections].sort(),
    documents: documents.sort((a, b) => a.path.localeCompare(b.path)),
    source: "firebase-live-mirror",
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

async function writeCompressedSnapshot(filePath, payload) {
  const jsonPath = filePath.replace(/\.gz$/, "")
  await writeAtomic(jsonPath, `${JSON.stringify(payload, null, 2)}\n`)
  await gzipFile(jsonPath, filePath)
  await unlink(jsonPath).catch(() => {})
  const checksum = await sha256File(filePath)
  await writeAtomic(`${filePath}.sha256`, `${checksum}  ${basename(filePath)}\n`)
  return checksum
}

async function runFullFirestoreSnapshot(db, reason) {
  if (firestoreSnapshotRunning) return null
  firestoreSnapshotRunning = true
  const startedAt = new Date().toISOString()
  console.log(`[firestore] full snapshot start (${reason})`)

  try {
    const snapshot = await exportFirestore(db)
    const filePath = join(dirs().firestoreSnapshots, `edupanel-firestore-live-${timestampForFile(new Date())}.json.gz`)
    const checksum = await writeCompressedSnapshot(filePath, snapshot)
    lastFullSnapshotAt = snapshot.createdAt
    console.log(`[firestore] full snapshot ok: ${filePath}`)
    return {
      ok: true,
      reason,
      startedAt,
      finishedAt: new Date().toISOString(),
      path: filePath,
      checksum,
      collectionCount: snapshot.collectionCount,
      documentCount: snapshot.documentCount,
    }
  } catch (error) {
    const networkMessage = error instanceof Error ? error.message : String(error)
    console.warn(`[firestore] full snapshot por API fallo (${networkMessage}). Intentando snapshot desde espejo local.`)

    try {
      const snapshot = await exportFirestoreFromMirror()
      const filePath = join(dirs().firestoreSnapshots, `edupanel-firestore-live-mirror-${timestampForFile(new Date())}.json.gz`)
      const checksum = await writeCompressedSnapshot(filePath, snapshot)
      lastFullSnapshotAt = snapshot.createdAt
      console.log(`[firestore] mirror snapshot ok: ${filePath}`)
      return {
        ok: true,
        reason,
        fallback: "mirror",
        apiError: networkMessage,
        startedAt,
        finishedAt: new Date().toISOString(),
        path: filePath,
        checksum,
        collectionCount: snapshot.collectionCount,
        documentCount: snapshot.documentCount,
      }
    } catch (fallbackError) {
      recordError("Full snapshot de Firestore fallo", fallbackError)
      return {
        ok: false,
        reason,
        startedAt,
        finishedAt: new Date().toISOString(),
        message: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        apiError: networkMessage,
      }
    }
  } finally {
    firestoreSnapshotRunning = false
  }
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`
}

function hashObject(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

async function withRetry(label, fn, attempts = intEnv("FIREBASE_API_RETRY_ATTEMPTS", 5)) {
  let last
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      last = error
      const message = error instanceof Error ? error.message : String(error)
      const retryable = /ECONNRESET|ETIMEDOUT|DEADLINE|timeout|UNAVAILABLE|INTERNAL|socket|fetch failed/i.test(message)
      if (!retryable || attempt === attempts) break

      const delayMs = Math.min(30_000, 1000 * attempt * attempt)
      console.warn(`[retry] ${label} intento ${attempt}/${attempts} fallo: ${message}. Reintentando en ${delayMs}ms`)
      await sleep(delayMs)
    }
  }

  throw last
}

function serializeUserRecord(userRecord) {
  const json = typeof userRecord.toJSON === "function" ? userRecord.toJSON() : userRecord
  return JSON.parse(JSON.stringify(json))
}

async function listAllUsers(auth) {
  const users = []
  let nextPageToken = undefined

  do {
    const page = await withRetry("auth listUsers", () => auth.listUsers(1000, nextPageToken))
    users.push(...page.users.map(serializeUserRecord))
    nextPageToken = page.pageToken
  } while (nextPageToken)

  return users.sort((a, b) => a.uid.localeCompare(b.uid))
}

async function persistAuthSnapshot(auth, { force = false } = {}) {
  const users = await listAllUsers(auth)
  const nextState = new Map(users.map((user) => [user.uid, hashObject(user)]))
  const changes = []

  for (const user of users) {
    const previousHash = authState.get(user.uid)
    const nextHash = nextState.get(user.uid)
    if (!previousHash) {
      changes.push({ type: "added", uid: user.uid, user })
    } else if (previousHash !== nextHash) {
      changes.push({ type: "modified", uid: user.uid, user })
    }
  }

  for (const uid of authState.keys()) {
    if (!nextState.has(uid)) {
      changes.push({ type: "removed", uid })
    }
  }

  const changed = force || changes.length > 0
  const now = new Date()

  if (changed) {
    const payload = {
      format: AUTH_BACKUP_FORMAT,
      createdAt: now.toISOString(),
      projectId: env("FIREBASE_ADMIN_PROJECT_ID"),
      userCount: users.length,
      users,
      note: "Firebase Auth no expone listener realtime en Admin SDK; este snapshot se actualiza por polling automatico.",
    }
    const snapshotPath = join(dirs().authSnapshots, `edupanel-auth-${timestampForFile(now)}.json.gz`)
    const checksum = await writeCompressedSnapshot(snapshotPath, payload)
    await writeAtomic(join(dirs().authCurrent, "users.json"), `${JSON.stringify(payload, null, 2)}\n`)

    for (const change of changes) {
      await appendJsonl(join(dirs().authEvents, `${dayKey(now)}.jsonl`), {
        format: "edupanel.auth.event.v1",
        observedAt: now.toISOString(),
        projectId: env("FIREBASE_ADMIN_PROJECT_ID"),
        ...change,
      })
    }

    lastAuthChangeAt = now.toISOString()
    console.log(`[auth] snapshot ok: ${users.length} usuarios, cambios=${changes.length}, checksum=${checksum}`)
  }

  authState = nextState
  return {
    changed,
    userCount: users.length,
    changeCount: changes.length,
    checkedAt: now.toISOString(),
  }
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"))
  } catch (error) {
    if (error.code === "ENOENT") return null
    throw error
  }
}

async function loadAuthStateFromDisk() {
  const current = await readJsonIfExists(join(dirs().authCurrent, "users.json"))
  const users = Array.isArray(current?.users) ? current.users : []
  authState = new Map(users.map((user) => [user.uid, hashObject(user)]))
}

function recordError(context, error) {
  const message = error instanceof Error ? error.message : String(error)
  lastError = {
    at: new Date().toISOString(),
    context,
    message,
  }
  console.error(`[error] ${context}: ${message}`)
}

async function writeStatus(extra = {}) {
  const all = dirs()
  const status = {
    version: SERVICE_VERSION,
    updatedAt: new Date().toISOString(),
    pid: process.pid,
    projectId: env("FIREBASE_ADMIN_PROJECT_ID"),
    baseDir: all.base,
    firestore: {
      mode: "listen+mirror+jsonl",
      watchedCollectionCount: watchedCollections.size,
      knownDocumentCount: knownDocumentPaths.size,
      lastChangeAt: lastFirestoreChangeAt,
      lastFullSnapshotAt,
      fullSnapshotRunning: firestoreSnapshotRunning,
    },
    auth: {
      mode: "polling",
      pollIntervalMs: intEnv("AUTH_POLL_INTERVAL_MS", 60_000),
      trackedUserCount: authState.size,
      lastChangeAt: lastAuthChangeAt,
    },
    intervals: {
      rootDiscoveryMs: intEnv("FIRESTORE_ROOT_DISCOVERY_INTERVAL_MS", 30_000),
      subcollectionDiscoveryMs: intEnv("FIRESTORE_DISCOVERY_INTERVAL_MS", 300_000),
      fullSnapshotMs: intEnv("FIRESTORE_FULL_SNAPSHOT_INTERVAL_MS", 6 * 60 * 60 * 1000),
    },
    lastError,
    ...extra,
  }

  await writeAtomic(all.status, `${JSON.stringify(status, null, 2)}\n`)
}

async function pruneOldFiles(rootDir, retentionDays) {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => [])

  for (const entry of entries) {
    const filePath = join(rootDir, entry.name)
    if (entry.isDirectory()) {
      await pruneOldFiles(filePath, retentionDays)
      continue
    }
    if (!entry.isFile()) continue
    const info = await stat(filePath)
    if (info.mtimeMs < cutoff) await unlink(filePath).catch(() => {})
  }
}

async function pruneLoop() {
  const retentionDays = intEnv("FIREBASE_LIVE_RETENTION_DAYS", 30)
  await Promise.all([
    pruneOldFiles(dirs().firestoreSnapshots, retentionDays),
    pruneOldFiles(dirs().firestoreEvents, retentionDays),
    pruneOldFiles(dirs().authSnapshots, retentionDays),
    pruneOldFiles(dirs().authEvents, retentionDays),
  ])
}

async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  console.log("[service] shutting down")
  for (const unsubscribe of watchedCollections.values()) {
    try {
      unsubscribe()
    } catch {}
  }
  watchedCollections.clear()
  await Promise.allSettled([...pendingWrites])
  await writeStatus({ stoppedAt: new Date().toISOString() }).catch(() => {})
  process.exit(0)
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
process.on("unhandledRejection", (error) => recordError("unhandledRejection", error))
process.on("uncaughtException", (error) => {
  recordError("uncaughtException", error)
  setTimeout(() => process.exit(1), 500).unref()
})

async function main() {
  const args = parseArgs(process.argv.slice(2))
  await loadEnv()
  await ensureDirs()
  const app = initAdminApp()
  const db = getFirestore(app)
  const snapshotDb = initSnapshotFirestore()
  const auth = getAuth(app)

  await loadAuthStateFromDisk()
  await writeStatus({ startedAt: new Date().toISOString() })

  if (args.once) {
    const [firestore, authResult] = await Promise.all([
      runFullFirestoreSnapshot(snapshotDb, "once"),
      persistAuthSnapshot(auth, { force: true }),
    ])
    await writeStatus({ once: { firestore, auth: authResult } })
    console.log(JSON.stringify({ ok: true, firestore, auth: authResult }, null, 2))
    return
  }

  if (!args.noWatch) {
    await discoverRootCollections(db)
  }

  persistAuthSnapshot(auth, { force: authState.size === 0 })
    .then((result) => writeStatus({ lastAuthCheck: result }))
    .catch((error) => recordError("Snapshot inicial de Auth fallo", error))

  runFullFirestoreSnapshot(snapshotDb, "startup")
    .then((result) => writeStatus({ lastFullSnapshot: result }))
    .catch((error) => recordError("Snapshot inicial de Firestore fallo", error))

  setInterval(() => {
    discoverRootCollections(db)
      .then(() => writeStatus())
      .catch((error) => recordError("Discovery raiz de Firestore fallo", error))
  }, intEnv("FIRESTORE_ROOT_DISCOVERY_INTERVAL_MS", 30_000))

  setInterval(() => {
    discoverKnownSubcollections(db)
      .then(() => writeStatus())
      .catch((error) => recordError("Discovery de Firestore fallo", error))
  }, intEnv("FIRESTORE_DISCOVERY_INTERVAL_MS", 300_000))

  setInterval(() => {
    persistAuthSnapshot(auth)
      .then((result) => writeStatus({ lastAuthCheck: result }))
      .catch((error) => recordError("Polling de Auth fallo", error))
  }, intEnv("AUTH_POLL_INTERVAL_MS", 60_000))

  setInterval(() => {
    runFullFirestoreSnapshot(snapshotDb, "interval")
      .then((result) => writeStatus({ lastFullSnapshot: result }))
      .catch((error) => recordError("Snapshot periodico de Firestore fallo", error))
  }, intEnv("FIRESTORE_FULL_SNAPSHOT_INTERVAL_MS", 6 * 60 * 60 * 1000))

  setInterval(() => {
    pruneLoop().catch((error) => recordError("Prune fallo", error))
  }, intEnv("FIREBASE_LIVE_PRUNE_INTERVAL_MS", 6 * 60 * 60 * 1000))

  setInterval(() => {
    writeStatus().catch((error) => recordError("Status heartbeat fallo", error))
  }, intEnv("FIREBASE_LIVE_HEARTBEAT_MS", 30_000))

  console.log(`[service] firebase live backup activo en ${backupDir()}`)
}

main().catch((error) => {
  recordError("Arranque fallo", error)
  process.exitCode = 1
})
