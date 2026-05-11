import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import { MainLayout } from "@/components/edu-panel"
import { ModulosV2Shell } from "@/components/edu-panel/modulos/modulos-v2-shell"

export default function ModulosV2Page() {
  return (
    <MainLayout>
      <Suspense
        fallback={
          <div className="p-10 grid place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <ModulosV2Shell />
      </Suspense>
    </MainLayout>
  )
}
