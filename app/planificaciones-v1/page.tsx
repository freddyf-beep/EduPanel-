// Versión anterior de Planificaciones. Se mantiene como respaldo bajo /planificaciones-v1.
// La nueva /planificaciones usa PlanificacionesV2Shell.
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { MainLayout } from "@/components/edu-panel"
import { PlanificacionesShell } from "@/components/edu-panel/planificaciones/planificaciones-shell"
import { Suspense } from "react"
import { Loader2 } from "lucide-react"

export default function PlanificacionesV1Page() {
  return (
    <MainLayout>
      <LegacyBanner href="/planificaciones" />
      <Suspense fallback={<div className="p-10"><Loader2 className="animate-spin text-muted-foreground w-8 h-8" /></div>}>
        <PlanificacionesShell />
      </Suspense>
    </MainLayout>
  )
}

function LegacyBanner({ href }: { href: string }) {
  return (
    <div className="mx-auto mb-4 flex max-w-[1320px] flex-wrap items-center justify-between gap-3 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-2.5">
      <span className="text-[12.5px] font-semibold text-amber-800">
        📜 Estás viendo la <strong>versión anterior</strong> de Mis Planificaciones. Tus datos siguen sincronizados.
      </span>
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 rounded-[8px] bg-primary px-3 py-1.5 text-[11.5px] font-bold text-white hover:opacity-90"
      >
        Ir a la versión actual <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  )
}
