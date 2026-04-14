"use client"

import { useAuth } from "@/components/auth/auth-context"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { BookOpen } from "lucide-react"

export default function LoginPage() {
  const { user, signInWithGoogle, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) {
      router.push("/")
    }
  }, [user, loading, router])

  if (loading) return <div className="min-h-screen grid place-items-center">Cargando...</div>

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-card rounded-[20px] shadow-xl p-8 text-center border border-border">
        <div className="w-16 h-16 bg-pink-light text-primary rounded-2xl flex items-center justify-center mx-auto mb-6">
          <BookOpen className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-extrabold mb-2">Bienvenido a EduPanel</h1>
        <p className="text-muted-foreground mb-8">Inicia sesión para gestionar tus clases y planificaciones.</p>

        <button
          onClick={signInWithGoogle}
          className="w-full bg-primary text-white rounded-xl py-3.5 font-bold hover:bg-pink-dark transition-colors flex items-center justify-center gap-2"
        >
          Iniciar sesión con Google
        </button>
      </div>
    </div>
  )
}
