"use client"

import { useState } from "react"
import { Header } from "./header"
import { AdminSidebar } from "./admin-sidebar"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { CommandPalette } from "@/components/global/command-palette"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

interface AdminLayoutProps {
  children: React.ReactNode
  noPadding?: boolean
}

export function AdminLayout({ children, noPadding }: AdminLayoutProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen flex-col bg-background">
        <Header onOpenMenu={() => setMobileSidebarOpen(true)} />
        <div className="flex flex-1 lg:min-h-0 lg:overflow-hidden">
          <AdminSidebar />
          <main className={`min-w-0 flex-1 overflow-x-hidden overflow-y-auto ${noPadding ? "" : "px-4 py-4 sm:px-5 sm:py-5 lg:p-8"}`}>
            {children}
          </main>
        </div>
        <CommandPalette />

        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent side="left" className="w-[88vw] max-w-[320px] p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Navegación de Administrador</SheetTitle>
              <SheetDescription>Accesos del modo administrador.</SheetDescription>
            </SheetHeader>
            <AdminSidebar mobile onNavigate={() => setMobileSidebarOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </ProtectedRoute>
  )
}
