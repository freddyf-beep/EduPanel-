import { Metadata } from "next"
import { ConsumoIAView } from "@/components/edu-panel/admin/consumo-ia/consumo-ia-view"

export const metadata: Metadata = {
  title: "Consumo IA | Admin EduPanel",
  description: "Monitoreo y administración del consumo de tokens de IA",
}

export default function ConsumoIAPage() {
  return <ConsumoIAView />
}
