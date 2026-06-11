import { Suspense } from "react"
import { MainLayout } from "@/components/edu-panel"
import { VerUnidadV3Cronograma } from "@/components/edu-panel/ver-unidad-v3/ver-unidad-v3-cronograma"

export default function VerUnidadCronogramaPage() {
  return (
    <MainLayout>
      <Suspense fallback={<VerUnidadFallback label="Cargando cronograma..." />}>
        <VerUnidadV3Cronograma />
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
