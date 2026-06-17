import { readFile, writeFile } from "fs/promises"
import { join, resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { cert, deleteApp, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const originalEnvKeys = new Set(Object.keys(process.env))
const UID = "hOAmMTbkTzTwF7F2fAeFsR9K0CO2"
const OUT = join(PROJECT_ROOT, "estudiantes_1ro_basico_udefret34.json")

async function loadEnv() {
  let raw; try { raw = await readFile(join(PROJECT_ROOT, ".env.local"), "utf8") } catch { return }
  for (const line of raw.replace(/\u0000/g, "").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([^#=\s]+)\s*=\s*(.*)\s*$/)
    if (!m) continue; const k = m[1].trim(); let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (originalEnvKeys.has(k)) continue; if (!process.env[k]) process.env[k] = v
  }
}
function env(n,f="") { const v = process.env[n]; return v===undefined||v===null||v===""? f:v }

async function main() {
  await loadEnv()
  const app = initializeApp({credential:cert({projectId:env("FIREBASE_ADMIN_PROJECT_ID"),clientEmail:env("FIREBASE_ADMIN_CLIENT_EMAIL"),privateKey:env("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g,"\n")}),projectId:env("FIREBASE_ADMIN_PROJECT_ID")})
  const db = getFirestore(app)

  const estCol = db.collection("users").doc(UID).collection("estudiantes")
  const posiblesIds = ["1_basico", "1_basico_", "1ro_basico", "1ro basico", "1_básico"]

  let found = null
  for (const id of posiblesIds) {
    const snap = await estCol.doc(id).get()
    if (snap.exists) {
      const data = snap.data()
      const alumnos = data?.alumnos || data?.estudiantes || []
      found = { cursoId: id, total: alumnos.length, alumnos }
      break
    }
  }

  if (!found) {
    // Buscar en toda la coleccion
    const allDocs = await estCol.get()
    for (const doc of allDocs.docs) {
      const data = doc.data()
      const alumnos = data?.alumnos || data?.estudiantes || []
      if (doc.id.includes("basico") || doc.id.includes("básico")) {
        found = { cursoId: doc.id, total: alumnos.length, alumnos }
        break
      }
    }
  }

  if (!found) {
    console.log("No se encontraron estudiantes de 1ro basico para udefret34")
    process.exit(0)
  }

  await writeFile(OUT, JSON.stringify({ uid: UID, ...found }, null, 2), "utf8")
  console.log(`Archivo generado: ${OUT}`)
  console.log(`Curso: ${found.cursoId} | ${found.total} estudiantes`)

  await deleteApp(app).catch(()=>{})
}
main().catch(e=>{console.error("ERROR",e);process.exitCode=1})
