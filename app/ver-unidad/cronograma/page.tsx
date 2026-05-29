import { MainLayout } from "@/components/edu-panel"
import { VerUnidadV2Content } from "@/components/edu-panel/ver-unidad/ver-unidad-v2-content"

export default function VerUnidadCronogramaPage() {
  return (
    <MainLayout>
      <VerUnidadV2Content initialTab="cronograma" />
    </MainLayout>
  )
}
