/**
 * restaurar-horario.mjs
 * 1. Identifica el UID de freddyfiguea@gmail.com
 * 2. Muestra el estado completo de sus datos
 * 3. Si el horario tiene datos basura (asdasd), busca datos reales en rutas alternativas
 */

import { readFileSync } from "fs"
import { createRequire } from "module"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, "..")

function loadEnv() {
  try {
    const raw = readFileSync(join(rootDir, ".env.local"), "utf8")
    for (const line of raw.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const idx = trimmed.indexOf("=")
      if (idx < 0) continue
      const key = trimmed.slice(0, idx).trim()
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "")
      if (!process.env[key]) process.env[key] = val
    }
  } catch (e) { console.error("No se pudo cargar .env.local:", e.message) }
}
loadEnv()

const require = createRequire(import.meta.url)
const admin = require("firebase-admin")

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  })
}

const db   = admin.firestore()
const auth = admin.auth()

const ADMIN_EMAIL = "freddyfiguea@gmail.com"

async function main() {
  console.log("═══════════════════════════════════════════════════════")
  console.log("  DIAGNÓSTICO COMPLETO — Usuario:", ADMIN_EMAIL)
  console.log("═══════════════════════════════════════════════════════\n")

  // ── 1. Encontrar UID por email ─────────────────────────────────────────────
  let uid
  try {
    const userRecord = await auth.getUserByEmail(ADMIN_EMAIL)
    uid = userRecord.uid
    console.log("✅ UID encontrado:", uid)
    console.log("   Email:", userRecord.email)
    console.log("   Display Name:", userRecord.displayName)
  } catch (e) {
    console.error("❌ No se pudo encontrar el usuario:", e.message)
    process.exit(1)
  }

  console.log("\n── SUBCOLECCIONES ────────────────────────────────────")
  const userRef = db.doc(`users/${uid}`)
  const cols = await userRef.listCollections()
  console.log(cols.map(c => c.id).join(", "))

  // ── 2. Horario completo ────────────────────────────────────────────────────
  console.log("\n── HORARIO (configuracion/horario) ───────────────────")
  const horSnap = await db.doc(`users/${uid}/configuracion/horario`).get()
  if (horSnap.exists) {
    const clases = horSnap.data()?.clases || []
    console.log(`Total bloques: ${clases.length}`)
    clases.forEach((c, i) => {
      console.log(`  [${i+1}] ${c.dia} ${c.horaInicio}-${c.horaFin} | "${c.resumen}" | tipo: ${c.tipo} | color: ${c.color}`)
    })
  } else {
    console.log("❌ No existe")
  }

  // ── 3. Nivel mapping ───────────────────────────────────────────────────────
  console.log("\n── NIVEL MAPPING ─────────────────────────────────────")
  const nmSnap = await db.doc(`users/${uid}/configuracion/nivel_mapping`).get()
  if (nmSnap.exists) {
    const mapping = nmSnap.data()?.mapping || {}
    if (Object.keys(mapping).length === 0) {
      console.log("⚠️ Existe pero está VACÍO ({})")
    } else {
      Object.entries(mapping).forEach(([k, v]) => console.log(`  "${k}" → "${v}"`))
    }
  } else {
    console.log("❌ No existe")
  }

  // ── 4. Rubricas ────────────────────────────────────────────────────────────
  console.log("\n── RÚBRICAS ──────────────────────────────────────────")
  const rubSnap = await db.collection(`users/${uid}/rubricas`).get()
  if (rubSnap.empty) {
    console.log("❌ Sin rúbricas")
  } else {
    console.log(`Total: ${rubSnap.size}`)
    rubSnap.docs.forEach(d => {
      const data = d.data()
      console.log(`  [${data.curso}] "${data.nombre}" — ${(data.partes||[]).length} partes, puntajeMax: ${data.puntajeMaximo}`)
    })
  }

  // ── 5. Estudiantes ─────────────────────────────────────────────────────────
  console.log("\n── ESTUDIANTES ───────────────────────────────────────")
  const estSnap = await db.collection(`users/${uid}/estudiantes`).get()
  if (estSnap.empty) {
    console.log("❌ Sin estudiantes")
  } else {
    estSnap.docs.forEach(d => {
      const alumnos = d.data()?.alumnos || []
      console.log(`  ${d.id}: ${alumnos.length} estudiantes`)
    })
  }

  // ── 6. Ver Unidad ──────────────────────────────────────────────────────────
  console.log("\n── VER_UNIDAD ────────────────────────────────────────")
  const vuSnap = await db.collection(`users/${uid}/ver_unidad`).get()
  if (vuSnap.empty) {
    console.log("❌ Sin ver_unidad")
  } else {
    vuSnap.docs.forEach(d => {
      const data = d.data()
      console.log(`  ${d.id} — oas: ${(data.oas||[]).length}, asignatura: ${data.asignatura || "?"}, curso: ${data.curso || "?"}`)
    })
  }

  // ── 7. Info colegio ────────────────────────────────────────────────────────
  console.log("\n── COLEGIO (perfil_info/colegio) ─────────────────────")
  const colSnap = await db.doc(`users/${uid}/perfil_info/colegio`).get()
  if (colSnap.exists) {
    const d = colSnap.data()
    console.log(`  nombre: "${d.nombre || ""}"`)
    console.log(`  logoBase64: ${d.logoBase64 ? "✅ existe (" + Math.round(d.logoBase64.length/1024) + " KB)" : "❌ no"}`)
  } else {
    console.log("❌ No existe (colegio sin configurar)")
  }

  // ── 8. Buscar horario viejo (rutas alternativas) ───────────────────────────
  console.log("\n── BÚSQUEDA EN RUTAS ANTIGUAS ────────────────────────")
  const rutasViejas = ["horario", "configuracion_horario", "schedule"]
  for (const ruta of rutasViejas) {
    try {
      const snap = await db.doc(`users/${uid}/${ruta}`).get()
      if (snap.exists) {
        const clases = snap.data()?.clases || snap.data()?.horario || []
        console.log(`  🔵 users/${uid}/${ruta} → ${clases.length} bloques`)
        clases.forEach(c => console.log(`     ${c.dia} "${c.resumen}" ${c.horaInicio}-${c.horaFin}`))
      }
    } catch {}
  }

  // Revisar subcolección completa de configuracion
  console.log("\n── DOCS EN configuracion/ ────────────────────────────")
  const configSnap = await db.collection(`users/${uid}/configuracion`).get()
  configSnap.docs.forEach(d => {
    const keys = Object.keys(d.data() || {})
    console.log(`  ${d.id}: [${keys.join(", ")}]`)
  })

  console.log("\n═══════════════════════════════════════════════════════")
  console.log("  FIN DEL DIAGNÓSTICO")
  console.log("═══════════════════════════════════════════════════════\n")
}

main().catch(e => { console.error("Error fatal:", e.message); process.exit(1) })
