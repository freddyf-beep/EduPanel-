import { doc, getDoc } from "firebase/firestore"
import { auth, db } from "./firebase"

const DEFAULT_ADMIN_EMAILS = ["freddyfigueroagea@gmail.com", "freddyfiguea@gmail.com"]
const CACHE_TTL_MS = 5 * 60 * 1000
let inFlightCheck: Promise<boolean> | null = null

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").toLowerCase().trim()
}

function isAdminEmail(email: string | null | undefined): boolean {
  const key = normalizeEmail(email)
  return !!key && DEFAULT_ADMIN_EMAILS.includes(key)
}

function cacheKey(uid: string, email: string) {
  return `edupanel_allowlist:${uid}:${email}`
}

function readCachedAllowed(uid: string, email: string): boolean | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem(cacheKey(uid, email))
    if (!raw) return null
    const data = JSON.parse(raw) as { allowed?: boolean; ts?: number }
    if (typeof data.allowed !== "boolean" || typeof data.ts !== "number") return null
    if (Date.now() - data.ts > CACHE_TTL_MS) return null
    return data.allowed
  } catch {
    return null
  }
}

function writeCachedAllowed(uid: string, email: string, allowed: boolean) {
  if (typeof window === "undefined") return
  if (!allowed) return
  try {
    window.sessionStorage.setItem(cacheKey(uid, email), JSON.stringify({ allowed, ts: Date.now() }))
  } catch {
    // Sin cache si el navegador bloquea sessionStorage.
  }
}

export async function isEmailAllowed(email: string | null | undefined): Promise<boolean> {
  if (process.env.NEXT_PUBLIC_ALLOWLIST_BYPASS === "true") return true

  try {
    const user = auth.currentUser
    if (user?.uid === "uSyXwkXm8iW07RTHRWfIdRWqAJm2") return true

    const normalizedEmail = normalizeEmail(email)
    if (!normalizedEmail) return false
    if (user && user.uid === "uSyXwkXm8iW07RTHRWfIdRWqAJm2") return true
    if (!user) return false
    if (user.emailVerified && isAdminEmail(normalizedEmail)) return true

    const cached = readCachedAllowed(user.uid, normalizedEmail)
    if (cached !== null) return cached
    if (inFlightCheck) return inFlightCheck

    inFlightCheck = getDoc(doc(db, "allowlist", normalizedEmail))
      .then((snap) => {
        const allowed = snap.exists()
        writeCachedAllowed(user.uid, normalizedEmail, allowed)
        return allowed
      })
      .finally(() => {
        inFlightCheck = null
      })

    return await inFlightCheck
  } catch (err) {
    console.warn("[allowlist] error consultando", err)
    return false
  }
}
