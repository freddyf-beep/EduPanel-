"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Home, BookOpen, LayoutGrid, Calendar, ClipboardCheck,
  Users, Music, ClipboardList, LifeBuoy, CalendarDays, UserCircle, LayoutList
} from "lucide-react"
import { buildUrl } from "@/lib/shared"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth/auth-context"
import { useEffect, useState } from "react"
import { cargarPerfil, PerfilUsuario } from "@/lib/perfil"
import { cargarHorarioSemanal } from "@/lib/horario"
import { CURRENT_VERSION } from "./version"

const mainNavItems = [
  { href: "/",               label: "Inicio",             icon: Home },
  { href: "/modulos",        label: "Módulos",            icon: LayoutGrid },
  { href: "/planificaciones",label: "Mis planificaciones",icon: BookOpen },
]

const toolsNavItems = [
  { href: "/cronograma",          label: "Cronograma",          icon: CalendarDays },
  { href: "/libro-clases",        label: "Libro de clases",     icon: ClipboardList },
  { href: "/calificaciones",      label: "Calificaciones",      icon: ClipboardCheck },
  { href: "/rubricas",            label: "Rúbricas",            icon: LayoutList },
  { href: "/perfil-360",          label: "Perfil 360",          icon: Users },
  { href: "/soporte",             label: "Ayuda",               icon: LifeBuoy },
  { href: "/perfil",              label: "Mi Perfil",           icon: UserCircle },
]

interface SidebarProps {
  mobile?: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ mobile, onNavigate }: SidebarProps) {
  const pathname = usePathname()
  const { user } = useAuth()
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null)
  const [cursosUnicos, setCursosUnicos] = useState<{ nombre: string, color: string }[]>([])

  useEffect(() => {
    if (user) {
      cargarPerfil().then(data => { if (data) setPerfil(data) }).catch(console.error)
      cargarHorarioSemanal().then(horario => {
        if (!horario) return
        const uniques = new Map<string, string>()
        horario.filter(h => h.tipo === "clase").forEach(h => {
          if (!uniques.has(h.resumen)) {
            uniques.set(h.resumen, h.color)
          }
        })
        setCursosUnicos(Array.from(uniques.entries()).map(([nombre, color]) => ({ nombre, color })))
      }).catch(console.error)
    }
  }, [user])

  const NavLink = ({ href, label, icon: Icon }: { href: string; label: string; icon: typeof Home }) => {
    const isActive = pathname === href || (href !== "/" && pathname.startsWith(href))
    return (
      <Link
        href={href}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13px] font-medium transition-colors",
          isActive
            ? "bg-pink-light font-semibold text-primary"
            : "text-muted-foreground hover:bg-background hover:text-foreground"
        )}
      >
        <Icon className="h-[17px] w-[17px] flex-shrink-0" />
        {label}
      </Link>
    )
  }

  return (
    <aside className={cn(
      "flex flex-shrink-0 flex-col overflow-y-auto border-border bg-card px-3 py-5",
      mobile ? "h-full w-full" : "hidden lg:flex sticky top-[58px] h-[calc(100vh-58px)] w-[220px] border-r"
    )}>
      {/* Perfil */}
      <div className="mb-4 flex flex-col items-center gap-2 border-b border-border px-3 pb-5 pt-2">
        {user?.photoURL ? (
          <img src={user.photoURL} alt="Foto" className="h-[52px] w-[52px] rounded-full object-cover border-2 border-background shadow-sm" />
        ) : (
          <div className="grid h-[52px] w-[52px] place-items-center rounded-full bg-gradient-to-br from-primary to-pink-mid text-lg font-extrabold text-primary-foreground shadow-sm">
            {user?.displayName?.charAt(0) || "U"}
          </div>
        )}
        <div className="text-center">
          <div className="text-[13px] font-bold">{user?.displayName?.split(" ")[0]} {user?.displayName?.split(" ")[1] || ""}</div>
          <div className="text-[11px] text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
            <Music className="h-3 w-3" /> {perfil?.tipoProfesor || "Profesor"}
          </div>
        </div>
      </div>

      {/* Nav principal */}
      <nav className="flex flex-col gap-0.5">
        {mainNavItems.map(item => <NavLink key={item.href} {...item} />)}

        <div className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wider text-[#c0c4d6]">
          Herramientas
        </div>
        {toolsNavItems.map(item => <NavLink key={item.href} {...item} />)}
      </nav>

      {/* Cursos rápidos */}
      <div className="mt-auto pt-4 border-t border-border">
        <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-[#c0c4d6]">
          Mis cursos
        </div>
        {cursosUnicos.length === 0 ? (
          <div className="px-3 py-2 text-[11px] text-muted-foreground italic">Configura tu horario en Mi Perfil</div>
        ) : null}
        {cursosUnicos.map((curso: { nombre: string, color: string }) => (
          <Link
            key={curso.nombre}
            href={buildUrl("/planificaciones", { curso: curso.nombre })}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-[10px] px-3 py-1.5 text-[12px] font-medium transition-colors",
              pathname.includes(`curso=${encodeURIComponent(curso.nombre)}`)
                ? "bg-pink-light text-primary font-semibold"
                : "text-muted-foreground hover:bg-background hover:text-foreground"
            )}
          >
            <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: curso.color }} />
            {curso.nombre}
          </Link>
        ))}
      </div>

      {/* Footer System Version */}
      <div className="mt-6 text-center text-[10px] text-muted-foreground/50 pb-2">
        EduPanel {CURRENT_VERSION}
      </div>
    </aside>
  )
}

