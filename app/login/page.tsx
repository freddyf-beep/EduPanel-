"use client"

import { useAuth } from "@/components/auth/auth-context"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle, KeyRound, Loader2, CheckCircle2 } from "lucide-react"
import { apiFetch, ApiError } from "@/lib/api-client"

function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    const body = error.body as { error?: unknown } | undefined
    return typeof body?.error === "string" ? body.error : error.message
  }
  return error instanceof Error ? error.message : fallback
}

export default function LoginPage() {
  const { user, signInWithGoogle, logout, loading, blockedByAllowlist, recheckAllowlist } = useAuth()
  const router = useRouter()
  const [inviteCode, setInviteCode] = useState("")
  const [redeeming, setRedeeming] = useState(false)
  const [redeemError, setRedeemError] = useState("")
  const [signInError, setSignInError] = useState("")
  const [signingIn, setSigningIn] = useState(false)
  const [redeemSuccess, setRedeemSuccess] = useState(false)

  useEffect(() => {
    if (!loading && user && !blockedByAllowlist) {
      router.push("/")
    }
  }, [user, loading, blockedByAllowlist, router])

  const handleRedeem = async () => {
    if (!inviteCode.trim() || !user) return
    setRedeeming(true)
    setRedeemError("")
    try {
      await apiFetch("/api/redeem-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: inviteCode.trim() }),
      })

      setRedeemSuccess(true)
      await recheckAllowlist()
    } catch (error) {
      setRedeemError(getApiErrorMessage(error, "Error al canjear el codigo"))
    } finally {
      setRedeeming(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setSigningIn(true)
    setSignInError("")
    try {
      await signInWithGoogle()
    } catch (error) {
      setSignInError(getApiErrorMessage(error, "No se pudo iniciar sesion con Google."))
    } finally {
      setSigningIn(false)
    }
  }

  if (loading) return <div className="min-h-screen grid place-items-center">Cargando...</div>

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-card rounded-[20px] shadow-xl p-8 text-center border border-border">
        <img src="/logos/logo-3.png" alt="EduPanel" className="w-20 h-20 mx-auto mb-6 rounded-2xl shadow-sm object-contain" />
        <h1 className="text-2xl font-extrabold mb-2">Bienvenido a EduPanel</h1>
        <p className="text-muted-foreground mb-6">Inicia sesion para gestionar tus clases y planificaciones.</p>

        {blockedByAllowlist && (
          <div className="mb-6 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-5 text-left">
            <div className="flex gap-3 mb-4">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-bold text-amber-900 dark:text-amber-200 mb-1">
                  Aun no tienes acceso
                </p>
                <p className="text-amber-800 dark:text-amber-300">
                  EduPanel esta en alfa cerrada. Ingresa tu codigo de invitacion para entrar.
                </p>
              </div>
            </div>

            {redeemSuccess ? (
              <div className="flex items-center gap-2 text-green-700 bg-green-100 p-3 rounded-lg border border-green-300">
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-sm font-bold">Codigo canjeado con exito. Redirigiendo...</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="EDU-ABCD-1234"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    className="flex-1 bg-white border border-amber-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500 uppercase"
                  />
                  <button
                    onClick={handleRedeem}
                    disabled={redeeming || !inviteCode.trim()}
                    className="bg-amber-500 text-white font-bold px-4 rounded-lg hover:bg-amber-600 disabled:opacity-50 text-sm flex items-center gap-1.5"
                  >
                    {redeeming ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                    Canjear
                  </button>
                </div>
                {redeemError && <p className="text-red-500 text-xs font-semibold">{redeemError}</p>}
                <button
                  type="button"
                  onClick={logout}
                  className="mt-2 text-left text-xs font-semibold text-amber-800 underline hover:text-amber-950"
                >
                  Cambiar cuenta de Google
                </button>
              </div>
            )}
          </div>
        )}

        {!user && (
          <button
            onClick={handleGoogleSignIn}
            disabled={signingIn}
            className="w-full bg-primary text-white rounded-xl py-3.5 font-bold hover:opacity-90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {signingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {signingIn ? "Conectando..." : "Iniciar sesion con Google"}
          </button>
        )}

        {signInError && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-left text-xs font-semibold text-red-600">
            {signInError}
          </p>
        )}

        <p className="mt-6 text-[12px] text-muted-foreground leading-relaxed">
          Al iniciar sesion aceptas nuestros{" "}
          <Link href="/terminos" className="underline hover:text-foreground">
            Terminos de Uso
          </Link>{" "}
          y la{" "}
          <Link href="/privacidad" className="underline hover:text-foreground">
            Politica de Privacidad
          </Link>
          .
        </p>
      </div>

      <div className="mt-6 text-[12px] text-muted-foreground flex gap-4">
        <Link href="/terminos" className="hover:text-foreground">Terminos</Link>
        <Link href="/privacidad" className="hover:text-foreground">Privacidad</Link>
        <Link href="/contacto" className="hover:text-foreground">Contacto</Link>
      </div>
    </div>
  )
}
