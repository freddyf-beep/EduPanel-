/**
 * Helpers centralizados para administracion.
 * Unica fuente de verdad para el listado de admins.
 *
 * NOTA DE SEGURIDAD: la verificacion real se hace server-side en
 * `lib/auth/verify-token.ts` (que usa las mismas constantes via ADMIN_EMAIL env).
 * Este archivo es solo para UI — redirigir antes de mostrar layout, mostrar badges,
 * etc. NUNCA confiar en el client para autorizar una operacion destructiva.
 */

/** Lista hardcodeada de emails admin. Mantener sincronizado con:
 *  - firestore.rules (isAdmin)
 *  - lib/auth/verify-token.ts (DEFAULT_ADMIN_EMAILS)
 */
export const DEFAULT_ADMIN_EMAILS = [
  "udefret34@gmail.com",
  "freddyfiguea@gmail.com",
]

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").toLowerCase().trim()
}

/**
 * Verifica si un email pertenece a un admin.
 * Considera DEFAULT_ADMIN_EMAILS + la env var NEXT_PUBLIC_ADMIN_EMAIL (coma-separada).
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  const key = normalizeEmail(email)
  if (!key) return false
  const extra = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean)
  const allAdmins = [...DEFAULT_ADMIN_EMAILS.map(normalizeEmail), ...extra]
  return allAdmins.includes(key)
}
