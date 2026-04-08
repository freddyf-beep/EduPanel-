import { Header } from "./header"
import { Sidebar } from "./sidebar"
import { ProtectedRoute } from "@/components/auth/protected-route"

interface MainLayoutProps {
  children: React.ReactNode
  noPadding?: boolean
}

export function MainLayout({ children, noPadding }: MainLayoutProps) {
  return (
    <ProtectedRoute>
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className={`min-w-0 flex-1 overflow-hidden ${noPadding ? "" : "p-6 md:p-8"}`}>
            {children}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  )
}
