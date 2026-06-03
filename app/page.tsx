import { MainLayout } from "@/components/edu-panel"
import { DashboardShell } from "@/components/edu-panel/dashboard/dashboard-shell"
import { Suspense } from "react"
import { Loader2 } from "lucide-react"

export default function DashboardPage() {
  return (
    <MainLayout>
      <Suspense fallback={<div className="p-10 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
        <DashboardShell />
      </Suspense>
    </MainLayout>
  )
}
