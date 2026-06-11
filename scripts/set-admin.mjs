import { readFile } from "fs/promises"
import { dirname, join, resolve } from "path"
import { fileURLToPath } from "url"
import { cert, deleteApp, getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = resolve(__dirname, "..")
const originalEnvKeys = new Set(Object.keys(process.env))

const NEW_ADMIN_UID = "hOAmMTbkTzTwF7F2fAeFsR9K0CO2"
const NEW_ADMIN_EMAIL = "udefret34@gmail.com"
const OLD_ADMIN_EMAIL = "freddyfigueroagea@gmail.com"

async function loadEnvFile(filePath, { overrideFileValues = false } = {}) {
  let raw
  try { raw = await readFile(filePath, "utf8") } catch (e) { if (e.code === "ENOENT") return; throw e }
  for (const line of raw.replace(/\u0000/g, "").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([^#=\s]+)\s*=\s*(.*)\s*$/)
    if (!match) continue
    const key = match[1].trim()
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      value = value.slice(1, -1)
    if (originalEnvKeys.has(key)) continue
    if (process.env[key] === undefined || overrideFileValues) process.env[key] = value
  }
}

async function loadEnv() {
  await loadEnvFile(join(PROJECT_ROOT, ".env.local"))
  await loadEnvFile(join(PROJECT_ROOT, ".env.backup.local"), { overrideFileValues: true })
}

function env(name, fallback = "") {
  const v = process.env[name]
  return v === undefined || v === null || v === "" ? fallback : v
}

function initAdminApp() {
  const existing = getApps()
  if (existing.length > 0) return existing[0]
  return initializeApp({
    credential: cert({
      projectId: env("FIREBASE_ADMIN_PROJECT_ID"),
      clientEmail: env("FIREBASE_ADMIN_CLIENT_EMAIL"),
      privateKey: env("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n"),
    }),
    projectId: env("FIREBASE_ADMIN_PROJECT_ID"),
  })
}

async function getUidByEmail(auth, email) {
  try { const u = await auth.getUserByEmail(email); return u.uid } catch (e) { return null }
}

async function main() {
  await loadEnv()
  const app = initAdminApp()
  const auth = getAuth(app)

  try {
    // 1. Buscar UID de freddyfigueroagea
    const oldUid = await getUidByEmail(auth, OLD_ADMIN_EMAIL)
    console.log(`${OLD_ADMIN_EMAIL} UID: ${oldUid || "NO ENCONTRADO"}`)

    // 2. Dar admin a udefret34
    console.log(`\nDando admin a ${NEW_ADMIN_EMAIL}...`)
    await auth.setCustomUserClaims(NEW_ADMIN_UID, { admin: true })
    console.log(`  Custom claim admin=true asignado.`)

    // 3. Quitar admin a freddyfigueroagea
    if (oldUid) {
      console.log(`\nQuitando admin a ${OLD_ADMIN_EMAIL}...`)
      const current = (await auth.getUser(oldUid)).customClaims || {}
      const { admin, ...rest } = current
      await auth.setCustomUserClaims(oldUid, Object.keys(rest).length > 0 ? rest : null)
      console.log(`  Custom claim admin eliminado.`)
    } else {
      console.log(`\n${OLD_ADMIN_EMAIL} no encontrado en Auth. Nada que quitar.`)
    }

    console.log("\n=== RESUMEN ===")
    console.log(`Admin asignado a: ${NEW_ADMIN_EMAIL}`)
    console.log(`Admin quitado de: ${OLD_ADMIN_EMAIL}`)
    console.log(`\nFALTA MANUAL: Actualiza DEFAULT_ADMIN_EMAILS en:`)
    console.log(`  lib/auth/verify-token.ts (linea 27)`)
    console.log(`  lib/admin-helpers.ts (linea 15-18)`)
    console.log(`  firestore.rules (isAdmin function)`)
    console.log(`\nReemplaza "freddyfigueroagea@gmail.com" por "udefret34@gmail.com"`)

  } finally {
    await deleteApp(app).catch(() => {})
  }
}

main().catch(e => { console.error("ERROR", e); process.exitCode = 1 })
