import { Suspense } from "react"
import { MainLayout } from "@/components/edu-panel"
import { VerUnidadV3Clases } from "@/components/edu-panel/ver-unidad-v3/ver-unidad-v3-clases"

export default function VerUnidadClasesPage() {
  return (
    <MainLayout>
      <Suspense fallback={<VerUnidadFallback label="Cargando clases..." />}>
        <VerUnidadV3Clases />
      </Suspense>
    </MainLayout>
  )
}

function VerUnidadFallback({ label }: { label: string }) {
  return (
    <div className="flex min-h-[320px] items-center justify-center text-sm font-medium text-muted-foreground">
      {label}
    </div>
  )
}
