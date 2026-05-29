import { VerUnidadV2Content } from "@/components/edu-panel/ver-unidad/ver-unidad-v2-content"
import { MainLayout } from "@/components/edu-panel"

export default function VerUnidadPage() {
  return (
    <MainLayout>
      <VerUnidadV2Content initialTab="unidad" />
    </MainLayout>
  )
}
