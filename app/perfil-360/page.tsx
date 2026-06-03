import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import { MainLayout } from "@/components/edu-panel"
import { Perfil360Shell } from "@/components/edu-panel/perfil-360/perfil-360-shell"

export default function Perfil360Page() {
  return (
    <MainLayout>
      <Suspense fallback={<div className="p-10 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
        <Perfil360Shell />
      </Suspense>
    </MainLayout>
  )
}
