"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Bell, BookOpen, LogOut, Menu, WifiOff } from "lucide-react"
import { useEffect, useState } from "react"
import { useOnlineStatus } from "@/hooks/use-online-status"
import { useAuth } from "@/components/auth/auth-context"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { getAsignaturasDisponibles } from "@/lib/curriculo"
import { SUBJECT_FALLBACK_OPTIONS, buildUrl, withAsignatura } from "@/lib/shared"
import { ThemeSelector } from "./theme-selector"

const DAYS   = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

interface HeaderProps {
  onOpenMenu?: () => void
}

export function Header({ onOpenMenu }: HeaderProps) {
  const [fecha, setFecha]               = useState("")
  const [year, setYear]                 = useState<number | null>(null)
  const [subjectOptions, setSubjectOptions] = useState<string[]>(SUBJECT_FALLBACK_OPTIONS)
  const { user, logout } = useAuth()
  const pathname    = usePathname()
  const router      = useRouter()
  const searchParams = useSearchParams()
  const { asignatura, setAsignatura } = useActiveSubject()
  const isOnline = useOnlineStatus()

  useEffect(() => {
    const d = new Date()
    setFecha(`${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`)
    setYear(d.getFullYear())
  }, [])

  useEffect(() => {
    getAsignaturasDisponibles()
      .then((options) => setSubjectOptions(Array.from(new Set([...options, asignatura]))))
      .catch(() => setSubjectOptions((prev) => Array.from(new Set([...prev, asignatura]))))
  }, [asignatura])

  const handleSubjectChange = (nextSubject: string) => {
    setAsignatura(nextSubject)
    const currentParams = Object.fromEntries(searchParams.entries())
    router.replace(buildUrl(pathname, withAsignatura(currentParams, nextSubject)))
  }

  const subjectControl = (
    <div className="flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1">
      <BookOpen className="h-3.5 w-3.5 text-primary" />
      <select
        value={asignatura}
        onChange={(event) => handleSubjectChange(event.target.value)}
        className="bg-transparent pr-4 text-[12px] font-semibold text-foreground outline-none"
      >
        {subjectOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <header className="sticky top-0 z-50 flex h-[58px] items-center justify-between border-b border-border bg-card px-3.5 shadow-[0_1px_0_0_rgba(0,0,0,0.04)] sm:px-5">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onOpenMenu}
          className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-background lg:hidden"
          aria-label="Abrir menú"
        >
          <Menu className="h-[18px] w-[18px]" />
        </button>

        <Link href="/" className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-[10px] bg-primary shadow-sm">
            <BookOpen className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[15px] font-extrabold tracking-tight sm:text-[16px]">EduPanel</span>
        </Link>
      </div>

      <div className="hidden items-center gap-3 text-[13px] font-medium text-muted-foreground md:flex">
        {!isOnline && (
          <span className="flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-400">
            <WifiOff className="h-3 w-3" /> Sin conexión
          </span>
        )}
        {year && (
          <span className="rounded-full border border-border bg-background px-3 py-1 text-[12px] font-semibold">
            {year}
          </span>
        )}
        {subjectControl}
        {fecha && <span className="text-[12px]">· {fecha}</span>}
      </div>

      <div className="hidden items-center gap-2 text-[12px] font-medium text-muted-foreground sm:flex md:hidden">
        {year && (
          <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold">
            {year}
          </span>
        )}
        {subjectControl}
      </div>

      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Selector de tema — color + dark mode */}
        <ThemeSelector />

        {/* Notificaciones */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="relative grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-background focus:outline-none"
              aria-label="Notificaciones"
            >
              <Bell className="h-[18px] w-[18px]" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[calc(100vw-2rem)] max-w-80 rounded-2xl border-border p-0 shadow-xl animate-in slide-in-from-top-2">
            <div className="flex items-center justify-between rounded-t-2xl border-b border-border bg-muted/30 px-5 py-3">
              <h4 className="text-[14px] font-extrabold">Notificaciones</h4>
            </div>
            <div className="p-6 text-center">
              <Bell className="mx-auto mb-3 h-8 w-8 text-muted-foreground opacity-20" />
              <p className="mb-1 text-[13px] font-extrabold text-foreground">Bienvenido a EduPanel</p>
              <p className="text-[12px] text-muted-foreground">
                Tu cuenta {user?.email} está vinculada correctamente.
              </p>
            </div>
          </PopoverContent>
        </Popover>

        {/* Usuario */}
        {user ? (
          <div className="flex items-center gap-2 sm:gap-2.5 sm:pl-1">
            <span className="hidden text-[13px] font-bold text-foreground md:block">
              {user.displayName?.split(" ")[0]}
            </span>
            <Link href="/perfil" className="transition-opacity hover:opacity-80">
              {user.photoURL ? (
                <img src={user.photoURL} alt="Foto de perfil" className="h-8 w-8 rounded-full border border-border object-cover shadow-sm" />
              ) : (
                <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-primary to-pink-mid text-xs font-extrabold text-white shadow-sm">
                  {user.displayName?.charAt(0).toUpperCase() || "U"}
                </div>
              )}
            </Link>
            <button
              onClick={logout}
              className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>
    </header>
  )
}
