/**
 * Plantilla_Inteligente
 * ─────────────────────
 * Helpers puros (sin Firestore ni React) que generan estructuras sugeridas
 * de secciones para PruebaTemplate y GuiaTemplate a partir de los OAs
 * vinculados a una `UnidadPlan`.
 *
 * Solo aditivo: NO modifica `lib/pruebas.ts` ni `lib/guias.ts` ni
 * `lib/curriculo.ts`. Reutiliza únicamente las factorías existentes
 * (`nuevaSeccion`, `nuevoItem`, `nuevaSeccionGuia`, `nuevaActividadGuia`)
 * para mantener compatibilidad total con el modelo actual.
 *
 * Ref: spec `pruebas-guias-unificado` Req 4.11.
 */

import type { OAEditado, UnidadPlan } from "@/lib/curriculo"
import { nuevaSeccion, nuevoItem, type SeccionPrueba } from "@/lib/pruebas"
import {
  nuevaActividadGuia,
  nuevaSeccionGuia,
  type SeccionGuia,
} from "@/lib/guias"

/**
 * `UnidadPlan` no incluye los OAs en su tipo base (se cargan vía
 * `cargarVerUnidad`), pero las callers de este helper típicamente ya
 * disponen de los OAs resueltos. Aceptamos una extensión opcional
 * `oas?: OAEditado[]` de forma puramente aditiva: callers pueden pasar
 * un `UnidadPlan` "plano" (en cuyo caso devolvemos `[]`) o uno
 * enriquecido con sus OAs.
 */
export type UnidadPlanConOAs = UnidadPlan & { oas?: OAEditado[] }

/** Máximo de caracteres usados como título de sección a partir del OA. */
const MAX_TITULO = 80
/** Cantidad de ítems/actividades en blanco que se prearman por OA. */
const ITEMS_POR_SECCION = 2

function truncar(texto: string, max: number): string {
  const limpio = (texto || "").trim()
  if (!limpio) return ""
  if (limpio.length <= max) return limpio
  // Recortar respetando palabra cuando sea razonable.
  const corte = limpio.slice(0, max)
  const ultEspacio = corte.lastIndexOf(" ")
  const base = ultEspacio > max * 0.6 ? corte.slice(0, ultEspacio) : corte
  return `${base.trimEnd()}…`
}

/** Filtra los OAs aprovechables para prearmar secciones. */
function oasUtilizables(unidad: UnidadPlanConOAs | null | undefined): OAEditado[] {
  if (!unidad) return []
  const oas = Array.isArray(unidad.oas) ? unidad.oas : []
  return oas.filter((oa) => {
    if (!oa || typeof oa.id !== "string") return false
    // Si el OA fue marcado explícitamente como no seleccionado, lo respetamos.
    if (oa.seleccionado === false) return false
    return true
  })
}

function tituloSeccionDesdeOA(oa: OAEditado, idx: number): string {
  const desc = (oa.descripcion || "").trim()
  if (!desc) return `Sección ${idx + 1} – ${oa.id}`
  const compuesto = `${oa.id}: ${desc}`
  return truncar(compuesto, MAX_TITULO)
}

function instruccionesDesdeOA(oa: OAEditado): string | null {
  const desc = truncar(oa.descripcion || "", 120)
  if (!desc) return null
  return `Trabaja los siguientes ejercicios sobre ${desc}`
}

/**
 * Genera una estructura sugerida de secciones para una nueva
 * `PruebaTemplate` a partir de los OAs de la unidad: una sección por
 * OA con dos ítems iniciales en blanco (`seleccion_multiple`), cada
 * uno vinculado al OA correspondiente.
 *
 * Si la unidad es `null`/`undefined` o no tiene OAs aprovechables,
 * devuelve `[]` para que el caller pueda dejar la prueba con su
 * estructura por defecto.
 */
export function prearmarSeccionesPruebaDesdeUnidad(
  unidad: UnidadPlanConOAs | null | undefined,
): SeccionPrueba[] {
  const oas = oasUtilizables(unidad)
  if (!oas.length) return []

  return oas.map((oa, idx) => {
    const seccion = nuevaSeccion(idx + 1, "mixto")
    seccion.titulo = tituloSeccionDesdeOA(oa, idx)
    const instr = instruccionesDesdeOA(oa)
    if (instr) seccion.instrucciones = instr

    const items = Array.from({ length: ITEMS_POR_SECCION }, () => {
      const item = nuevoItem("seleccion_multiple", 1)
      item.oaVinculado = oa.id
      return item
    })
    seccion.items = items
    return seccion
  })
}

/**
 * Genera una estructura sugerida de secciones para una nueva
 * `GuiaTemplate` a partir de los OAs de la unidad: una sección por
 * OA con un bloque de contenido didáctico vacío y dos actividades en
 * blanco (`seleccion_multiple`) vinculadas al OA correspondiente.
 *
 * Si la unidad es `null`/`undefined` o no tiene OAs aprovechables,
 * devuelve `[]` para que el caller pueda dejar la guía con su
 * estructura por defecto.
 */
export function prearmarSeccionesGuiaDesdeUnidad(
  unidad: UnidadPlanConOAs | null | undefined,
): SeccionGuia[] {
  const oas = oasUtilizables(unidad)
  if (!oas.length) return []

  return oas.map((oa, idx) => {
    const seccion = nuevaSeccionGuia(idx + 1)
    seccion.titulo = tituloSeccionDesdeOA(oa, idx)
    const desc = truncar(oa.descripcion || "", 160)
    if (desc) seccion.descripcion = desc
    // Bloque de contenido didáctico vacío para que el docente lo complete.
    seccion.contenido = []

    seccion.actividades = Array.from({ length: ITEMS_POR_SECCION }, () => {
      const actividad = nuevaActividadGuia("seleccion_multiple", 1)
      actividad.oaVinculado = oa.id
      return actividad
    })
    return seccion
  })
}
