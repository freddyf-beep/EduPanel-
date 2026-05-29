/**
 * seed-qa-user.mjs
 * Script para poblar Firestore con datos iniciales para el usuario Codex QA UI.
 * Ejecutar: node scripts/seed-qa-user.mjs
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
const admin = require("firebase-admin")

const projectId   = process.env.FIREBASE_ADMIN_PROJECT_ID
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
const privateKey  = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n")

if (!projectId || !clientEmail || !privateKey) {
  console.error("❌ Faltan variables de entorno para inicializar Firebase Admin.")
  process.exit(1)
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  })
}

const db = admin.firestore()
const uid = "uSyXwkXm8iW07RTHRWfIdRWqAJm2" // Codex QA UI

async function runSeed() {
  console.log("🚀 Iniciando seeding de datos para Codex QA UI...")
  const userRef = db.collection("users").doc(uid)

  // 1. Perfil
  console.log("  👤 Seeding Perfil...")
  await userRef.collection("perfil_info").doc("main").set({
    tipoProfesor: "Media",
    especialidad: "Música",
    estudios: "Pedagogía en Educación Musical - UMCE",
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  })

  await userRef.collection("perfil_info").doc("colegio").set({
    nombre: "Liceo Bicentenario de Artes de Santiago",
    rbd: "10203",
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  })

  // 2. Horario
  console.log("  📅 Seeding Horario...")
  await userRef.collection("configuracion").doc("horario").set({
    clases: [
      { dia: 1, bloque: 1, curso: "1° Medio A", asignatura: "Música", tipo: "clase", resumen: "1° Medio A - Música" },
      { dia: 1, bloque: 2, curso: "1° Medio A", asignatura: "Música", tipo: "clase", resumen: "1° Medio A - Música" },
      { dia: 2, bloque: 3, curso: "2° Medio B", asignatura: "Música", tipo: "clase", resumen: "2° Medio B - Música" },
      { dia: 2, bloque: 4, curso: "2° Medio B", asignatura: "Música", tipo: "clase", resumen: "2° Medio B - Música" },
      { dia: 3, bloque: 1, curso: "5° Básico A", asignatura: "Música", tipo: "clase", resumen: "5° Básico A - Música" },
      { dia: 3, bloque: 2, curso: "5° Básico A", asignatura: "Música", tipo: "clase", resumen: "5° Básico A - Música" }
    ],
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  })

  // 3. Nivel Mapping
  console.log("  🗺️ Seeding Nivel Mapping...")
  await userRef.collection("configuracion").doc("nivel_mapping").set({
    mapping: {
      "1° Medio A": "1ro Medio",
      "2° Medio B": "2do Medio",
      "5° Básico A": "5to Básico"
    },
    cursoTipos: {
      "1° Medio A": "Media",
      "2° Medio B": "Media",
      "5° Básico A": "General Básica"
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  })

  // 4. Estudiantes
  console.log("  👥 Seeding Estudiantes...")
  await userRef.collection("estudiantes").doc("1_medio_a").set({
    alumnos: [
      { id: "al_1", nombre: "Abigail Godoy", hasPie: false },
      { id: "al_2", nombre: "Carlos Toledo", hasPie: true, pieTipo: "TDAH" },
      { id: "al_3", nombre: "Samira Levican", hasPie: false },
      { id: "al_4", nombre: "Leonor Turra", hasPie: true, pieTipo: "TEA" },
      { id: "al_5", nombre: "Javier Pardo", hasPie: false }
    ],
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  })

  await userRef.collection("estudiantes").doc("2_medio_b").set({
    alumnos: [
      { id: "al_6", nombre: "Aracely Barría", hasPie: false },
      { id: "al_7", nombre: "Esperanza Coñapi", hasPie: true, pieTipo: "FIL" },
      { id: "al_8", nombre: "Samir Levican", hasPie: false }
    ],
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  })

  await userRef.collection("estudiantes").doc("5_basico_a").set({
    alumnos: [
      { id: "al_9", nombre: "Cristóbal Gutiérrez", hasPie: false },
      { id: "al_10", nombre: "Maite Gallegos", hasPie: false },
      { id: "al_11", nombre: "Gael Herrera", hasPie: true, pieTipo: "TDAH" }
    ],
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  })

  // 5. Ver Unidad (Planificaciones)
  console.log("  📋 Seeding Planificaciones (ver_unidad)...")
  await userRef.collection("ver_unidad").doc("musica__1_medio_a__1").set({
    asignatura: "Música",
    curso: "1° Medio A",
    unidadId: "unidad_1",
    nombre_unidad: "Unidad 1: Música y Tradición",
    oas: [
      {
        id: "oa_1",
        numero: 1,
        descripcion: "Cantar y tocar música de diversas culturas y épocas, expresando su sentido por medio de elementos del lenguaje musical.",
        seleccionado: true,
        tipo: "OA",
        indicadores: [
          { texto: "Cantan y tocan repertorio con precisión rítmica y melódica.", seleccionado: true },
          { texto: "Aplican fraseo y dinámicas en sus interpretaciones.", seleccionado: true }
        ]
      },
      {
        id: "oa_2",
        numero: 2,
        descripcion: "Reconocer y describir críticamente elementos del lenguaje musical en obras escuchadas o interpretadas.",
        seleccionado: true,
        tipo: "OA",
        indicadores: [
          { texto: "Identifican formas y estructuras en obras folclóricas chilenas.", seleccionado: true }
        ]
      }
    ],
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  })

  console.log("✨ Seeding completado exitosamente para Codex QA UI!")
}

runSeed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Error en seeding:", err)
    process.exit(1)
  })
