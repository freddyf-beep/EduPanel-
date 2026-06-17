import { readFile } from "fs/promises"
import { join, resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { cert, deleteApp, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const originalEnvKeys = new Set(Object.keys(process.env))
const UID = "S2U9BEMrI7beV5pF5rTF0u5AhSp2"

async function loadEnv() {
  let raw; try { raw = await readFile(join(PROJECT_ROOT, ".env.local"), "utf8") } catch { return }
  for (const line of raw.replace(/\u0000/g, "").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([^#=\s]+)\s*=\s*(.*)\s*$/)
    if (!m) continue; const k = m[1].trim(); let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (originalEnvKeys.has(k)) continue; if (!process.env[k]) process.env[k] = v
  }
}
function env(n,f="") { const v = process.env[n]; return v === undefined || v === null || v === "" ? f : v }

async function main() {
  await loadEnv()
  const app = initializeApp({credential:cert({projectId:env("FIREBASE_ADMIN_PROJECT_ID"),clientEmail:env("FIREBASE_ADMIN_CLIENT_EMAIL"),privateKey:env("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g,"\n")}),projectId:env("FIREBASE_ADMIN_PROJECT_ID")})
  const db = getFirestore(app)
  const ur = db.collection("users").doc(UID)

  // Check horario/config
  console.log("=== horario/config ===")
  const hc = await ur.collection("horario").doc("config").get()
  console.log(JSON.stringify(hc.exists ? { exists: true, keys: Object.keys(hc.data()), data: hc.data() } : { exists: false }, null, 2))

  // Check configuracion/horario
  console.log("\n=== configuracion/horario ===")
  const ch = await ur.collection("configuracion").doc("horario").get()
  console.log(JSON.stringify(ch.exists ? { exists: true, keys: Object.keys(ch.data()), data: ch.data() } : { exists: false }, null, 2))

  // Check all docs in "horario" collection
  console.log("\n=== TODOS docs en coleccion 'horario' ===")
  const horCol = (await ur.collection("horario").get()).docs
  for (const d of horCol) { console.log(`  ${d.id}: keys=${Object.keys(d.data()).join(",")}`) }

  // Check "horario_semanal" if exists
  console.log("\n=== coleccion 'horario_semanal' ===")
  try {
    const hs = await ur.collection("horario_semanal").get()
    console.log(`  ${hs.size} documentos`)
    for (const d of hs.docs) { console.log(`  ${d.id}: keys=${Object.keys(d.data()).join(",")}`) }
  } catch(e) { console.log("  No existe") }

  await deleteApp(app).catch(()=>{})
}
main().catch(e=>{console.error("ERROR",e);process.exitCode=1})
