"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { auth } from "@/lib/firebase"
import { User, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, signInWithCustomToken } from "firebase/auth"
import { isEmailAllowed } from "@/lib/allowlist"

interface AuthContextType {
  user: User | null
  loading: boolean
  /** Si es true, hubo login pero el email no esta en la allowlist. */
  blockedByAllowlist: boolean
  signInWithGoogle: () => Promise<void>
  signInWithGoogleCalendar: () => Promise<void>
  signInWithGoogleDrive: () => Promise<void>
  signInWithToken: (token: string) => Promise<void>
  logout: () => Promise<void>
  recheckAllowlist: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [blockedByAllowlist, setBlockedByAllowlist] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setUser(null)
        setBlockedByAllowlist(false)
        setLoading(false)
        return
      }

      // Verificar que el email este invitado a la alfa cerrada
      const allowed = await isEmailAllowed(currentUser.email)
      if (!allowed) {
        setUser(currentUser)
        setBlockedByAllowlist(true)
        setLoading(false)
        return
      }

      setBlockedByAllowlist(false)
      setUser(currentUser)
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider()
    provider.addScope("profile")
    provider.addScope("email")
    try {
      await signInWithPopup(auth, provider)
      // El check de allowlist se hace en onAuthStateChanged arriba
    } catch (error) {
      console.error("Error signing in with Google", error)
      throw error
    }
  }

  const signInWithToken = async (token: string) => {
    try {
      await signInWithCustomToken(auth, token)
    } catch (error) {
      console.error("Error signing in with custom token", error)
      throw error
    }
  }

  const signInWithGoogleCalendar = async () => {
    const provider = new GoogleAuthProvider()
    provider.addScope("profile")
    provider.addScope("email")
    provider.addScope("https://www.googleapis.com/auth/calendar.events")
    provider.setCustomParameters({ prompt: "consent" })
    try {
      const result = await signInWithPopup(auth, provider)
      const credential = GoogleAuthProvider.credentialFromResult(result)
      if (!credential?.accessToken) {
        throw new Error("No se recibio token de Google Calendar")
      }
      const { guardarGoogleCalendarToken } = await import("@/lib/google-calendar")
      guardarGoogleCalendarToken(credential.accessToken)
    } catch (error) {
      console.error("Error connecting Google Calendar", error)
      throw error
    }
  }

  const signInWithGoogleDrive = async () => {
    const provider = new GoogleAuthProvider()
    provider.addScope("profile")
    provider.addScope("email")
    provider.addScope("https://www.googleapis.com/auth/drive.metadata.readonly")
    provider.addScope("https://www.googleapis.com/auth/drive.file")
    provider.setCustomParameters({ prompt: "consent" })
    try {
      const result = await signInWithPopup(auth, provider)
      const credential = GoogleAuthProvider.credentialFromResult(result)
      if (!credential?.accessToken) {
        throw new Error("No se recibio token de Google Drive")
      }
      const { guardarGoogleDriveToken } = await import("@/lib/google-drive")
      guardarGoogleDriveToken(credential.accessToken)
    } catch (error) {
      console.error("Error connecting Google Drive", error)
      throw error
    }
  }

  const logout = async () => {
    try {
      await signOut(auth)
    } catch (error) {
      console.error("Error signing out", error)
      throw error
    }
  }

  const recheckAllowlist = async () => {
    if (!user) return
    const allowed = await isEmailAllowed(user.email)
    if (allowed) {
      setBlockedByAllowlist(false)
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, blockedByAllowlist, signInWithGoogle, signInWithGoogleCalendar, signInWithGoogleDrive, logout, recheckAllowlist, signInWithToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
