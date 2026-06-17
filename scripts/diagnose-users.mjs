import { readFile } from "fs/promises"
import { dirname, join, resolve } from "path"
import { fileURLToPath } from "url"
import { cert, deleteApp, getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = resolve(__dirname, "..")
const originalEnvKeys = new Set(Object.keys(process.env))

async function loadEnvFile(filePath, opts = {}) {
  try { return JSON.parse(await readFile(filePath, "utf8")) } catch { return {} }
}

async function loadEnv() {
  let raw
  try { raw = await readFile(join(PROJECT_ROOT, ".env.local"), "utf8") } catch { return }
  for (const line of raw.replace(/\u0000/g, "").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([^#=\s]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const key = m[1].trim()
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1)
    if (originalEnvKeys.has(key)) continue
    if (!process.env[key]) process.env[key] = val
  }
}

function env(name, fb = "") { const v = process.env[name]; return v === undefined || v === null || v === "" ? fb : v }

async function main() {
  await loadEnv()
  const app = initializeApp({
    credential: cert({
      projectId: env("FIREBASE_ADMIN_PROJECT_ID"),
      clientEmail: env("FIREBASE_ADMIN_CLIENT_EMAIL"),
      privateKey: env("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n"),
    }),
    projectId: env("FIREBASE_ADMIN_PROJECT_ID"),
  })
  const auth = getAuth(app)
  const db = getFirestore(app)

  console.log("=== DIAGNOSTICO DE USUARIOS ===\n")

  // 1. Buscar udefret34@gmail.com en Auth
  try {
    const u = await auth.getUserByEmail("udefret34@gmail.com")
    console.log(`[Auth] udefret34@gmail.com → UID: ${u.uid}`)
    console.log(`  Creado: ${u.metadata.creationTime}`)
    console.log(`  Ultimo login: ${u.metadata.lastSignInTime}`)
    console.log(`  Providers: ${u.providerData.map(p => p.providerId).join(", ")}`)
    console.log(`  Custom claims: ${JSON.stringify(u.customClaims || {})}`)
  } catch (e) {
    console.log(`[Auth] udefret34@gmail.com: NO ENCONTRADO (${e.message})`)
  }

  // 2. Buscar freddyfiguea@gmail.com en Auth
  try {
    const u = await auth.getUserByEmail("freddyfiguea@gmail.com")
    console.log(`\n[Auth] freddyfiguea@gmail.com → UID: ${u.uid}`)
    console.log(`  Creado: ${u.metadata.creationTime}`)
    console.log(`  Ultimo login: ${u.metadata.lastSignInTime}`)
    console.log(`  Providers: ${u.providerData.map(p => p.providerId).join(", ")}`)
    console.log(`  Custom claims: ${JSON.stringify(u.customClaims || {})}`)
  } catch (e) {
    console.log(`\n[Auth] freddyfiguea@gmail.com: NO ENCONTRADO (${e.message})`)
  }

  // 3. Listar TODOS los usuarios en Auth
  console.log("\n--- TODOS LOS USUARIOS EN AUTH ---")
  let count = 0
  const listResult = await auth.listUsers(1000)
  const allUids = []
  for (const u of listResult.users) {
    count++
    allUids.push(u.uid)
    const hasData = await hasDataInUsers(db, u.uid)
    console.log(`  ${u.email || "(sin email)"} | UID: ${u.uid} | providers: ${u.providerData.map(p => p.providerId).join(",")} | disabled: ${u.disabled} | datos: ${hasData ? "SI" : "no"}`)
  }
  console.log(`\nTotal: ${count} usuarios en Firebase Auth`)

  // 4. Verificar allowlist
  console.log("\n--- ALLOWLIST ---")
  const allowSnap = await db.collection("allowlist").get()
  for (const doc of allowSnap.docs) {
    const d = doc.data()
    console.log(`  ${doc.id} → UID: ${d.uid || "(sin uid)"} | invitedBy: ${d.invitedBy || "?"} | source: ${d.source || "?"}`)
  }

  // 5. Verificar datos en users/ para cada UID relevante
  console.log("\n--- DATOS POR UID ---")
  const relevantUids = [...new Set([
    "hOAmMTbkTzTwF7F2fAeFsR9K0CO2", // udefret34
    "S2U9BEMrI7beV5pF5rTF0u5AhSp2", // freddyfiguea
    ...allUids,
  ])]

  for (const uid of relevantUids) {
    const count = await countUserDocs(db, uid)
    if (count > 0) {
      console.log(`  users/${uid}/ → ${count} documentos`)
    }
  }

  console.log("\n=== FIN DIAGNOSTICO ===")
  await deleteApp(app).catch(() => {})
}

async function hasDataInUsers(db, uid) {
  try {
    const userDoc = db.collection("users").doc(uid)
    const subs = await userDoc.listCollections()
    if (subs.length === 0) return false
    for (const sub of subs) {
      const snap = await sub.limit(1).get()
      if (!snap.empty) return true
    }
    return false
  } catch { return false }
}

async function countUserDocs(db, uid) {
  try {
    const userDoc = db.collection("users").doc(uid)
    const subs = await userDoc.listCollections()
    let total = 0
    for (const sub of subs) {
      const snap = await sub.get()
      total += snap.size
    }
    return total
  } catch { return 0 }
}

main().catch(e => { console.error("DIAG_ERROR", e); process.exitCode = 1 })
