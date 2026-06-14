import { db } from "@/lib/firebase"
import { doc, getDoc, updateDoc } from "firebase/firestore"

export type FeatureTier = "free" | "low-cost" | "premium"

export interface FeatureFlag {
  id: string
  name: string
  description: string
  tier: FeatureTier
  active: boolean
  group: number // Para ordenarlos por fase
}

// Valores por defecto (Fallback si Firestore falla)
export const DEFAULT_FEATURE_FLAGS: Record<string, FeatureFlag> = {
  // Grupo 1: Costo Cero (Activados por defecto)
  "agent-sustituciones": { id: "agent-sustituciones", name: "Agente de Sustituciones", description: "Sugiere reemplazos para docentes ausentes.", tier: "free", active: true, group: 1 },
  "planificador-automatch": { id: "planificador-automatch", name: "Auto-Match Interdisciplinario", description: "Avisa cruces de planificaciones (ABP).", tier: "free", active: true, group: 1 },
  "colaboracion-vivo": { id: "colaboracion-vivo", name: "Colaboración en Vivo", description: "Cursores en tiempo real y Kahoot.", tier: "free", active: true, group: 1 },
  "notificaciones-push": { id: "notificaciones-push", name: "Notificaciones Inteligentes", description: "Alertas Push al celular/PC.", tier: "free", active: true, group: 1 },
  "firebase-extensions": { id: "firebase-extensions", name: "Súper-Poderes Plug & Play", description: "Mails automáticos, BigQuery export.", tier: "free", active: true, group: 1 },
  "remote-config": { id: "remote-config", name: "Configuración Remota", description: "Cambiar variables y prompts sin código.", tier: "free", active: true, group: 1 },

  // Grupo 2: Costo Ultra-Bajo (Activados por defecto para el desarrollo)
  "radar-desercion": { id: "radar-desercion", name: "Radar de Deserción", description: "Alerta de abandono escolar temprano.", tier: "low-cost", active: true, group: 2 },
  "predictor-cobertura": { id: "predictor-cobertura", name: "Predictor de Cobertura", description: "Alerta de atrasos curriculares.", tier: "low-cost", active: true, group: 2 },
  "corrector-tono": { id: "corrector-tono", name: "Corrector de Anotaciones", description: "Filtro anti-problemas legales.", tier: "low-cost", active: true, group: 2 },
  "fabrica-preguntas": { id: "fabrica-preguntas", name: "Fábrica Infinita de Preguntas", description: "Llena el banco de actividades de noche.", tier: "low-cost", active: true, group: 2 },
  "redactor-informes": { id: "redactor-informes", name: "Redactor de Informes de Personalidad", description: "Hace informes de fin de semestre.", tier: "low-cost", active: true, group: 2 },
  "calibrador-bloom": { id: "calibrador-bloom", name: "Calibrador de Dificultad", description: "Audita la Taxonomía de Bloom en pruebas.", tier: "low-cost", active: true, group: 2 },
  "rutas-aprendizaje": { id: "rutas-aprendizaje", name: "Rutas de Aprendizaje Auto-Generadas", description: "Guías de refuerzo 1-a-1 personalizadas.", tier: "low-cost", active: true, group: 2 },
  "testeador-alumnos": { id: "testeador-alumnos", name: "Testeador de Alumnos Simulados", description: "Prueba la guía con alumnos IA antes de imprimir.", tier: "low-cost", active: true, group: 2 },
  "ilustrador-casos": { id: "ilustrador-casos", name: "Ilustrador de Casos Prácticos", description: "Crea imágenes para las pruebas con IA.", tier: "low-cost", active: true, group: 2 },
  "expansion-curriculum": { id: "expansion-curriculum", name: "Expansión del Currículum", description: "Baja los PDFs del MINEDUC automáticamente.", tier: "low-cost", active: true, group: 2 },

  // Grupo 3: Premium Durmiente (Apagados por defecto)
  "recomendador-semantico": { id: "recomendador-semantico", name: "Recomendador Semántico", description: "Busca recursos por significado profundo.", tier: "premium", active: false, group: 3 },
  "rubricas-sello": { id: "rubricas-sello", name: "Rúbricas con Sello Institucional", description: "Inyecta el PEI del colegio a la rúbrica.", tier: "premium", active: false, group: 3 },
  "bot-apoderados": { id: "bot-apoderados", name: "Asistente de Apoderados 24/7", description: "Chatbot institucional inteligente.", tier: "premium", active: false, group: 3 },
}

export const SAFE_FALLBACK_FEATURE_FLAGS: Record<string, FeatureFlag> = Object.fromEntries(
  Object.entries(DEFAULT_FEATURE_FLAGS).map(([id, flag]) => [
    id,
    { ...flag, active: flag.tier === "free" ? flag.active : false },
  ])
) as Record<string, FeatureFlag>

function mergeFeatureFlags(remote: Record<string, any> | undefined): Record<string, FeatureFlag> {
  const merged: Record<string, FeatureFlag> = { ...DEFAULT_FEATURE_FLAGS }
  if (!remote) return merged

  for (const [id, value] of Object.entries(remote)) {
    const base = DEFAULT_FEATURE_FLAGS[id]
    if (!base && !value) continue
    merged[id] = {
      ...(base ?? { id, name: id, description: "", tier: "free" as FeatureTier, active: false, group: 99 }),
      ...(typeof value === "object" && value !== null ? value : {}),
      id,
    }
  }

  return merged
}

export async function getFeatureFlags(): Promise<Record<string, FeatureFlag>> {
  try {
    const docRef = doc(db, "config", "feature_flags")
    const snap = await getDoc(docRef)

    if (snap.exists()) return mergeFeatureFlags(snap.data())
    return DEFAULT_FEATURE_FLAGS
  } catch (error) {
    console.warn("[feature-flags] usando valores locales por falta de acceso a config/feature_flags", error)
    return SAFE_FALLBACK_FEATURE_FLAGS
  }
}

export async function updateFeatureFlag(id: string, active: boolean): Promise<void> {
  try {
    const docRef = doc(db, "config", "feature_flags")
    await updateDoc(docRef, {
      [`${id}.active`]: active
    })
  } catch (error) {
    console.error("Error updating feature flag", error)
    throw error
  }
}
