'use client'

import { useEffect } from 'react'
import { useToast } from '@/hooks/use-toast'

// Cambia esta versión para forzar la notificación en los clientes
const CURRENT_VERSION = 'v1.0.0'

export function VersionNotifier() {
  const { toast } = useToast()

  useEffect(() => {
    // Retraso para asegurar que la página haya cargado y el Toaster esté montado
    const timer = setTimeout(() => {
      const storedVersion = localStorage.getItem('edupanel-version')
      
      if (storedVersion !== CURRENT_VERSION) {
        toast({
          title: "🚀 ¡Nueva Versión Disponible!",
          description: `EduPanel ha sido actualizado a la versión ${CURRENT_VERSION}. Explora las nuevas mejoras y optimizaciones para la gestión de tus clases.`,
          duration: 8000,
        })
        localStorage.setItem('edupanel-version', CURRENT_VERSION)
      }
    }, 2000)

    return () => clearTimeout(timer)
  }, [toast])

  return null
}
