import { MainLayout } from "@/components/edu-panel"
import { VerUnidadContent } from "@/components/edu-panel/ver-unidad/ver-unidad-content"
import { Breadcrumbs } from "@/components/edu-panel/shared/breadcrumbs"

export default function VerUnidadClasesPage() {
  return (
    <MainLayout>
      <div className="mx-auto max-w-[1500px] px-3 pt-3 sm:px-5">
        <Breadcrumbs items={[{ label: "Planificaciones" }, { label: "Clases" }]} />
      </div>
      <VerUnidadContent initialTab="clases" />
    </MainLayout>
  )
}
