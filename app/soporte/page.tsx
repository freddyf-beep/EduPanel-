import { MainLayout } from "@/components/edu-panel"
import { SoporteV2Shell } from "@/components/edu-panel/soporte/soporte-v2-shell"
import { Suspense } from "react"
import { Loader2 } from "lucide-react"

export default function SoportePage() {
  return (
    <MainLayout>
      <Suspense fallback={<div className="p-10 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
        <SoporteV2Shell />
      </Suspense>
    </MainLayout>
  )
}
