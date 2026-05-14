"use client"

import { ProtectedRoute } from "@/components/auth/protected-route"
import { PerfilV2Shell } from "@/components/edu-panel/perfil/perfil-v2-shell"

export default function OnboardingPage() {
  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-background text-foreground flex flex-col p-4 md:p-6 lg:p-8">
        <PerfilV2Shell isOnboardingMode={true} />
      </main>
    </ProtectedRoute>
  )
}
