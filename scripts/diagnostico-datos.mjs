/**
 * diagnostico-datos.mjs
 * Diagnóstico rápido del estado de Firestore para todos los usuarios.
 * Busca: horario, perfil, rubricas, ver_unidad, planificaciones.
 *
 * Ejecutar: node scripts/diagnostico-datos.mjs
 */

import { readFileSync } from "fs"
import { createRequire } from "module"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, "..")

// Cargar .env.local manualmente
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
  } catch (e) {
    console.error("No se pudo cargar .env.local:", e.message)
  }
}

loadEnv()

const require = createRequire(import.meta.url)

let admin
try {
  admin = require("firebase-admin")
} catch {
  console.error("firebase-admin no instalado. Ejecuta: npm install firebase-admin")
  process.exit(1)
}

const projectId   = process.env.FIREBASE_ADMIN_PROJECT_ID
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
const privateKey  = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n")

if (!projectId || !clientEmail || !privateKey) {
  console.error("❌ Faltan variables de entorno: FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY")
  process.exit(1)
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  })
}

const db = admin.firestore()

// Normalizar texto para IDs de Firestore
function normalizeId(str) {
  return str.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
}

async function diagnosticar() {
  console.log("═══════════════════════════════════════════════════════")
  console.log("  DIAGNÓSTICO DATOS EDUPANEL — Firebase Firestore")
  console.log("  Proyecto:", projectId)
  console.log("═══════════════════════════════════════════════════════\n")

  const usersRef = db.collection("users")
  const usersSnap = await usersRef.listDocuments()

  if (usersSnap.length === 0) {
    console.log("⚠️ No hay usuarios en la colección 'users'")
    return
  }

  for (const userRef of usersSnap) {
    const uid = userRef.id
    console.log(`\n👤 Usuario UID: ${uid}`)
    console.log("─────────────────────────────────────────────────────")

    // ── 1. Subcolecciones disponibles ──────────────────────────
    const cols = await userRef.listCollections()
    const colNames = cols.map(c => c.id)
    console.log("  📂 Subcolecciones:", colNames.join(", ") || "(ninguna)")

    // ── 2. Perfil ──────────────────────────────────────────────
    console.log("\n  [PERFIL]")
    // Ruta nueva
    try {
      const mainSnap = await db.doc(`users/${uid}/perfil_info/main`).get()
      if (mainSnap.exists) {
        const d = mainSnap.data()
        console.log("  ✅ perfil_info/main existe:", JSON.stringify({ tipoProfesor: d.tipoProfesor, especialidad: d.especialidad }))
      } else {
        console.log("  ❌ perfil_info/main → NO EXISTE")
      }
    } catch(e) { console.log("  ⚠️ Error leyendo perfil_info/main:", e.message) }

    // Ruta vieja
    try {
      const viejoSnap = await db.doc(`users/${uid}/perfil`).get()
      if (viejoSnap.exists) {
        const d = viejoSnap.data()
        console.log("  🔵 perfil (VIEJO) existe:", JSON.stringify({ tipoProfesor: d?.tipoProfesor, especialidad: d?.especialidad }))
      }
    } catch(e) {}

    // ── 3. Horario ─────────────────────────────────────────────
    console.log("\n  [HORARIO]")
    let cursosEncontrados = []
    try {
      const horSnap = await db.doc(`users/${uid}/configuracion/horario`).get()
      if (horSnap.exists) {
        const clases = horSnap.data()?.clases || []
        cursosEncontrados = [...new Set(clases.filter(c => !["almuerzo","planificacion","recreo","libre"].includes(c.tipo)).map(c => c.resumen))]
        console.log(`  ✅ configuracion/horario → ${clases.length} bloques, cursos:`, cursosEncontrados.join(", ") || "(ninguno)")
      } else {
        console.log("  ❌ configuracion/horario → NO EXISTE")
      }
    } catch(e) { console.log("  ⚠️ Error:", e.message) }

    // Ruta vieja horario
    try {
      const vHorSnap = await db.doc(`users/${uid}/horario`).get()
      if (vHorSnap.exists) {
        const clases = vHorSnap.data()?.clases || vHorSnap.data()?.horario || []
        const cursos = [...new Set(clases.map(c => c.resumen))]
        console.log(`  🔵 horario (VIEJO) → ${clases.length} bloques, cursos:`, cursos.join(", "))
      }
    } catch(e) {}

    // ── 4. Rubricas ────────────────────────────────────────────
    console.log("\n  [RÚBRICAS]")
    try {
      const rubricasSnap = await db.collection(`users/${uid}/rubricas`).get()
      if (rubricasSnap.empty) {
        console.log("  ❌ rubricas → COLECCIÓN VACÍA o NO EXISTE")
      } else {
        console.log(`  ✅ rubricas → ${rubricasSnap.size} rúbricas:`)
        const cursosRubricas = new Set()
        rubricasSnap.docs.forEach(d => {
          const data = d.data()
          cursosRubricas.add(data.curso || "(sin curso)")
          console.log(`     - [${data.curso || "?"}] "${data.nombre || "(sin nombre)"}" | partes: ${(data.partes || []).length}`)
        })
        console.log("     Cursos con rúbricas:", [...cursosRubricas].join(", "))
      }
    } catch(e) { console.log("  ⚠️ Error:", e.message) }

    // ── 5. Ver Unidad (Planificaciones) ────────────────────────
    console.log("\n  [VER_UNIDAD / PLANIFICACIONES]")
    try {
      const vuSnap = await db.collection(`users/${uid}/ver_unidad`).get()
      if (vuSnap.empty) {
        console.log("  ❌ ver_unidad → VACÍA o NO EXISTE")
      } else {
        console.log(`  ✅ ver_unidad → ${vuSnap.size} documentos:`)
        vuSnap.docs.slice(0, 8).forEach(d => {
          const data = d.data()
          console.log(`     - ${d.id} | oas: ${(data.oas || []).length}`)
        })
      }
    } catch(e) { console.log("  ⚠️ Error:", e.message) }

    // ── 6. Estudiantes ─────────────────────────────────────────
    console.log("\n  [ESTUDIANTES]")
    try {
      const estSnap = await db.collection(`users/${uid}/estudiantes`).get()
      if (estSnap.empty) {
        console.log("  ❌ estudiantes → VACÍA o NO EXISTE")
      } else {
        console.log(`  ✅ estudiantes → ${estSnap.size} cursos:`)
        estSnap.docs.forEach(d => {
          const alumnos = d.data()?.alumnos || []
          console.log(`     - ${d.id}: ${alumnos.length} estudiantes`)
        })
      }
    } catch(e) { console.log("  ⚠️ Error:", e.message) }

    // ── 7. Nivel mapping ───────────────────────────────────────
    console.log("\n  [NIVEL MAPPING]")
    try {
      const nmSnap = await db.doc(`users/${uid}/configuracion/nivel_mapping`).get()
      if (nmSnap.exists) {
        const mapping = nmSnap.data()?.mapping || {}
        console.log("  ✅ configuracion/nivel_mapping:", JSON.stringify(mapping))
      } else {
        console.log("  ❌ configuracion/nivel_mapping → NO EXISTE")
      }
    } catch(e) {}

    // Viejo
    try {
      const nmViejoSnap = await db.doc(`users/${uid}/nivel_mapping`).get()
      if (nmViejoSnap.exists) {
        const mapping = nmViejoSnap.data()?.mapping || nmViejoSnap.data() || {}
        console.log("  🔵 nivel_mapping (VIEJO):", JSON.stringify(mapping))
      }
    } catch(e) {}
  }

  console.log("\n═══════════════════════════════════════════════════════")
  console.log("  LEYENDA: ✅ existe en ruta NUEVA | 🔵 existe en ruta VIEJA | ❌ no existe")
  console.log("═══════════════════════════════════════════════════════\n")
}

diagnosticar().catch(e => {
  console.error("Error fatal:", e.message)
  process.exit(1)
})
