import { MainLayout } from "@/components/edu-panel"
import { PerfilShell } from "@/components/edu-panel/perfil/perfil-shell"
import { Suspense } from "react"
import { Loader2 } from "lucide-react"

export default function PerfilPage() {
  return (
    <MainLayout>
      <Suspense fallback={<div className="p-10"><Loader2 className="animate-spin text-muted-foreground w-8 h-8" /></div>}>
        <PerfilShell />
      </Suspense>
    </MainLayout>
  )
}
