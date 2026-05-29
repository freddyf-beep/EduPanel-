"use client"

import { useEffect, useState } from "react"
import { useAdminGuard } from "@/hooks/use-admin-guard"
import { FeatureFlag, getFeatureFlags, updateFeatureFlag } from "@/lib/feature-flags"
import { Loader2, Sparkles, AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react"

export default function AdminFeaturesPage() {
  const { isReady, isAdmin } = useAdminGuard()
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    if (isReady && isAdmin) {
      loadFlags()
    }
  }, [isReady, isAdmin])

  const loadFlags = async () => {
    setLoading(true)
    try {
      const data = await getFeatureFlags()
      const sortedFlags = Object.values(data).sort((a, b) => {
        if (a.group !== b.group) return a.group - b.group
        return a.name.localeCompare(b.name)
      })
      setFlags(sortedFlags)
    } catch (error) {
      console.error("Error loading flags", error)
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = async (flag: FeatureFlag) => {
    setSaving(flag.id)
    try {
      const newValue = !flag.active
      await updateFeatureFlag(flag.id, newValue)
      setFlags(prev => prev.map(f => f.id === flag.id ? { ...f, active: newValue } : f))
    } catch (error) {
      console.error("Failed to toggle flag", error)
    } finally {
      setSaving(null)
    }
  }

  if (!isReady) return <div className="p-8 text-muted-foreground text-sm">Cargando...</div>
  if (!isAdmin) return null

  const group1 = flags.filter(f => f.group === 1)
  const group2 = flags.filter(f => f.group === 2)
  const group3 = flags.filter(f => f.group === 3)

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold flex items-center gap-3 mb-2">
          <Sparkles className="w-8 h-8 text-indigo-500" />
          Vitrina de Funciones IA (Feature Flags)
        </h1>
        <p className="text-muted-foreground">
          Panel maestro para activar o desactivar módulos experimentales y premium en EduPanel.
        </p>
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-3">Cargando configuraciones...</p>
        </div>
      ) : (
        <div className="space-y-8">
          
          <FeatureGroup 
            title="Grupo 1: Operaciones e Infraestructura (Costo $0)" 
            description="Funciones que corren en la capa gratuita de GCP y Firebase."
            flags={group1} 
            saving={saving}
            onToggle={handleToggle}
            accentClass="border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20"
          />

          <FeatureGroup 
            title="Grupo 2: Core Pedagógico IA (Costo Ultra-Bajo)" 
            description="Funciones impulsadas por Gemini API y BigQuery. Consumo seguro por centavos."
            flags={group2} 
            saving={saving}
            onToggle={handleToggle}
            accentClass="border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20"
          />

          <FeatureGroup 
            title="Grupo 3: Premium Durmiente (Costo Alto)" 
            description="ATENCIÓN: Requieren infraestructura 24/7 (Agent Builder / Vector Search). Mantener apagadas si no hay presupuesto."
            flags={group3} 
            saving={saving}
            onToggle={handleToggle}
            accentClass="border-red-500/30 bg-red-50/50 dark:bg-red-950/20"
            isPremium
          />

        </div>
      )}
    </div>
  )
}

function FeatureGroup({ title, description, flags, saving, onToggle, accentClass, isPremium = false }: any) {
  if (flags.length === 0) return null

  return (
    <div className={`rounded-xl border ${accentClass} overflow-hidden shadow-sm`}>
      <div className="px-6 py-4 border-b border-black/5 dark:border-white/5 flex items-start gap-3">
        {isPremium ? <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" /> : <ShieldCheck className="w-5 h-5 text-emerald-600 mt-0.5" />}
        <div>
          <h2 className="font-bold text-lg">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="divide-y divide-border/50 bg-card">
        {flags.map((flag: FeatureFlag) => (
          <div key={flag.id} className="p-6 flex items-center justify-between gap-4 hover:bg-muted/30 transition-colors">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-base">{flag.name}</h3>
                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                  flag.tier === 'free' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400' :
                  flag.tier === 'low-cost' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400' :
                  'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
                }`}>
                  {flag.tier}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{flag.description}</p>
            </div>
            
            <button
              onClick={() => onToggle(flag)}
              disabled={saving === flag.id}
              className={`relative flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${
                flag.active 
                  ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm" 
                  : "bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {saving === flag.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : flag.active ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-current opacity-50" />
              )}
              {flag.active ? "Activado" : "Apagado"}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
