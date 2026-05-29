"use client"

import { useState } from "react"
import { DatabaseBackup, ExternalLink, Loader2 } from "lucide-react"
import { useAuth } from "@/components/auth/auth-context"
import { cn } from "@/lib/utils"
import {
  getGoogleDriveToken,
  getGoogleDriveErrorMessage,
  isGoogleDriveConnected,
  respaldarCursoVivoJsonDrive,
} from "@/lib/google-drive"

interface DriveBackupCursoCompletoProps {
  asignatura: string
  curso: string
  /** Función que recopila todos los datos del curso para el backup */
  buildData: () => unknown | Promise<unknown>
  className?: string
  compact?: boolean
}

type Status = "idle" | "working" | "success" | "error"

export function DriveBackupCursoCompleto({
  asignatura,
  curso,
  buildData,
  className,
  compact = false,
}: DriveBackupCursoCompletoProps) {
  const { signInWithGoogleDrive } = useAuth()
  const [status, setStatus] = useState<Status>("idle")
  const [message, setMessage] = useState("")
  const [fileUrl, setFileUrl] = useState("")

  const handleBackup = async () => {
    setStatus("working")
    setMessage("")
    setFileUrl("")
    try {
      let token = getGoogleDriveToken()
      if (!token || !isGoogleDriveConnected()) {
        await signInWithGoogleDrive()
        token = getGoogleDriveToken()
      }
      if (!token) throw new Error("No se recibio autorizacion de Google Drive.")

      const data = await buildData()
      const result = await respaldarCursoVivoJsonDrive(token, {
        context: { tipo: "planificaciones", asignatura, curso },
        data,
      })

      setFileUrl(result.file.webViewLink || "")
      setStatus("success")
      setMessage("Respaldo vivo actualizado en Exportaciones/")
    } catch (error) {
      setStatus("error")
      setMessage(getGoogleDriveErrorMessage(error))
    }
  }

  const isWorking = status === "working"

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <button
        type="button"
        onClick={handleBackup}
        disabled={isWorking}
        className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 py-2 text-[12px] font-bold text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
        title="Actualizar respaldo vivo del curso en Drive (Exportaciones/)"
      >
        {isWorking
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <DatabaseBackup className="h-4 w-4" />
        }
        {compact ? "Respaldo" : "Respaldo vivo"}
      </button>

      {fileUrl && status === "success" && (
        <a
          href={fileUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 py-2 text-[12px] font-bold text-muted-foreground transition-colors hover:text-primary"
        >
          <ExternalLink className="h-4 w-4" />
          Ver archivo
        </a>
      )}

      {message && (
        <span
          className={cn(
            "basis-full text-[11px] font-semibold",
            status === "error" ? "text-red-600" : "text-green-700",
          )}
        >
          {message}
        </span>
      )}
    </div>
  )
}
