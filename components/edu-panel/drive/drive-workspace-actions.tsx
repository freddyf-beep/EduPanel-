"use client"

import { useState } from "react"
import { ExternalLink, FolderSync, HardDrive, Loader2, UploadCloud } from "lucide-react"
import { useAuth } from "@/components/auth/auth-context"
import { cn } from "@/lib/utils"
import {
  buildDriveFolderUrl,
  ensureEduPanelDriveRoot,
  ensureEduPanelWorkspaceForContext,
  getCachedEduPanelDriveWorkspace,
  getGoogleDriveErrorMessage,
  getGoogleDriveToken,
  isGoogleDriveConnected,
  respaldarCursoVivoJsonDrive,
  type DriveResourceContext,
} from "@/lib/google-drive"

interface DriveWorkspaceActionsProps {
  context?: DriveResourceContext
  buildBackupData?: () => unknown | Promise<unknown>
  backupLabel?: string
  openLabel?: string
  setupLabel?: string
  className?: string
  buttonClassName?: string
  disabled?: boolean
  compact?: boolean
}

type Status = "idle" | "working" | "success" | "error"

export function DriveWorkspaceActions({
  context,
  buildBackupData,
  backupLabel = "Respaldar en Drive",
  openLabel = "Abrir carpeta",
  setupLabel = "Crear / reparar Edu-Panel",
  className,
  buttonClassName,
  disabled,
  compact,
}: DriveWorkspaceActionsProps) {
  const { signInWithGoogleDrive } = useAuth()
  const [status, setStatus] = useState<Status>("idle")
  const [message, setMessage] = useState("")
  const [folderUrl, setFolderUrl] = useState(() => {
    if (context) return ""
    const cached = getCachedEduPanelDriveWorkspace()
    return cached?.rootFolderUrl || (cached?.rootFolderId ? buildDriveFolderUrl(cached.rootFolderId) : "")
  })
  const [fileUrl, setFileUrl] = useState("")

  const ensureToken = async () => {
    let token = getGoogleDriveToken()
    if (!token || !isGoogleDriveConnected()) {
      await signInWithGoogleDrive()
      token = getGoogleDriveToken()
    }
    if (!token) throw new Error("No se recibio autorizacion de Google Drive.")
    return token
  }

  const rememberFolder = (folderId: string, webViewLink?: string) => {
    setFolderUrl(webViewLink || buildDriveFolderUrl(folderId))
  }

  const handleSetup = async () => {
    setStatus("working")
    setMessage("")
    setFileUrl("")
    try {
      const token = await ensureToken()
      const workspace = context
        ? await ensureEduPanelWorkspaceForContext(token, context)
        : await ensureEduPanelDriveRoot(token)
      rememberFolder(workspace.focusFolder.id, workspace.focusFolder.webViewLink)
      setStatus("success")
      setMessage(context ? "Carpeta Edu-Panel lista para este contexto." : "Carpeta Edu-Panel lista en tu Drive.")
    } catch (error) {
      setStatus("error")
      setMessage(getGoogleDriveErrorMessage(error))
    }
  }

  const handleOpen = async () => {
    if (folderUrl) {
      window.open(folderUrl, "_blank", "noopener,noreferrer")
      return
    }
    await handleSetup()
  }

  const handleBackup = async () => {
    if (!buildBackupData) return
    setStatus("working")
    setMessage("")
    setFileUrl("")
    try {
      const token = await ensureToken()
      const data = await buildBackupData()
      const result = await respaldarCursoVivoJsonDrive(token, { context, data })
      rememberFolder(result.workspace.focusFolder.id, result.workspace.focusFolder.webViewLink)
      setFileUrl(result.file.webViewLink || "")
      setStatus("success")
      setMessage("Respaldo vivo actualizado en tu Google Drive.")
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
        onClick={handleSetup}
        disabled={disabled || isWorking}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 py-2 text-[12px] font-bold text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50",
          buttonClassName,
        )}
      >
        {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSync className="h-4 w-4" />}
        {compact ? "Carpeta" : setupLabel}
      </button>

      {buildBackupData && (
        <button
          type="button"
          onClick={handleBackup}
          disabled={disabled || isWorking}
          className="inline-flex items-center gap-1.5 rounded-[10px] border border-primary bg-card px-3 py-2 text-[12px] font-bold text-primary transition-colors hover:bg-pink-light disabled:opacity-50"
        >
          {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          {compact ? "Respaldar" : backupLabel}
        </button>
      )}

      {(folderUrl || status === "success") && (
        <button
          type="button"
          onClick={handleOpen}
          disabled={isWorking}
          className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 py-2 text-[12px] font-bold text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
        >
          <HardDrive className="h-4 w-4" />
          {openLabel}
        </button>
      )}

      {fileUrl && (
        <a
          href={fileUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 py-2 text-[12px] font-bold text-muted-foreground transition-colors hover:text-primary"
        >
          <ExternalLink className="h-4 w-4" />
          Ver respaldo
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
