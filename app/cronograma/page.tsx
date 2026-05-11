import { MainLayout } from "@/components/edu-panel"
import { CronogramaV2Shell } from "@/components/edu-panel/cronograma/cronograma-v2-shell"
import { Suspense } from "react"
import { Loader2 } from "lucide-react"

export default function CronogramaPage() {
  return (
    <MainLayout>
      <Suspense fallback={<div className="p-10 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
        <CronogramaV2Shell />
      </Suspense>
    </MainLayout>
  )
}
