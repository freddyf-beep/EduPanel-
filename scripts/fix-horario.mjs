import { readFile } from "fs/promises"
import { join, resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { cert, deleteApp, initializeApp } from "firebase-admin/app"
import { getFirestore, FieldValue } from "firebase-admin/firestore"

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
function env(n,f="") { const v=process.env[n]; return v===undefined||v===null||v===""?f:v }

async function main() {
  await loadEnv()
  const app = initializeApp({credential:cert({projectId:env("FIREBASE_ADMIN_PROJECT_ID"),clientEmail:env("FIREBASE_ADMIN_CLIENT_EMAIL"),privateKey:env("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g,"\n")}),projectId:env("FIREBASE_ADMIN_PROJECT_ID")})
  const db = getFirestore(app)
  const ur = db.collection("users").doc(UID)

  // Read legacy horario
  const hc = await ur.collection("horario").doc("config").get()
  if (!hc.exists) { console.log("No hay horario legacy"); process.exit(0) }
  const clases = hc.data().clases || []
  console.log(`Horario legacy: ${clases.length} clases encontradas`)

  // Write to v2 path
  await ur.collection("configuracion").doc("horario").set({
    clases,
    updatedAt: FieldValue.serverTimestamp()
  })
  console.log(`configuracion/horario actualizado con ${clases.length} clases`)

  // Verify
  const verify = await ur.collection("configuracion").doc("horario").get()
  const vc = verify.data()?.clases || []
  console.log(`Verificacion: ${vc.length} clases en configuracion/horario`)

  await deleteApp(app).catch(()=>{})
}
main().catch(e=>{console.error("ERROR",e);process.exitCode=1})
