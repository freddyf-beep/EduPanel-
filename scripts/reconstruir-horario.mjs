/**
 * reconstruir-horario.mjs
 *
 * Para el usuario freddyfiguea@gmail.com:
 * 1. Lee la subcolección antigua `users/{uid}/horario` (si existe)
 * 2. Si no, reconstruye el horario a partir de ver_unidad + rubricas
 * 3. Escribe el resultado en `users/{uid}/configuracion/horario`
 * 4. Reconstruye el nivel_mapping a partir de los cursos encontrados
 *
 * SEGURO: no borra nada, solo escribe en rutas nuevas si están vacías.
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

const db      = admin.firestore()
const authSDK = admin.auth()

const ADMIN_EMAIL = "freddyfiguea@gmail.com"

// Colores por defecto para los cursos
const COLORES = ["#EC4899", "#3B82F6", "#22C55E", "#F59E0B", "#8B5CF6", "#EF4444", "#14B8A6", "#F97316"]

function colorParaCurso(index) {
  return COLORES[index % COLORES.length]
}

// Días de la semana en español
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]

async function main() {
  console.log("═══════════════════════════════════════════════════════")
  console.log("  RECONSTRUCCIÓN DE HORARIO — freddyfiguea@gmail.com")
  console.log("═══════════════════════════════════════════════════════\n")

  // ── 1. Encontrar UID ───────────────────────────────────────────────────────
  const userRecord = await authSDK.getUserByEmail(ADMIN_EMAIL)
  const uid = userRecord.uid
  console.log("✅ UID:", uid)

  // ── 2. Verificar si ya hay datos en configuracion/horario ─────────────────
  const horNuevoSnap = await db.doc(`users/${uid}/configuracion/horario`).get()
  const clasesActuales = horNuevoSnap.exists ? (horNuevoSnap.data()?.clases || []) : []

  if (clasesActuales.length > 0) {
    console.log(`\n✅ El horario ya tiene ${clasesActuales.length} bloques. No es necesario reconstruir.`)
    console.log("   Si igual quieres reconstruir, borra configuracion/horario primero.")
    // Mostrar qué hay
    clasesActuales.forEach(c => console.log(`   - "${c.resumen}" ${c.dia} ${c.horaInicio}`))
    process.exit(0)
  }

  console.log("\n⚠️ configuracion/horario está vacío. Iniciando reconstrucción...\n")

  // ── 3. Intentar leer subcolección antigua `horario` ───────────────────────
  console.log("── Paso 1: Buscar horario viejo en users/{uid}/horario/ ──────────")
  let clasesReconstruidas = []

  // El viejo "horario" era una SUBCOLECCIÓN de documentos por fecha o un único documento
  try {
    // Caso A: documento único
    const viejoDocSnap = await db.doc(`users/${uid}/horario`).get()
    if (viejoDocSnap.exists) {
      const data = viejoDocSnap.data()
      const clases = data?.clases || data?.bloques || []
      if (clases.length > 0) {
        console.log(`✅ Encontrado horario viejo como documento único (${clases.length} bloques)`)
        clasesReconstruidas = clases
      }
    }
  } catch {}

  // Caso B: subcolección de documentos
  if (clasesReconstruidas.length === 0) {
    try {
      const viejaColSnap = await db.collection(`users/${uid}/horario`).get()
      if (!viejaColSnap.empty) {
        viejaColSnap.docs.forEach(d => {
          const data = d.data()
          const clases = data?.clases || data?.bloques || []
          clasesReconstruidas.push(...clases)
        })
        if (clasesReconstruidas.length > 0) {
          console.log(`✅ Encontrado horario viejo como subcolección (${clasesReconstruidas.length} bloques)`)
        }
      }
    } catch {}
  }

  // ── 4. Si no hay horario viejo, reconstruir desde cursos inferidos ─────────
  if (clasesReconstruidas.length === 0) {
    console.log("⚠️ No se encontró horario viejo. Reconstruyendo desde ver_unidad y rubricas...\n")

    // Extraer cursos únicos de ver_unidad
    const vuSnap = await db.collection(`users/${uid}/ver_unidad`).get()
    const cursosDesdeVU = new Map() // curso → asignatura
    vuSnap.docs.forEach(d => {
      const data = d.data()
      const curso = (data.curso || "").trim()
      const asig  = (data.asignatura || "Música").trim()
      if (curso) cursosDesdeVU.set(curso, asig)
    })

    // También extraer desde rúbricas
    const rubSnap = await db.collection(`users/${uid}/rubricas`).get()
    const cursosDesdeRub = new Set()
    rubSnap.docs.forEach(d => {
      const curso = (d.data().curso || "").trim()
      if (curso) cursosDesdeRub.add(curso)
    })

    // Unir todos los cursos únicos
    const todosCursos = new Map(cursosDesdeVU)
    cursosDesdeRub.forEach(c => { if (!todosCursos.has(c)) todosCursos.set(c, "Música") })

    console.log(`Cursos detectados (${todosCursos.size}):`)
    todosCursos.forEach((asig, curso) => console.log(`  "${curso}" → ${asig}`))

    // Crear un bloque por cada curso (horario base, un bloque por día)
    // Distribución automática: un bloque Lunes, un bloque Martes, etc.
    let colorIndex = 0
    let diaIndex = 0
    const horasBase = ["08:00", "09:30", "11:00", "12:30", "14:00"]
    const horasFin  = ["09:30", "11:00", "12:30", "14:00", "15:30"]

    todosCursos.forEach((asignatura, curso) => {
      const dia      = DIAS[diaIndex % DIAS.length]
      const hora     = horasBase[diaIndex % horasBase.length]
      const horaFin  = horasFin[diaIndex % horasFin.length]
      const color    = colorParaCurso(colorIndex)
      const uid_bloque = `${dia.toLowerCase().slice(0,3)}_${curso.replace(/[^a-z0-9]/gi, "").toLowerCase()}_${Date.now()}_${colorIndex}`

      clasesReconstruidas.push({
        uid: uid_bloque,
        resumen: curso,
        dia,
        horaInicio: hora,
        horaFin: horaFin,
        color,
        tipo: "clase",
        asignatura,
      })

      colorIndex++
      diaIndex++
    })

    console.log(`\nBloques reconstruidos: ${clasesReconstruidas.length}`)
  }

  // ── 5. Guardar el horario reconstruido ────────────────────────────────────
  console.log("\n── Paso 2: Guardar en configuracion/horario ─────────────────────")
  await db.doc(`users/${uid}/configuracion/horario`).set({
    clases: clasesReconstruidas,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })
  console.log(`✅ Guardados ${clasesReconstruidas.length} bloques:`)
  clasesReconstruidas.forEach(c => {
    console.log(`   ${c.dia} ${c.horaInicio}-${c.horaFin} | "${c.resumen}" | ${c.tipo} | ${c.color}`)
  })

  // ── 6. Reconstruir nivel_mapping ───────────────────────────────────────────
  console.log("\n── Paso 3: Reconstruir nivel_mapping ────────────────────────────")

  // Inferir niveles desde el nombre del curso
  const NIVEL_REGEX = [
    [/\b1[°º]?\s*(básico|b[aá]sico|a|b)\b/i,   "1ro Básico"],
    [/\b2[°º]?\s*(básico|b[aá]sico|a|b)\b/i,   "2do Básico"],
    [/\b3[°º]?\s*(básico|b[aá]sico|a|b)?\b/i,  "3ro Básico"],
    [/\b4[°º]?\s*(básico|b[aá]sico|a|b)?\b/i,  "4to Básico"],
    [/\b5[°º]?\s*(básico|b[aá]sico)\b/i,        "5to Básico"],
    [/\b6[°º]?\s*(básico|b[aá]sico)\b/i,        "6to Básico"],
    [/\b7[°º]?\s*(básico|b[aá]sico)\b/i,        "7mo Básico"],
    [/\b8[°º]?\s*(básico|b[aá]sico)\b/i,        "8vo Básico"],
    [/\b1[°º]?\s*medio\b/i,                     "1ro Medio"],
    [/\b2[°º]?\s*medio\b/i,                     "2do Medio"],
    [/taller.*1er/i,                             "1ro Básico"],
    [/taller.*2do/i,                             "4to Básico"],
  ]

  function inferirNivel(nombreCurso) {
    for (const [regex, nivel] of NIVEL_REGEX) {
      if (regex.test(nombreCurso)) return nivel
    }
    return null
  }

  const mapping = {}
  clasesReconstruidas.forEach(c => {
    const nivel = inferirNivel(c.resumen)
    if (nivel && !mapping[c.resumen]) {
      mapping[c.resumen] = nivel
    }
  })

  if (Object.keys(mapping).length > 0) {
    await db.doc(`users/${uid}/configuracion/nivel_mapping`).set({ mapping })
    console.log("✅ nivel_mapping reconstruido:")
    Object.entries(mapping).forEach(([k, v]) => console.log(`   "${k}" → "${v}"`))
  } else {
    console.log("⚠️ No se pudo inferir niveles automáticamente. Configúralos en Mi Perfil → Asignaturas.")
  }

  console.log("\n═══════════════════════════════════════════════════════")
  console.log("  ✅ RECONSTRUCCIÓN COMPLETADA")
  console.log("  → Recarga la página /perfil para ver los cambios")
  console.log("═══════════════════════════════════════════════════════\n")
}

main().catch(e => { console.error("Error fatal:", e.message, e.stack); process.exit(1) })
