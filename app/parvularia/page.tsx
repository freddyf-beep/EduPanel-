import { Suspense } from "react"
import { MainLayout } from "@/components/edu-panel"
import { ParvulariaContent } from "@/components/edu-panel/parvularia/parvularia-content"

export default function ParvulariaPage() {
  return (
    <MainLayout>
      <Suspense fallback={<ParvulariaFallback />}>
        <ParvulariaContent />
      </Suspense>
    </MainLayout>
  )
}

function ParvulariaFallback() {
  return (
    <div className="flex min-h-[320px] items-center justify-center text-sm font-medium text-muted-foreground">
      Cargando experiencia parvularia...
    </div>
  )
}
