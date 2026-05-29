import { redirect } from "next/navigation"

/**
 * Ruta legacy /calificaciones-v2 — redirige permanentemente a /calificaciones.
 * El shell CalificacionesV2Shell ya es la versión actual en /calificaciones.
 */
export default function CalificacionesV2Page() {
  redirect("/calificaciones")
}
