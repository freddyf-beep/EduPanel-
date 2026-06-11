import { readFile } from "fs/promises"
import { dirname, join, resolve } from "path"
import { fileURLToPath } from "url"
import { cert, deleteApp, getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore, initializeFirestore } from "firebase-admin/firestore"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = resolve(__dirname, "..")
const originalEnvKeys = new Set(Object.keys(process.env))

const TARGET_UID = "hOAmMTbkTzTwF7F2fAeFsR9K0CO2"
const SOURCE_EMAIL = "freddyfiguea@gmail.com"

function parseArgs(argv) {
  const args = {
    apply: false,
    sourceEmail: SOURCE_EMAIL,
    targetUid: TARGET_UID,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--apply") {
      args.apply = true
    } else if (arg === "--help" || arg === "-h") {
      printHelp()
      process.exit(0)
    } else if (arg.startsWith("--source=")) {
      args.sourceEmail = arg.slice(9)
    } else if (arg.startsWith("--target=")) {
      args.targetUid = arg.slice(9)
    }
  }

  return args
}

function printHelp() {
  console.log(`Uso:
  node scripts/copy-user-data.mjs [--apply] [--source=email] [--target=uid]

Sin --apply solo muestra un resumen de lo que se copiara.`)
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
      "Faltan credenciales Admin de Firebase."
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

async function getUidByEmail(auth, email) {
  try {
    const user = await auth.getUserByEmail(email)
    return user.uid
  } catch (error) {
    if (error.code === "auth/user-not-found") return null
    throw error
  }
}

async function readUserDocsRecursive(db, userUid) {
  const results = []
  const userDocRef = db.collection("users").doc(userUid)
  const subcollections = await userDocRef.listCollections()

  for (const subcollection of subcollections) {
    await readCollectionRecursive(db, subcollection.path, results)
  }

  return results
}

async function readCollectionRecursive(db, collectionPath, results) {
  const snapshot = await db.collection(collectionPath).get()

  for (const docSnap of snapshot.docs) {
    if (docSnap.exists) {
      results.push({
        path: docSnap.ref.path,
        data: docSnap.data(),
      })
    }

    const subcollections = await docSnap.ref.listCollections()
    for (const subcollection of subcollections) {
      await readCollectionRecursive(db, subcollection.path, results)
    }
  }
}

async function writeDocs(db, docs, targetPrefix, sourcePrefix) {
  let batch = db.batch()
  let pending = 0
  let written = 0
  let skipped = 0

  for (const doc of docs) {
    const newPath = doc.path.replace(sourcePrefix, targetPrefix)
    const newDoc = db.doc(newPath)

    batch.set(newDoc, doc.data)
    pending += 1
    written += 1

    if (pending >= 450) {
      await batch.commit()
      batch = db.batch()
      pending = 0
      console.log(`  Progreso: ${written} documentos escritos...`)
    }
  }

  if (pending > 0) {
    await batch.commit()
  }

  return { written, skipped }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  await loadEnv()

  const app = initAdminApp()
  const auth = getAuth(app)
  const db = initFirestore(app)

  try {
    const sourceUid = await getUidByEmail(auth, args.sourceEmail)
    if (!sourceUid) {
      console.error(`ERROR: No se encontro usuario con email "${args.sourceEmail}" en Firebase Auth.`)
      process.exit(1)
    }

    console.log(`\n=== RESUMEN DE COPIA ===`)
    console.log(`Origen:  ${args.sourceEmail} (UID: ${sourceUid})`)
    console.log(`Destino: UID: ${args.targetUid}`)
    console.log(`Modo:    ${args.apply ? "ESCRITURA REAL" : "DRY RUN (sin escribir)"}`)

    const sourcePrefix = `users/${sourceUid}`
    
    console.log(`\nLeyendo documentos de users/${sourceUid}/...`)
    const userDocs = await readUserDocsRecursive(db, sourceUid)
    console.log(`  Encontrados: ${userDocs.length} documentos`)

    const aiStatsDoc = await db.collection("ai_usage_stats").doc(sourceUid).get()
    let aiStatsToCopy = false
    if (aiStatsDoc.exists) {
      aiStatsToCopy = true
      console.log(`  + ai_usage_stats/${sourceUid}`)
    }

    if (userDocs.length === 0 && !aiStatsToCopy) {
      console.log("\nNo hay datos para copiar.")
      process.exit(0)
    }

    if (!args.apply) {
      console.log(`\n--- CONTENIDO A COPIAR ---`)
      for (const doc of userDocs) {
        const newPath = doc.path.replace(sourcePrefix, `users/${args.targetUid}`)
        console.log(`  ${doc.path}  =>  ${newPath}`)
      }
      if (aiStatsToCopy) {
        console.log(`  ai_usage_stats/${sourceUid}  =>  ai_usage_stats/${args.targetUid}`)
      }
      console.log(`\nEjecuta con --apply para realizar la copia real.`)
      process.exit(0)
    }

    console.log(`\nEscribiendo ${userDocs.length} documentos...`)
    const result = await writeDocs(db, userDocs, `users/${args.targetUid}`, sourcePrefix)

    if (aiStatsToCopy) {
      const statsData = aiStatsDoc.data()
      await db.collection("ai_usage_stats").doc(args.targetUid).set(statsData)
      console.log(`  ai_usage_stats/${args.targetUid} copiado.`)
    }

    console.log(`\n=== COPIA COMPLETADA ===`)
    console.log(`Documentos escritos: ${result.written}`)

    console.log(`\nVerificacion:`)
    const targetDoc = db.collection("users").doc(args.targetUid)
    const targetSubs = await targetDoc.listCollections()
    console.log(`  Subcolecciones en destino: ${targetSubs.length}`)

  } finally {
    await deleteApp(app).catch(() => {})
  }
}

main().catch((error) => {
  console.error("COPY_USER_DATA_ERROR", error)
  process.exitCode = 1
})
