"use client"

// ═══════════════════════════════════════════════════════════════════════════
// Hook cliente para guardar pruebas/guías creando un snapshot automático
// ─────────────────────────────────────────────────────────────────────────
// Wrapper delgado que se usa desde los editores (no desde `lib/pruebas.ts`
// ni `lib/guias.ts`) para versionar el documento al guardar manualmente:
//
//   1. Persiste el documento con `guardarPrueba`/`guardarGuia` (operación
//      crítica).
//   2. Intenta crear un snapshot inmutable en la subcolección
//      `users/{uid}/{pruebas|guias}/{id}/snapshots`.
//
// Si la creación del snapshot falla, el guardado del documento NO se revierte
// y el error se reporta a consola: la copia versionada es best-effort.
// ═══════════════════════════════════════════════════════════════════════════

import type { PruebaTemplate } from "@/lib/pruebas"
import type { GuiaTemplate } from "@/lib/guias"
import type { TipoDocumento } from "@/lib/snapshots"
import { guardarPrueba } from "@/lib/pruebas"
import { guardarGuia } from "@/lib/guias"
import { crearSnapshot } from "@/lib/snapshots"
import { auth } from "@/lib/firebase"

/**
 * Identificador legible del autor del snapshot. Devuelve `displayName`,
 * `email` o `uid` del usuario autenticado, en ese orden de preferencia.
 * Cuando no hay sesión activa retorna `"anónimo"`.
 */
export function autorActual(): string {
  const u = auth?.currentUser
  return u?.displayName || u?.email || u?.uid || "anónimo"
}

/**
 * Guarda la prueba y, en caso de éxito, registra un snapshot inmutable.
 *
 * El guardado en Firestore es la operación crítica: si la creación del
 * snapshot falla, NO se interrumpe el flujo del editor y el error se
 * registra con `console.warn` para diagnóstico.
 *
 * @param prueba PruebaTemplate completa a persistir.
 */
export async function guardarPruebaConSnapshot(
  prueba: PruebaTemplate,
): Promise<void> {
  await guardarPrueba(prueba)
  try {
    await crearSnapshot(
      "pruebas" satisfies TipoDocumento,
      prueba.id,
      prueba,
      autorActual(),
    )
  } catch (e) {
    console.warn("[snapshot]", e)
  }
}

/**
 * Guarda la guía y, en caso de éxito, registra un snapshot inmutable.
 *
 * Equivalente a `guardarPruebaConSnapshot` pero para `GuiaTemplate`. La
 * creación del snapshot es best-effort y nunca revierte el guardado.
 *
 * @param guia GuiaTemplate completa a persistir.
 */
export async function guardarGuiaConSnapshot(
  guia: GuiaTemplate,
): Promise<void> {
  await guardarGuia(guia)
  try {
    await crearSnapshot(
      "guias" satisfies TipoDocumento,
      guia.id,
      guia,
      autorActual(),
    )
  } catch (e) {
    console.warn("[snapshot]", e)
  }
}
