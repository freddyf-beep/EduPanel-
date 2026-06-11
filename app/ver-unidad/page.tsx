import { Suspense } from "react"
import { MainLayout } from "@/components/edu-panel"
import { VerUnidadV3Dashboard } from "@/components/edu-panel/ver-unidad-v3/ver-unidad-v3-dashboard"

export default function VerUnidadPage() {
  return (
    <MainLayout>
      <Suspense fallback={<VerUnidadFallback label="Cargando unidad..." />}>
        <VerUnidadV3Dashboard />
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
