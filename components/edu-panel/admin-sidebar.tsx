"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  Building2,
  KeyRound,
  Database,
  ArrowLeft,
  ShieldCheck,
  BookA,
  Sparkles,
  AlertTriangle,
  TrendingUp,
  Brain,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth/auth-context"
import { CURRENT_VERSION } from "./version"

const adminNavItems = [
  { href: "/admin",                    label: "Dashboard",        icon: LayoutDashboard },
  { href: "/admin/usuarios",           label: "Usuarios",         icon: Users },
  { href: "/admin/establecimientos",   label: "Establecimientos", icon: Building2 },
  { href: "/admin/curriculum",         label: "Currículum",       icon: BookA },
  { href: "/admin/invitaciones",       label: "Invitaciones",     icon: KeyRound },
  { href: "/admin/radar-desercion",    label: "Radar Deserción",  icon: AlertTriangle },
  { href: "/admin/predictor-cobertura",label: "Predic. Cobertura",icon: TrendingUp },
  { href: "/admin/sustituciones",      label: "Sustituciones",    icon: Users },
  { href: "/admin/features",           label: "Funciones IA",     icon: Sparkles },
  { href: "/admin/consumo-ia",         label: "Consumo IA",       icon: Brain },
  { href: "/admin/mantenimiento",      label: "Mantenimiento",    icon: Database },
]

interface AdminSidebarProps {
  mobile?: boolean;
  onNavigate?: () => void;
}

export function AdminSidebar({ mobile, onNavigate }: AdminSidebarProps) {
  const pathname = usePathname()
  const { user } = useAuth()

  const NavLink = ({ href, label, icon: Icon }: { href: string; label: string; icon: any }) => {
    const isActive = pathname === href || (href !== "/admin" && pathname.startsWith(href))
    return (
      <Link
        href={href}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13px] font-medium transition-colors",
          isActive
            ? "bg-slate-800 text-white font-semibold dark:bg-slate-800 dark:text-white"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Icon className={cn("h-[17px] w-[17px] flex-shrink-0", isActive ? "text-white" : "")} />
        {label}
      </Link>
    )
  }

  return (
    <aside className={cn(
      "flex flex-shrink-0 flex-col overflow-y-auto border-border bg-card px-3 py-5",
      mobile ? "h-full w-full" : "hidden lg:flex sticky top-[58px] h-[calc(100vh-58px)] w-[220px] border-r"
    )}>
      {/* Admin Header */}
      <div className="mb-4 flex flex-col items-center gap-2 border-b border-border px-3 pb-5 pt-2">
        <div className="grid h-[52px] w-[52px] place-items-center rounded-full bg-slate-900 text-slate-100 shadow-sm border-2 border-background">
          <ShieldCheck className="h-6 w-6" strokeWidth={2.5} />
        </div>
        <div className="text-center">
          <div className="text-[13px] font-bold">Modo Admin</div>
          <div className="text-[11px] text-muted-foreground flex items-center justify-center gap-1 mt-0.5 truncate max-w-[180px]">
            {user?.email || "Administrador"}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5">
        <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
          Gestión y Control
        </div>
        {adminNavItems.map(item => <NavLink key={item.href} {...item} />)}
      </nav>

      {/* Volver a App */}
      <div className="mt-auto pt-4 border-t border-border">
         <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-[17px] w-[17px] flex-shrink-0" />
          Volver a EduPanel
        </Link>
      </div>

      {/* Footer System Version */}
      <div className="mt-6 text-center text-[10px] text-muted-foreground/50 pb-2">
        Admin {CURRENT_VERSION}
      </div>
    </aside>
  )
}
