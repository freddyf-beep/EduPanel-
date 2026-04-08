import { VerUnidadContent } from "@/components/edu-panel/ver-unidad/ver-unidad-content"
import { Header } from "@/components/edu-panel/header"
import { HelpButton } from "@/components/edu-panel/help-button"

export default function VerUnidadPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1 px-10 py-8">
        <VerUnidadContent />
      </main>
      <HelpButton />
    </div>
  )
}
