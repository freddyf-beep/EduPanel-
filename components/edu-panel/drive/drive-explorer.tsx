"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ExternalLink,
  File,
  FileArchive,
  FileImage,
  FileText,
  Folder,
  FolderOpen,
  HardDrive,
  Loader2,
  Pin,
  RefreshCw,
  Search,
  ShieldCheck,
  Unplug,
} from "lucide-react"
import { useAuth } from "@/components/auth/auth-context"
import { cn } from "@/lib/utils"
import {
  buildDrivePreviewUrl,
  desconectarGoogleDrive,
  getGoogleDriveToken,
  getPinnedDriveFolder,
  isDriveFolder,
  isGoogleDriveConnected,
  listarDrivePersonal,
  buscarDrivePersonal,
  setPinnedDriveFolder,
  type DriveItem,
  type DriveResourceContext,
  type DriveFolderPin,
} from "@/lib/google-drive"

interface Breadcrumb {
  id: string
  name: string
}

interface DriveExplorerProps {
  context?: DriveResourceContext
  title?: string
  description?: string
  className?: string
  compact?: boolean
  onSelectFile?: (item: DriveItem) => void | Promise<void>
  selectLabel?: string
}

function formatBytes(value?: string) {
  const n = Number(value || 0)
  if (!Number.isFinite(n) || n <= 0) return ""
  if (n < 1024) return `${n} B`
  const kb = n / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

function formatDate(value?: string) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", year: "numeric" }).format(date)
}

function iconFor(item: DriveItem) {
  if (isDriveFolder(item)) return Folder
  if (item.mimeType.includes("image/")) return FileImage
  if (item.mimeType.includes("pdf") || item.mimeType.includes("document") || item.mimeType.includes("word")) return FileText
  if (item.mimeType.includes("presentation") || item.mimeType.includes("spreadsheet")) return FileText
  if (item.mimeType.includes("zip") || item.mimeType.includes("compressed")) return FileArchive
  return File
}

function itemTypeLabel(item: DriveItem) {
  if (isDriveFolder(item)) return "Carpeta"
  if (item.mimeType === "application/vnd.google-apps.document") return "Google Docs"
  if (item.mimeType === "application/vnd.google-apps.spreadsheet") return "Google Sheets"
  if (item.mimeType === "application/vnd.google-apps.presentation") return "Google Slides"
  if (item.mimeType.includes("pdf")) return "PDF"
  if (item.mimeType.includes("word")) return "Word"
  if (item.mimeType.includes("presentation")) return "Presentacion"
  if (item.mimeType.includes("image/")) return "Imagen"
  return "Archivo"
}

export function DriveExplorer({
  context,
  title = "Google Drive personal",
  description = "Explora tus carpetas sin salir de EduPanel.",
  className,
  compact,
  onSelectFile,
  selectLabel = "Adjuntar",
}: DriveExplorerProps) {
  const { signInWithGoogleDrive } = useAuth()
  const [connected, setConnected] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [items, setItems] = useState<DriveItem[]>([])
  const [selected, setSelected] = useState<DriveItem | null>(null)
  const [folderId, setFolderId] = useState("root")
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: "root", name: "Mi unidad" }])
  const [query, setQuery] = useState("")
  const [pinnedFolder, setPinnedFolder] = useState<DriveFolderPin | null>(null)

  const currentFolder = breadcrumbs[breadcrumbs.length - 1]
  const searching = query.trim().length >= 2

  useEffect(() => {
    setConnected(isGoogleDriveConnected())
    setToken(getGoogleDriveToken())
    const pinned = getPinnedDriveFolder(context)
    setPinnedFolder(pinned)
    if (pinned) {
      setFolderId(pinned.folderId)
      setBreadcrumbs([{ id: "root", name: "Mi unidad" }, { id: pinned.folderId, name: pinned.name }])
    }
  }, [context?.tipo, context?.asignatura, context?.curso, context?.unidadId])

  const loadItems = useCallback(async () => {
    if (!token) {
      setItems([])
      return
    }
    setLoading(true)
    setError("")
    try {
      const res = searching
        ? await buscarDrivePersonal(token, query.trim(), folderId)
        : await listarDrivePersonal(token, folderId)
      setItems(res.files || [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo cargar Drive."
      if (message.includes("SERVICE_DISABLED") || message.includes("accessNotConfigured") || message.includes("drive.googleapis.com")) {
        setError("La API de Google Drive esta desactivada en Google Cloud. Habilita Google Drive API en el proyecto Firebase/Google Cloud y vuelve a intentar en unos minutos.")
      } else if (message.includes("403")) {
        setError("Google no autorizo el acceso a Drive. Revisa que la API de Drive este habilitada y que tu cuenta tenga permiso.")
      } else {
        setError(message.includes("401") ? "La sesion de Drive expiro. Reconecta tu cuenta." : "No se pudo cargar tu Drive personal.")
      }
      if (message.includes("401")) {
        desconectarGoogleDrive()
        setConnected(false)
        setToken(null)
      }
    } finally {
      setLoading(false)
    }
  }, [folderId, query, searching, token])

  useEffect(() => {
    if (!connected || !token) return
    const timer = setTimeout(() => void loadItems(), searching ? 350 : 0)
    return () => clearTimeout(timer)
  }, [connected, token, loadItems, searching])

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const folderDiff = Number(isDriveFolder(b)) - Number(isDriveFolder(a))
      if (folderDiff !== 0) return folderDiff
      return a.name.localeCompare(b.name, "es")
    })
  }, [items])

  const handleConnect = async () => {
    setConnecting(true)
    setError("")
    try {
      await signInWithGoogleDrive()
      const nextToken = getGoogleDriveToken()
      setToken(nextToken)
      setConnected(!!nextToken)
    } catch (err) {
      setError("No se pudo conectar Google Drive.")
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = () => {
    desconectarGoogleDrive()
    setConnected(false)
    setToken(null)
    setItems([])
    setSelected(null)
  }

  const openFolder = (item: DriveItem) => {
    setSelected(null)
    setQuery("")
    setFolderId(item.id)
    setBreadcrumbs(prev => [...prev, { id: item.id, name: item.name }])
  }

  const goToBreadcrumb = (index: number) => {
    const next = breadcrumbs.slice(0, index + 1)
    const target = next[next.length - 1]
    setSelected(null)
    setQuery("")
    setFolderId(target.id)
    setBreadcrumbs(next)
  }

  const goUp = () => {
    if (breadcrumbs.length <= 1) return
    goToBreadcrumb(breadcrumbs.length - 2)
  }

  const pinCurrentFolder = () => {
    if (folderId === "root") return
    const pin = { folderId, name: currentFolder.name, savedAt: Date.now() }
    setPinnedDriveFolder(context, pin)
    setPinnedFolder(pin)
  }

  const clearPinnedFolder = () => {
    setPinnedDriveFolder(context, null)
    setPinnedFolder(null)
  }

  const chooseSelectedFile = async () => {
    if (!selected || isDriveFolder(selected) || !onSelectFile) return
    await onSelectFile(selected)
  }

  const previewUrl = selected ? buildDrivePreviewUrl(selected) : null

  if (!connected || !token) {
    return (
      <div className={cn("flex h-full flex-col rounded-[14px] border border-border bg-card p-5", className)}>
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <HardDrive className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-extrabold text-foreground">{title}</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="mt-5 rounded-[12px] border border-border bg-background p-4">
          <div className="mb-3 flex items-start gap-2 text-[12px] text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
            <p>EduPanel usa tu autorizacion de navegador para listar Drive y, si lo pides, crear carpetas o subir respaldos personales.</p>
          </div>
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            className="inline-flex items-center gap-2 rounded-[10px] bg-slate-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-slate-800 disabled:opacity-70"
          >
            {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <HardDrive className="h-3.5 w-3.5" />}
            Conectar Google Drive
          </button>
          {error && (
            <p className="mt-3 flex items-center gap-1.5 text-[11.5px] font-semibold text-red-600">
              <AlertCircle className="h-3.5 w-3.5" /> {error}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={cn("flex h-full min-h-[560px] flex-col overflow-hidden rounded-[14px] border border-border bg-card", className)}>
      <div className="border-b border-border bg-background px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-primary" />
              <h2 className="truncate text-[14px] font-extrabold text-foreground">{title}</h2>
            </div>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">{description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pinnedFolder && (
              <button
                type="button"
                onClick={() => {
                  setFolderId(pinnedFolder.folderId)
                  setBreadcrumbs([{ id: "root", name: "Mi unidad" }, { id: pinnedFolder.folderId, name: pinnedFolder.name }])
                  setQuery("")
                  setSelected(null)
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-[11px] font-bold text-primary"
                title="Ir a carpeta fijada"
              >
                <Pin className="h-3.5 w-3.5" /> {pinnedFolder.name}
              </button>
            )}
            <button
              type="button"
              onClick={() => void loadItems()}
              className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-card hover:text-primary"
              title="Actualizar"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-red-50 hover:text-red-600"
              title="Desconectar Drive"
            >
              <Unplug className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={goUp}
            disabled={breadcrumbs.length <= 1}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] font-bold text-muted-foreground hover:bg-card disabled:opacity-40"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Subir
          </button>
          <div className="flex min-w-[200px] flex-1 items-center gap-1 overflow-x-auto rounded-lg border border-border bg-card px-2 py-1.5">
            {breadcrumbs.map((crumb, index) => (
              <button
                key={`${crumb.id}-${index}`}
                type="button"
                onClick={() => goToBreadcrumb(index)}
                className={cn(
                  "max-w-[180px] truncate rounded-md px-2 py-1 text-[11.5px] font-bold",
                  index === breadcrumbs.length - 1 ? "bg-pink-light text-primary" : "text-muted-foreground hover:bg-background"
                )}
              >
                {crumb.name}
              </button>
            ))}
          </div>
          <div className="relative min-w-[220px] flex-1 sm:flex-none">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Buscar en esta carpeta..."
              className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-3 text-[12px] font-semibold outline-none focus:border-primary"
            />
          </div>
          {context && folderId !== "root" && (
            pinnedFolder?.folderId === folderId ? (
              <button
                type="button"
                onClick={clearPinnedFolder}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary bg-primary/10 px-3 text-[12px] font-bold text-primary"
              >
                <Check className="h-3.5 w-3.5" /> Fijada
              </button>
            ) : (
              <button
                type="button"
                onClick={pinCurrentFolder}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] font-bold text-muted-foreground hover:bg-card hover:text-primary"
              >
                <Pin className="h-3.5 w-3.5" /> Fijar carpeta
              </button>
            )
          )}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      <div className={cn("grid min-h-0 flex-1", compact ? "grid-cols-1" : "lg:grid-cols-[minmax(0,1fr)_minmax(320px,42%)]")}>
        <div className="min-h-0 overflow-y-auto p-3">
          {loading ? (
            <div className="flex h-48 items-center justify-center gap-2 text-[13px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando Drive...
            </div>
          ) : sortedItems.length === 0 ? (
            <div className="grid h-48 place-items-center rounded-[12px] border border-dashed border-border bg-background text-center">
              <div>
                <FolderOpen className="mx-auto mb-2 h-7 w-7 text-muted-foreground/50" />
                <p className="text-[13px] font-bold text-foreground">{searching ? "Sin resultados" : "Carpeta vacia"}</p>
                <p className="text-[11.5px] text-muted-foreground">{searching ? "Prueba con otro nombre." : "No hay archivos visibles aqui."}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {sortedItems.map(item => {
                const Icon = iconFor(item)
                const folder = isDriveFolder(item)
                const active = selected?.id === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => folder ? openFolder(item) : setSelected(item)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[10px] border px-3 py-2 text-left transition-colors",
                      active ? "border-primary bg-pink-light/50" : "border-transparent bg-background hover:border-border hover:bg-card"
                    )}
                  >
                    <div className={cn("grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg", folder ? "bg-amber-50 text-amber-600" : "bg-muted text-muted-foreground")}>
                      {item.iconLink ? (
                        <img src={item.iconLink} alt="" className="h-4 w-4" />
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-bold text-foreground">{item.name}</p>
                      <p className="truncate text-[10.5px] text-muted-foreground">
                        {itemTypeLabel(item)}
                        {formatBytes(item.size) ? ` · ${formatBytes(item.size)}` : ""}
                        {formatDate(item.modifiedTime) ? ` · ${formatDate(item.modifiedTime)}` : ""}
                      </p>
                    </div>
                    {folder ? <FolderOpen className="h-4 w-4 flex-shrink-0 text-muted-foreground" /> : <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {!compact && (
          <div className="hidden min-h-0 border-l border-border bg-background lg:flex lg:flex-col">
            {selected ? (
              <>
                <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-extrabold text-foreground">{selected.name}</p>
                    <p className="text-[11px] text-muted-foreground">{itemTypeLabel(selected)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {onSelectFile && (
                      <button
                        type="button"
                        onClick={() => void chooseSelectedFile()}
                        className="inline-flex items-center gap-1 rounded-lg border border-primary bg-primary/10 px-2.5 py-1.5 text-[11px] font-bold text-primary hover:bg-pink-light"
                      >
                        <Check className="h-3.5 w-3.5" /> {selectLabel}
                      </button>
                    )}
                    {selected.webViewLink && (
                      <a
                        href={selected.webViewLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-card hover:text-primary"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Abrir
                      </a>
                    )}
                  </div>
                </div>
                {previewUrl ? (
                  <iframe
                    title={`Vista previa de ${selected.name}`}
                    src={previewUrl}
                    className="min-h-0 flex-1 border-0 bg-white"
                    allow="autoplay"
                  />
                ) : (
                  <div className="grid flex-1 place-items-center p-6 text-center">
                    <div>
                      <File className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                      <p className="text-[13px] font-bold text-foreground">Sin preview interno</p>
                      <p className="mt-1 text-[12px] text-muted-foreground">Google no entrega una vista previa incrustada para este elemento.</p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="grid flex-1 place-items-center p-6 text-center">
                <div>
                  <HardDrive className="mx-auto mb-2 h-9 w-9 text-muted-foreground/40" />
                  <p className="text-[13px] font-bold text-foreground">Selecciona un archivo</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">La vista previa aparecera aqui sin salir de EduPanel.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
