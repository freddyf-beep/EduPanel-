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
function env(n,f="") { const v = process.env[n]; return v===undefined||v===null||v===""? f:v }

async function main() {
  await loadEnv()
  const app = initializeApp({credential:cert({projectId:env("FIREBASE_ADMIN_PROJECT_ID"),clientEmail:env("FIREBASE_ADMIN_CLIENT_EMAIL"),privateKey:env("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g,"\n")}),projectId:env("FIREBASE_ADMIN_PROJECT_ID")})
  const db = getFirestore(app)
  const ur = db.collection("users").doc(UID)
  let cambios = 0

  // ── 1. Migrar horario (horario/config → configuracion/horario) ──
  const horarioLegacy = await ur.collection("horario").doc("config").get()
  if (horarioLegacy.exists) {
    const clases = horarioLegacy.data()?.clases || []
    if (clases.length > 0) {
      await ur.collection("configuracion").doc("horario").set({
        clases,
        updatedAt: FieldValue.serverTimestamp()
      })
      console.log(`[OK] Horario: ${clases.length} clases migradas a configuracion/horario`)
      cambios++
    }
  }

  // ── 2. Migrar colegio (colegio collection → perfil_info/colegio) ──
  const colegioSnap = await ur.collection("colegio").get()
  let colegioData = null
  for (const doc of colegioSnap.docs) {
    const d = doc.data()
    if (d.nombre || d.logoBase64 || d.rbd) { colegioData = d; break }
  }
  if (colegioData) {
    await ur.collection("perfil_info").doc("colegio").set({
      ...colegioData,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true })
    console.log(`[OK] Colegio: datos migrados desde legacy` + (colegioData.nombre ? ` (${colegioData.nombre})` : ""))
    cambios++
  } else {
    console.log(`[--] Colegio: sin datos legacy para migrar. El campo nombre="" actual se respeta.`)
  }

  // ── 3. Nivel mapping (nivel_mapping collection → configuracion/nivel_mapping) ──
  const nmSnap = await ur.collection("nivel_mapping").get()
  for (const doc of nmSnap.docs) {
    const d = doc.data()
    const mapping = d?.mapping ?? d
    if (mapping && typeof mapping === "object" && Object.keys(mapping).length > 0) {
      await ur.collection("configuracion").doc("nivel_mapping").set({ mapping }, { merge: true })
      console.log(`[OK] Nivel mapping migrado (${Object.keys(mapping).length} cursos)`)
      cambios++
      break
    }
  }

  console.log(`\n=== Migracion completada: ${cambios} cambios ===`)
  await deleteApp(app).catch(()=>{})
}
main().catch(e=>{console.error("ERROR",e);process.exitCode=1})
