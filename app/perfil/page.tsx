import { MainLayout } from "@/components/edu-panel"
import { PerfilV2Shell } from "@/components/edu-panel/perfil/perfil-v2-shell"
import { Suspense } from "react"
import { Loader2 } from "lucide-react"

export default function PerfilPage() {
  return (
    <MainLayout>
      <Suspense fallback={<div className="p-10"><Loader2 className="animate-spin text-muted-foreground w-8 h-8" /></div>}>
        <PerfilV2Shell />
      </Suspense>
    </MainLayout>
  )
}
