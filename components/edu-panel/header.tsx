"use client"

import Link from "next/link"
import { Bell, Music, BookOpen, LogOut } from "lucide-react"
import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth/auth-context"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const DAYS = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"]
const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]

export function Header() {
  const [fecha, setFecha] = useState("")
  const { user, logout } = useAuth()

  useEffect(() => {
    const d = new Date()
    setFecha(`${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`)
  }, [])

  return (
    <header className="sticky top-0 z-50 flex h-[58px] items-center justify-between border-b border-border bg-card px-5 shadow-[0_1px_0_0_rgba(0,0,0,0.04)]">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5">
        <div className="grid h-8 w-8 place-items-center rounded-[10px] bg-primary shadow-sm">
          <BookOpen className="h-4 w-4 text-white" strokeWidth={2.5} />
        </div>
        <span className="text-[16px] font-extrabold tracking-tight">EduPanel</span>
      </Link>

      {/* Centro: año + asignatura */}
      <div className="hidden md:flex items-center gap-3 text-[13px] text-muted-foreground font-medium">
        <span className="bg-background border border-border rounded-full px-3 py-1 text-[12px] font-semibold">
          2026
        </span>
        <div className="flex items-center gap-1.5">
          <Music className="h-3.5 w-3.5 text-primary" />
          <span>Música</span>
        </div>
        {fecha && <span className="text-[12px]">· {fecha}</span>}
      </div>

      {/* Derecha: acciones */}
      <div className="flex items-center gap-3">
        <Popover>
          <PopoverTrigger asChild>
            <button className="relative grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-background transition-colors focus:outline-none">
              <Bell className="h-[18px] w-[18px]" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary border-2 border-background" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0 rounded-2xl shadow-xl border-border animate-in slide-in-from-top-2">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-slate-50/50 rounded-t-2xl">
              <h4 className="text-[14px] font-extrabold">Notificaciones</h4>
              <span className="text-[11px] font-bold bg-pink-light text-primary px-2 py-0.5 rounded-full">1 Nueva</span>
            </div>
            <div className="p-6 text-center">
              <Bell className="w-8 h-8 mx-auto text-muted-foreground opacity-20 mb-3" />
              <p className="text-[13px] font-extrabold text-foreground mb-1">¡Bienvenido a EduPanel!</p>
              <p className="text-[12px] text-muted-foreground">Tu cuenta de Google {user?.email} ha sido vinculada correctamente al espacio de configuración.</p>
            </div>
          </PopoverContent>
        </Popover>
        
        {user ? (
          <div className="flex items-center gap-2.5 ml-2">
            <span className="hidden md:block text-[13px] font-bold text-foreground">
              {user.displayName?.split(" ")[0]}
            </span>
            <Link href="/perfil" className="hover:opacity-80 transition-opacity">
              {user.photoURL ? (
                <img src={user.photoURL} alt="User" className="h-8 w-8 rounded-full border stroke-border shadow-sm" />
              ) : (
                <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-primary to-pink-mid text-xs font-extrabold text-white shadow-sm">
                  {user.displayName?.charAt(0).toUpperCase() || "U"}
                </div>
              )}
            </Link>
            <button onClick={logout} className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors" title="Cerrar sesión">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>
    </header>
  )
}
