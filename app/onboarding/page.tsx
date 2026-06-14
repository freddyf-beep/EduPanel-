"use client"

import { ProtectedRoute } from "@/components/auth/protected-route"
import { PerfilShell } from "@/components/edu-panel/perfil/perfil-shell"

export default function OnboardingPage() {
  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-background text-foreground flex flex-col p-4 md:p-6 lg:p-8">
        <PerfilShell isOnboardingMode={true} />
      </main>
    </ProtectedRoute>
  )
}
