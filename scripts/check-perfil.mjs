import { readFile } from "fs/promises"
import { join, resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { cert, deleteApp, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = resolve(__dirname, "..")
const originalEnvKeys = new Set(Object.keys(process.env))

const UID_FREDDY = "S2U9BEMrI7beV5pF5rTF0u5AhSp2"

async function loadEnv() {
  let raw
  try { raw = await readFile(join(PROJECT_ROOT, ".env.local"), "utf8") } catch { return }
  for (const line of raw.replace(/\u0000/g, "").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([^#=\s]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const key = m[1].trim()
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    if (originalEnvKeys.has(key)) continue
    if (!process.env[key]) process.env[key] = val
  }
}
function env(n,f="") { const v=process.env[n]; return v===undefined||v===null||v===""?f:v }

async function main() {
  await loadEnv()
  const app = initializeApp({credential:cert({projectId:env("FIREBASE_ADMIN_PROJECT_ID"),clientEmail:env("FIREBASE_ADMIN_CLIENT_EMAIL"),privateKey:env("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g,"\n")}),projectId:env("FIREBASE_ADMIN_PROJECT_ID")})
  const db = getFirestore(app)

  console.log(`=== DATOS DE PERFIL: freddyfiguea (${UID_FREDDY}) ===\n`)

  // perfil_info/main
  const main = await db.collection("users").doc(UID_FREDDY).collection("perfil_info").doc("main").get()
  console.log("perfil_info/main:")
  console.log(JSON.stringify(main.exists ? main.data() : "NO EXISTE", null, 2))

  console.log("\nperfil_info/colegio:")
  const col = await db.collection("users").doc(UID_FREDDY).collection("perfil_info").doc("colegio").get()
  console.log(JSON.stringify(col.exists ? col.data() : "NO EXISTE", null, 2))

  console.log("\nperfil_info/preferencias:")
  const pref = await db.collection("users").doc(UID_FREDDY).collection("perfil_info").doc("preferencias").get()
  console.log(JSON.stringify(pref.exists ? pref.data() : "NO EXISTE", null, 2))

  console.log("\nconfiguracion/horario:")
  const hor = await db.collection("users").doc(UID_FREDDY).collection("configuracion").doc("horario").get()
  const hd = hor.exists ? hor.data() : null
  console.log(`Clases: ${hd?.clases?.length || 0}`)

  console.log("\nconfiguracion/nivel_mapping:")
  const nm = await db.collection("users").doc(UID_FREDDY).collection("configuracion").doc("nivel_mapping").get()
  const nd = nm.exists ? nm.data() : null
  console.log(JSON.stringify(nd?.mapping || {}, null, 2))

  // Cursos con estudiantes
  console.log("\nEstudiantes por curso:")
  const est = await db.collection("users").doc(UID_FREDDY).collection("estudiantes").get()
  for (const d of est.docs) {
    const data = d.data()
    const alumnos = data.alumnos || []
    console.log(`  ${d.id}: ${alumnos.length} alumnos`)
  }

  await deleteApp(app).catch(()=>{})
}
main().catch(e=>{console.error("ERROR",e);process.exitCode=1})
