// Versión anterior del perfil. Se mantiene como respaldo bajo /perfil-v1.
// La nueva /perfil usa PerfilV2Shell.
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { MainLayout } from "@/components/edu-panel"
import { PerfilContent } from "@/components/edu-panel/perfil/perfil-content"

export default function PerfilV1Page() {
  return (
    <MainLayout>
      <LegacyBanner href="/perfil" />
      <PerfilContent />
    </MainLayout>
  )
}

function LegacyBanner({ href }: { href: string }) {
  return (
    <div className="mx-auto mb-4 flex max-w-6xl flex-wrap items-center justify-between gap-3 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-2.5">
      <span className="text-[12.5px] font-semibold text-amber-800">
        📜 Estás viendo la <strong>versión anterior</strong> de Mi Perfil. Tus datos siguen sincronizados.
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
