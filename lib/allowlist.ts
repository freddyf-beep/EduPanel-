import { auth } from "./firebase"

export async function isEmailAllowed(email: string | null | undefined): Promise<boolean> {
  if (process.env.NEXT_PUBLIC_ALLOWLIST_BYPASS === "true") return true
  if (!email) return false

  try {
    const user = auth.currentUser
    if (!user) return false

    const token = await user.getIdToken()
    const res = await fetch("/api/check-allowlist", {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) return false
    const data = await res.json()
    return data.allowed === true
  } catch (err) {
    console.warn("[allowlist] error consultando", err)
    return false
  }
}
