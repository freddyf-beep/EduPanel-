import { Suspense } from "react"
import { MainLayout } from "@/components/edu-panel"
import { ParvulariaRouteGuard } from "@/components/edu-panel/parvularia/parvularia-route-guard"
import { VerUnidadV3Clases } from "@/components/edu-panel/ver-unidad-v3/ver-unidad-v3-clases"

export default function VerUnidadClasesPage() {
  return (
    <MainLayout>
      <Suspense fallback={<VerUnidadFallback label="Cargando clases..." />}>
        <ParvulariaRouteGuard label="Revisando nivel curricular...">
          <VerUnidadV3Clases />
        </ParvulariaRouteGuard>
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
