"use client"

export const GOOGLE_DRIVE_TOKEN_KEY = "edupanel_google_drive_token"
export const GOOGLE_DRIVE_CONNECTED_KEY = "edupanel_google_drive_connected"
export const GOOGLE_DRIVE_AUTOSAVE_KEY = "edupanel_google_drive_autosave"

export const GOOGLE_DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder"
export const GOOGLE_DRIVE_SHORTCUT_MIME = "application/vnd.google-apps.shortcut"
export const GOOGLE_DRIVE_DOC_MIME = "application/vnd.google-apps.document"
export const GOOGLE_DRIVE_PDF_MIME = "application/pdf"
export const GOOGLE_DRIVE_DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
export const EDU_PANEL_DRIVE_ROOT_NAME = "Edu-Panel"

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3"
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3"
const DRIVE_FIELDS = [
  "nextPageToken",
  "files(id,name,mimeType,iconLink,thumbnailLink,webViewLink,webContentLink,modifiedTime,size,parents,ownedByMe,shared,trashed,shortcutDetails(targetId,targetMimeType,targetResourceKey))",
].join(",")
const DRIVE_FILE_FIELDS = "id,name,mimeType,iconLink,thumbnailLink,webViewLink,webContentLink,modifiedTime,size,parents,ownedByMe,shared,trashed,shortcutDetails(targetId,targetMimeType,targetResourceKey)"

export interface DriveItem {
  id: string
  name: string
  mimeType: string
  iconLink?: string
  thumbnailLink?: string
  webViewLink?: string
  webContentLink?: string
  modifiedTime?: string
  size?: string
  parents?: string[]
  ownedByMe?: boolean
  shared?: boolean
  trashed?: boolean
  shortcutDetails?: {
    targetId?: string
    targetMimeType?: string
    targetResourceKey?: string
  }
}

export interface DriveListResponse {
  files: DriveItem[]
  nextPageToken?: string
}

export interface DriveFolderPin {
  folderId: string
  name: string
  savedAt: number
}

export interface DriveResourceContext {
  tipo?: "planificaciones" | "unidad" | "pruebas" | "guias" | "rubricas" | "listas" | "evaluaciones" | "materiales" | "tics"
  asignatura?: string
  curso?: string
  unidadId?: string
  unidadNombre?: string
}

export type EduPanelDriveFolderKey =
  | "root"
  | "year"
  | "asignatura"
  | "curso"
  | "unidad"
  | "unidadEvaluaciones"
  | "planificacion"
  | "clases"
  | "clase"
  | "classPlanificacion"
  | "classMateriales"
  | "classTics"
  | "materiales"
  | "tics"
  | "evaluaciones"
  | "pruebas"
  | "guias"
  | "rubricas"
  | "listas"
  | "exportaciones"

export interface EduPanelDriveWorkspace {
  year: number
  root: DriveItem
  yearFolder: DriveItem
  focusFolder: DriveItem
  folders: Partial<Record<EduPanelDriveFolderKey, DriveItem>>
}

export interface EduPanelDriveWorkspaceCache {
  year: number
  rootFolderId: string
  rootFolderUrl?: string
  yearFolderId: string
  yearFolderUrl?: string
  updatedAt: number
}

function storage() {
  if (typeof window === "undefined") return null
  return window
}

export function guardarGoogleDriveToken(token: string) {
  const win = storage()
  if (!win) return
  win.sessionStorage.setItem(GOOGLE_DRIVE_TOKEN_KEY, token)
  win.localStorage.setItem(GOOGLE_DRIVE_CONNECTED_KEY, "true")
  if (win.localStorage.getItem(GOOGLE_DRIVE_AUTOSAVE_KEY) === null) {
    win.localStorage.setItem(GOOGLE_DRIVE_AUTOSAVE_KEY, "true")
  }
}

export function getGoogleDriveToken(): string | null {
  const win = storage()
  return win?.sessionStorage.getItem(GOOGLE_DRIVE_TOKEN_KEY) || null
}

export function isGoogleDriveConnected(): boolean {
  const win = storage()
  return win?.localStorage.getItem(GOOGLE_DRIVE_CONNECTED_KEY) === "true"
}

export function isGoogleDriveAutosaveEnabled(): boolean {
  const win = storage()
  return win?.localStorage.getItem(GOOGLE_DRIVE_AUTOSAVE_KEY) === "true"
}

export function setGoogleDriveAutosave(enabled: boolean) {
  const win = storage()
  if (!win) return
  if (enabled) win.localStorage.setItem(GOOGLE_DRIVE_AUTOSAVE_KEY, "true")
  else win.localStorage.setItem(GOOGLE_DRIVE_AUTOSAVE_KEY, "false")
}

export function desconectarGoogleDrive() {
  const win = storage()
  if (!win) return
  win.sessionStorage.removeItem(GOOGLE_DRIVE_TOKEN_KEY)
  win.localStorage.removeItem(GOOGLE_DRIVE_CONNECTED_KEY)
  win.localStorage.setItem(GOOGLE_DRIVE_AUTOSAVE_KEY, "false")
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")
}

function buildDriveUrl(path: string, params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) return
    search.set(key, String(value))
  })
  return `${DRIVE_API_BASE}${path}?${search.toString()}`
}

async function googleDriveFetch<T>(accessToken: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {}),
    },
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`Google Drive ${res.status}: ${detail}`)
  }
  if (res.status === 204) return {} as T
  return res.json() as Promise<T>
}

function googleDriveErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "")
  if (message.includes("SERVICE_DISABLED") || message.includes("accessNotConfigured") || message.includes("drive.googleapis.com")) {
    return "La API de Google Drive esta desactivada en Google Cloud. Habilita Google Drive API y vuelve a intentar en unos minutos."
  }
  if (message.includes("401")) return "La sesion de Drive expiro. Reconecta tu cuenta."
  if (message.includes("403")) return "Google no autorizo esta accion en Drive. Revisa permisos o vuelve a conectar Drive."
  if (message.includes("storageQuotaExceeded")) return "Tu cuenta de Google Drive no tiene espacio disponible."
  return "No se pudo completar la accion en Google Drive."
}

export function getGoogleDriveErrorMessage(error: unknown): string {
  return googleDriveErrorMessage(error)
}

export function isDriveFolder(item: Pick<DriveItem, "mimeType">): boolean {
  return item.mimeType === GOOGLE_DRIVE_FOLDER_MIME
}

export async function listarDrivePersonal(
  accessToken: string,
  folderId = "root",
  pageToken?: string,
): Promise<DriveListResponse> {
  const safeFolder = escapeDriveQueryValue(folderId || "root")
  const url = buildDriveUrl("/files", {
    q: `'${safeFolder}' in parents and trashed=false`,
    fields: DRIVE_FIELDS,
    pageSize: 100,
    orderBy: "folder,name",
    pageToken,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  return googleDriveFetch<DriveListResponse>(accessToken, url)
}

export async function buscarDrivePersonal(
  accessToken: string,
  term: string,
  folderId?: string,
): Promise<DriveListResponse> {
  const safeTerm = escapeDriveQueryValue(term.trim())
  const clauses = [`name contains '${safeTerm}'`, "trashed=false"]
  if (folderId) clauses.unshift(`'${escapeDriveQueryValue(folderId)}' in parents`)
  const url = buildDriveUrl("/files", {
    q: clauses.join(" and "),
    fields: DRIVE_FIELDS,
    pageSize: 100,
    orderBy: "folder,name",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  return googleDriveFetch<DriveListResponse>(accessToken, url)
}

function getCurrentSchoolYear(): number {
  return new Date().getFullYear()
}

function workspaceCacheKey(year: number) {
  return `edupanel_drive_workspace:${year}`
}

export function getCachedEduPanelDriveWorkspace(year = getCurrentSchoolYear()): EduPanelDriveWorkspaceCache | null {
  const win = storage()
  if (!win) return null
  const raw = win.localStorage.getItem(workspaceCacheKey(year))
  if (!raw) return null
  try {
    return JSON.parse(raw) as EduPanelDriveWorkspaceCache
  } catch {
    return null
  }
}

function setCachedEduPanelDriveWorkspace(cache: EduPanelDriveWorkspaceCache) {
  const win = storage()
  if (!win) return
  win.localStorage.setItem(workspaceCacheKey(cache.year), JSON.stringify(cache))
}

export function sanitizeDriveNamePart(value?: string | number | null): string {
  const base = String(value ?? "").trim()
  return base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/:*?"<>|#%{}~&]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90) || "Sin nombre"
}

function sanitizeFileName(value: string): string {
  return sanitizeDriveNamePart(value)
    .replace(/[^a-zA-Z0-9._ -]+/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 120) || "respaldo"
}

function contextUnitNumber(context: DriveResourceContext): string {
  const raw = context.unidadId || context.unidadNombre || ""
  const n = raw.match(/\d+/)?.[0]
  return n ? n.padStart(2, "0") : "00"
}

function buildUnidadFolderName(context: DriveResourceContext): string {
  const number = contextUnitNumber(context)
  const name = sanitizeDriveNamePart(context.unidadNombre || context.unidadId || `Unidad ${number}`)
  return `Unidad ${number} - ${name}`
}

export function buildDriveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`
}

export async function obtenerDriveItem(accessToken: string, fileId: string): Promise<DriveItem> {
  const url = buildDriveUrl(`/files/${encodeURIComponent(fileId)}`, {
    fields: DRIVE_FILE_FIELDS,
    supportsAllDrives: true,
  })
  return googleDriveFetch<DriveItem>(accessToken, url)
}

export async function buscarCarpetaDrive(
  accessToken: string,
  name: string,
  parentId = "root",
): Promise<DriveItem | null> {
  const url = buildDriveUrl("/files", {
    q: [
      `name='${escapeDriveQueryValue(name)}'`,
      `mimeType='${GOOGLE_DRIVE_FOLDER_MIME}'`,
      `'${escapeDriveQueryValue(parentId)}' in parents`,
      "trashed=false",
    ].join(" and "),
    fields: DRIVE_FIELDS,
    pageSize: 10,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  const res = await googleDriveFetch<DriveListResponse>(accessToken, url)
  return res.files?.[0] || null
}

export async function buscarDriveItemPorNombre(
  accessToken: string,
  name: string,
  parentId = "root",
): Promise<DriveItem | null> {
  const url = buildDriveUrl("/files", {
    q: [
      `name='${escapeDriveQueryValue(name)}'`,
      `'${escapeDriveQueryValue(parentId)}' in parents`,
      "trashed=false",
    ].join(" and "),
    fields: DRIVE_FIELDS,
    pageSize: 10,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  const res = await googleDriveFetch<DriveListResponse>(accessToken, url)
  return res.files?.[0] || null
}

export async function buscarArchivoDrive(
  accessToken: string,
  name: string,
  parentId = "root",
): Promise<DriveItem | null> {
  const url = buildDriveUrl("/files", {
    q: [
      `name='${escapeDriveQueryValue(name)}'`,
      `mimeType!='${GOOGLE_DRIVE_FOLDER_MIME}'`,
      `'${escapeDriveQueryValue(parentId)}' in parents`,
      "trashed=false",
    ].join(" and "),
    fields: DRIVE_FIELDS,
    pageSize: 10,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  const res = await googleDriveFetch<DriveListResponse>(accessToken, url)
  return res.files?.[0] || null
}

export async function listarCarpetasDrive(accessToken: string, parentId: string): Promise<DriveItem[]> {
  const url = buildDriveUrl("/files", {
    q: [
      `mimeType='${GOOGLE_DRIVE_FOLDER_MIME}'`,
      `'${escapeDriveQueryValue(parentId)}' in parents`,
      "trashed=false",
    ].join(" and "),
    fields: DRIVE_FIELDS,
    pageSize: 100,
    orderBy: "folder,name",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  const res = await googleDriveFetch<DriveListResponse>(accessToken, url)
  return res.files || []
}

export async function crearCarpetaDrive(
  accessToken: string,
  name: string,
  parentId = "root",
): Promise<DriveItem> {
  const url = buildDriveUrl("/files", {
    fields: DRIVE_FILE_FIELDS,
    supportsAllDrives: true,
  })
  return googleDriveFetch<DriveItem>(accessToken, url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: GOOGLE_DRIVE_FOLDER_MIME,
      parents: [parentId],
    }),
  })
}

export async function actualizarMetadataDrive(
  accessToken: string,
  fileId: string,
  metadata: Record<string, unknown>,
): Promise<DriveItem> {
  const url = buildDriveUrl(`/files/${encodeURIComponent(fileId)}`, {
    fields: DRIVE_FILE_FIELDS,
    supportsAllDrives: true,
  })
  return googleDriveFetch<DriveItem>(accessToken, url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  })
}

export async function renombrarDriveItem(accessToken: string, fileId: string, name: string): Promise<DriveItem> {
  return actualizarMetadataDrive(accessToken, fileId, { name })
}

export async function moverDriveItem(
  accessToken: string,
  fileId: string,
  params: {
    addParentId: string
    removeParentIds?: string[]
  },
): Promise<DriveItem> {
  const current = await obtenerDriveItem(accessToken, fileId)
  const currentParents = current.parents || []
  const removeParents = params.removeParentIds?.length
    ? params.removeParentIds
    : currentParents.filter(parentId => parentId !== params.addParentId)

  if (currentParents.includes(params.addParentId) && removeParents.length === 0) return current

  const url = buildDriveUrl(`/files/${encodeURIComponent(fileId)}`, {
    addParents: params.addParentId,
    removeParents: removeParents.join(",") || undefined,
    fields: DRIVE_FILE_FIELDS,
    supportsAllDrives: true,
  })
  return googleDriveFetch<DriveItem>(accessToken, url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })
}

export async function asegurarCarpetaDrive(
  accessToken: string,
  name: string,
  parentId = "root",
): Promise<DriveItem> {
  const found = await buscarCarpetaDrive(accessToken, name, parentId)
  if (found) return found
  return crearCarpetaDrive(accessToken, name, parentId)
}

export async function asegurarCarpetaDriveConAliases(
  accessToken: string,
  preferredName: string,
  parentId = "root",
  aliases: string[] = [],
): Promise<DriveItem> {
  const names = Array.from(new Set([preferredName, ...aliases].map(name => name.trim()).filter(Boolean)))
  for (const [index, name] of names.entries()) {
    const found = await buscarCarpetaDrive(accessToken, name, parentId)
    if (found) {
      if (index > 0 && found.name !== preferredName) {
        return renombrarDriveItem(accessToken, found.id, preferredName).catch(() => found)
      }
      return found
    }
  }
  return crearCarpetaDrive(accessToken, preferredName, parentId)
}

async function migrarUnidadesSueltasACarpetaPlanificaciones(
  accessToken: string,
  cursoFolderId: string,
  planificacionesFolderId: string,
): Promise<void> {
  const children = await listarCarpetasDrive(accessToken, cursoFolderId)
  const unitLike = children.filter(item =>
    /^(Unidad|Proyecto)\s+\d+/i.test(item.name.trim()) &&
    item.id !== planificacionesFolderId
  )
  await Promise.allSettled(unitLike.map(item =>
    moverDriveItem(accessToken, item.id, {
      addParentId: planificacionesFolderId,
      removeParentIds: [cursoFolderId],
    })
  ))
}

export async function ensureEduPanelDriveRoot(
  accessToken: string,
  year = getCurrentSchoolYear(),
): Promise<EduPanelDriveWorkspace> {
  const cached = getCachedEduPanelDriveWorkspace(year)
  if (cached?.rootFolderId && cached?.yearFolderId) {
    try {
      const [root, yearFolder] = await Promise.all([
        obtenerDriveItem(accessToken, cached.rootFolderId),
        obtenerDriveItem(accessToken, cached.yearFolderId),
      ])
      const workspace = {
        year,
        root,
        yearFolder,
        focusFolder: root,
        folders: { root, year: yearFolder },
      }
      setCachedEduPanelDriveWorkspace({
        year,
        rootFolderId: root.id,
        rootFolderUrl: root.webViewLink,
        yearFolderId: yearFolder.id,
        yearFolderUrl: yearFolder.webViewLink,
        updatedAt: Date.now(),
      })
      return workspace
    } catch {
      // Si el docente borro o movio la carpeta, se repara buscando/creando de nuevo.
    }
  }

  let root = await asegurarCarpetaDrive(accessToken, EDU_PANEL_DRIVE_ROOT_NAME, "root")
  let yearFolder: DriveItem
  try {
    yearFolder = await asegurarCarpetaDrive(accessToken, String(year), root.id)
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (!message.includes("403")) throw error
    root = await crearCarpetaDrive(accessToken, EDU_PANEL_DRIVE_ROOT_NAME, "root")
    yearFolder = await asegurarCarpetaDrive(accessToken, String(year), root.id)
  }
  setCachedEduPanelDriveWorkspace({
    year,
    rootFolderId: root.id,
    rootFolderUrl: root.webViewLink,
    yearFolderId: yearFolder.id,
    yearFolderUrl: yearFolder.webViewLink,
    updatedAt: Date.now(),
  })
  return {
    year,
    root,
    yearFolder,
    focusFolder: root,
    folders: { root, year: yearFolder },
  }
}

export async function ensureEduPanelWorkspaceForContext(
  accessToken: string,
  context?: DriveResourceContext,
  year = getCurrentSchoolYear(),
): Promise<EduPanelDriveWorkspace> {
  const workspace = await ensureEduPanelDriveRoot(accessToken, year)
  const folders: EduPanelDriveWorkspace["folders"] = { ...workspace.folders }
  let focusFolder = workspace.yearFolder

  if (!context?.asignatura) {
    return { ...workspace, focusFolder, folders }
  }

  const asignatura = await asegurarCarpetaDrive(accessToken, sanitizeDriveNamePart(context.asignatura), workspace.yearFolder.id)
  folders.asignatura = asignatura
  focusFolder = asignatura

  if (!context.curso) {
    return { ...workspace, focusFolder, folders }
  }

  const curso = await asegurarCarpetaDrive(accessToken, sanitizeDriveNamePart(context.curso), asignatura.id)
  folders.curso = curso
  focusFolder = curso

  const planificacion = await asegurarCarpetaDriveConAliases(accessToken, "Planificaciones", curso.id, ["Planificacion"])
  const evaluaciones = await asegurarCarpetaDrive(accessToken, "Evaluaciones", curso.id)
  const exportaciones = await asegurarCarpetaDrive(accessToken, "Exportaciones", curso.id)
  await migrarUnidadesSueltasACarpetaPlanificaciones(accessToken, curso.id, planificacion.id)
  folders.planificacion = planificacion
  folders.evaluaciones = evaluaciones
  folders.exportaciones = exportaciones

  if (!context.unidadId && context.tipo === "planificaciones") {
    focusFolder = planificacion
    return { ...workspace, focusFolder, folders }
  }

  if (!context.unidadId) {
    focusFolder = context.tipo && ["pruebas", "guias", "rubricas", "listas", "evaluaciones"].includes(context.tipo)
      ? evaluaciones
      : context.tipo === "materiales" || context.tipo === "tics"
        ? planificacion
        : curso
    return { ...workspace, focusFolder, folders }
  }

  const unidad = await asegurarCarpetaDrive(accessToken, buildUnidadFolderName(context), planificacion.id)
  folders.unidad = unidad
  focusFolder = unidad

  const unidadPlanificacion = await asegurarCarpetaDriveConAliases(accessToken, "Planificacion", unidad.id, ["Planificacion de unidad"])
  const clases = await asegurarCarpetaDriveConAliases(accessToken, "Clases", unidad.id, ["Clases y actividades"])
  const materiales = await asegurarCarpetaDrive(accessToken, "Materiales", unidad.id)
  const tics = await asegurarCarpetaDrive(accessToken, "TICs", unidad.id)
  const unidadEvaluaciones = await asegurarCarpetaDrive(accessToken, buildUnidadFolderName(context), evaluaciones.id)
  const pruebas = await asegurarCarpetaDrive(accessToken, "Pruebas", unidadEvaluaciones.id)
  const guias = await asegurarCarpetaDrive(accessToken, "Guias", unidadEvaluaciones.id)
  const rubricas = await asegurarCarpetaDrive(accessToken, "Rubricas", unidadEvaluaciones.id)
  const listas = await asegurarCarpetaDrive(accessToken, "Listas de cotejo", unidadEvaluaciones.id)

  Object.assign(folders, {
    planificacion: unidadPlanificacion,
    clases,
    materiales,
    tics,
    unidadEvaluaciones,
    evaluaciones,
    pruebas,
    guias,
    rubricas,
    listas,
    exportaciones,
  })

  if (context.tipo === "pruebas") focusFolder = pruebas
  else if (context.tipo === "guias") focusFolder = guias
  else if (context.tipo === "rubricas") focusFolder = rubricas
  else if (context.tipo === "listas") focusFolder = listas
  else if (context.tipo === "planificaciones") focusFolder = unidadPlanificacion
  else if (context.tipo === "evaluaciones") focusFolder = unidadEvaluaciones
  else if (context.tipo === "materiales") focusFolder = materiales
  else if (context.tipo === "tics") focusFolder = tics
  else focusFolder = unidad

  setPinnedDriveFolder(context, {
    folderId: focusFolder.id,
    name: focusFolder.name,
    savedAt: Date.now(),
  })

  return { ...workspace, focusFolder, folders }
}

export async function ensureEduPanelClassFolder(
  accessToken: string,
  context: DriveResourceContext & { numeroClase: number },
  year = getCurrentSchoolYear(),
): Promise<{
  workspace: EduPanelDriveWorkspace
  classFolder: DriveItem
  classPlanificacionFolder: DriveItem
  classMaterialesFolder: DriveItem
  classTicsFolder: DriveItem
}> {
  const workspace = await ensureEduPanelWorkspaceForContext(accessToken, context, year)
  const classesFolder = workspace.folders.clases || workspace.focusFolder
  const classFolder = await asegurarCarpetaDrive(
    accessToken,
    `Clase ${String(context.numeroClase).padStart(2, "0")}`,
    classesFolder.id,
  )
  const [classPlanificacionFolder, classMaterialesFolder, classTicsFolder] = await Promise.all([
    asegurarCarpetaDrive(accessToken, "Planificacion", classFolder.id),
    asegurarCarpetaDrive(accessToken, "Materiales", classFolder.id),
    asegurarCarpetaDrive(accessToken, "TICs", classFolder.id),
  ])
  Object.assign(workspace.folders, {
    clase: classFolder,
    classPlanificacion: classPlanificacionFolder,
    classMateriales: classMaterialesFolder,
    classTics: classTicsFolder,
  })
  return { workspace, classFolder, classPlanificacionFolder, classMaterialesFolder, classTicsFolder }
}

export async function subirArchivoADrive(
  accessToken: string,
  params: {
    file: File
    folderId: string
    fileName?: string
    driveMimeType?: string
    overwrite?: boolean
    onProgress?: (progress: number) => void
  },
): Promise<DriveItem> {
  const fileName = sanitizeDriveNamePart(params.fileName || params.file.name)
  if (params.overwrite) {
    const existing = await buscarArchivoDrive(accessToken, fileName, params.folderId)
    if (existing) {
      const updated = await actualizarContenidoArchivoDrive(accessToken, {
        fileId: existing.id,
        content: params.file,
        mimeType: params.file.type || "application/octet-stream",
      })
      params.onProgress?.(100)
      return updated
    }
  }

  const sessionUrl = `${DRIVE_UPLOAD_BASE}/files?uploadType=resumable&supportsAllDrives=true&fields=${encodeURIComponent(DRIVE_FILE_FIELDS)}`
  const session = await fetch(sessionUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": params.file.type || "application/octet-stream",
      "X-Upload-Content-Length": String(params.file.size),
    },
    body: JSON.stringify({
      name: fileName,
      parents: [params.folderId],
      mimeType: params.driveMimeType || params.file.type || "application/octet-stream",
    }),
  })

  if (!session.ok) {
    const detail = await session.text().catch(() => "")
    throw new Error(`Google Drive ${session.status}: ${detail}`)
  }

  const uploadUrl = session.headers.get("Location")
  if (!uploadUrl) throw new Error("Google Drive no entrego URL de subida.")

  return new Promise<DriveItem>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", uploadUrl)
    xhr.setRequestHeader("Content-Type", params.file.type || "application/octet-stream")
    xhr.upload.onprogress = event => {
      if (!event.lengthComputable) return
      params.onProgress?.(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as DriveItem)
        } catch (error) {
          reject(error)
        }
        return
      }
      reject(new Error(`Google Drive ${xhr.status}: ${xhr.responseText}`))
    }
    xhr.onerror = () => reject(new Error("No se pudo subir el archivo a Google Drive."))
    xhr.send(params.file)
  })
}

export async function actualizarContenidoArchivoDrive(
  accessToken: string,
  params: {
    fileId: string
    content: string | Blob
    mimeType?: string
  },
): Promise<DriveItem> {
  const url = `${DRIVE_UPLOAD_BASE}/files/${encodeURIComponent(params.fileId)}?uploadType=media&fields=${encodeURIComponent(DRIVE_FILE_FIELDS)}&supportsAllDrives=true`
  return googleDriveFetch<DriveItem>(accessToken, url, {
    method: "PATCH",
    headers: { "Content-Type": params.mimeType || "application/octet-stream" },
    body: params.content,
  })
}

export async function subirTextoADrive(
  accessToken: string,
  params: {
    folderId: string
    fileName: string
    content: string
    mimeType?: string
    overwrite?: boolean
  },
): Promise<DriveItem> {
  if (params.overwrite) {
    const existing = await buscarArchivoDrive(accessToken, params.fileName, params.folderId)
    if (existing) {
      return actualizarContenidoArchivoDrive(accessToken, {
        fileId: existing.id,
        content: params.content,
        mimeType: params.mimeType || "application/json",
      })
    }
  }

  const file = new File([params.content], params.fileName, {
    type: params.mimeType || "application/json",
  })
  return subirArchivoADrive(accessToken, {
    file,
    folderId: params.folderId,
    fileName: params.fileName,
  })
}

export async function buscarAccesoDirectoDrive(
  accessToken: string,
  params: {
    targetId: string
    parentId: string
    name?: string
  },
): Promise<DriveItem | null> {
  const clauses = [
    `mimeType='${GOOGLE_DRIVE_SHORTCUT_MIME}'`,
    `shortcutDetails.targetId='${escapeDriveQueryValue(params.targetId)}'`,
    `'${escapeDriveQueryValue(params.parentId)}' in parents`,
    "trashed=false",
  ]
  if (params.name) clauses.unshift(`name='${escapeDriveQueryValue(params.name)}'`)
  const url = buildDriveUrl("/files", {
    q: clauses.join(" and "),
    fields: DRIVE_FIELDS,
    pageSize: 10,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  const res = await googleDriveFetch<DriveListResponse>(accessToken, url)
  return res.files?.[0] || null
}

export async function crearAccesoDirectoDrive(
  accessToken: string,
  params: {
    targetId: string
    parentId: string
    name: string
  },
): Promise<DriveItem> {
  const existing = await buscarAccesoDirectoDrive(accessToken, params)
  if (existing) return existing
  const url = buildDriveUrl("/files", {
    fields: DRIVE_FILE_FIELDS,
    supportsAllDrives: true,
  })
  return googleDriveFetch<DriveItem>(accessToken, url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: sanitizeDriveNamePart(params.name),
      mimeType: GOOGLE_DRIVE_SHORTCUT_MIME,
      parents: [params.parentId],
      shortcutDetails: { targetId: params.targetId },
    }),
  })
}

async function exportarArchivoDrive(
  accessToken: string,
  fileId: string,
  mimeType: string,
): Promise<Blob> {
  const url = buildDriveUrl(`/files/${encodeURIComponent(fileId)}/export`, {
    mimeType,
  })
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`Google Drive ${res.status}: ${detail}`)
  }
  return res.blob()
}

export async function enviarDriveItemALaPapelera(accessToken: string, fileId: string): Promise<DriveItem> {
  return actualizarMetadataDrive(accessToken, fileId, { trashed: true })
}

export async function convertirDocxAPdfYSubirDrive(
  accessToken: string,
  params: {
    docx: Blob
    sourceFileName: string
    targetFolderId: string
    pdfFileName?: string
  },
): Promise<DriveItem> {
  const sourceName = sanitizeDriveNamePart(params.sourceFileName)
  const tempFile = new File([params.docx], sourceName, { type: GOOGLE_DRIVE_DOCX_MIME })
  const tempDoc = await subirArchivoADrive(accessToken, {
    file: tempFile,
    folderId: params.targetFolderId,
    fileName: `_temp_${Date.now()}_${sourceName}`,
    driveMimeType: GOOGLE_DRIVE_DOC_MIME,
  })

  try {
    const pdfBlob = await exportarArchivoDrive(accessToken, tempDoc.id, GOOGLE_DRIVE_PDF_MIME)
    const pdfName = params.pdfFileName || sourceName.replace(/\.docx$/i, ".pdf")
    const pdfFile = new File([pdfBlob], pdfName, { type: GOOGLE_DRIVE_PDF_MIME })
    return subirArchivoADrive(accessToken, {
      file: pdfFile,
      folderId: params.targetFolderId,
      fileName: pdfName,
      overwrite: true,
    })
  } finally {
    await enviarDriveItemALaPapelera(accessToken, tempDoc.id).catch(() => undefined)
  }
}

export async function subirDocxYPdfADrive(
  accessToken: string,
  params: {
    docx: Blob
    folderId: string
    fileName: string
  },
): Promise<{ docx: DriveItem; pdf: DriveItem }> {
  const docxName = params.fileName.endsWith(".docx") ? params.fileName : `${params.fileName}.docx`
  const pdfName = docxName.replace(/\.docx$/i, ".pdf")
  const docx = await subirDocxADrive(accessToken, params)
  const pdf = await convertirDocxAPdfYSubirDrive(accessToken, {
    docx: params.docx,
    sourceFileName: docxName,
    targetFolderId: params.folderId,
    pdfFileName: pdfName,
  })
  return { docx, pdf }
}

export async function subirDocxADrive(
  accessToken: string,
  params: {
    docx: Blob
    folderId: string
    fileName: string
  },
): Promise<DriveItem> {
  const docxName = params.fileName.endsWith(".docx") ? params.fileName : `${params.fileName}.docx`
  const docxFile = new File([params.docx], docxName, { type: GOOGLE_DRIVE_DOCX_MIME })
  return subirArchivoADrive(accessToken, {
    file: docxFile,
    folderId: params.folderId,
    fileName: docxName,
    overwrite: true,
  })
}

export async function descargarArchivoDrive(
  accessToken: string,
  item: DriveItem,
  exportMimeType = GOOGLE_DRIVE_DOCX_MIME,
): Promise<Blob> {
  const isWorkspaceDoc = item.mimeType.startsWith("application/vnd.google-apps.")
  const url = isWorkspaceDoc
    ? buildDriveUrl(`/files/${encodeURIComponent(item.id)}/export`, { mimeType: exportMimeType })
    : buildDriveUrl(`/files/${encodeURIComponent(item.id)}`, { alt: "media", supportsAllDrives: true })
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`Google Drive ${res.status}: ${detail}`)
  }
  return res.blob()
}

function backupFileName(context?: DriveResourceContext) {
  const kind = sanitizeFileName(context?.tipo || "respaldo")
  const asignatura = sanitizeFileName(context?.asignatura || "EduPanel")
  const curso = context?.curso ? `_${sanitizeFileName(context.curso)}` : ""
  const unidad = context?.unidadNombre || context?.unidadId ? `_${sanitizeFileName(context.unidadNombre || context.unidadId || "")}` : ""
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  return `Respaldo_${kind}_${asignatura}${curso}${unidad}_${stamp}.json`
}

function autosaveFileName(context?: DriveResourceContext) {
  const kind = sanitizeFileName(context?.tipo || "respaldo")
  const asignatura = sanitizeFileName(context?.asignatura || "EduPanel")
  const curso = context?.curso ? `_${sanitizeFileName(context.curso)}` : ""
  const unidad = context?.unidadNombre || context?.unidadId ? `_${sanitizeFileName(context.unidadNombre || context.unidadId || "")}` : ""
  return `Autosave_${kind}_${asignatura}${curso}${unidad}.json`
}

function liveCourseBackupFileName(context?: DriveResourceContext) {
  return `Respaldo_vivo_${sanitizeFileName(context?.curso || context?.asignatura || "curso")}.json`
}

export async function respaldarJsonEduPanelDrive(
  accessToken: string,
  params: {
    context?: DriveResourceContext
    data: unknown
    year?: number
    fileName?: string
  },
): Promise<{ file: DriveItem; workspace: EduPanelDriveWorkspace }> {
  const workspace = await ensureEduPanelWorkspaceForContext(accessToken, params.context, params.year)
  const targetFolder = workspace.folders.exportaciones || workspace.focusFolder
  const content = JSON.stringify({
    app: "EduPanel",
    version: 1,
    exportedAt: new Date().toISOString(),
    context: params.context || null,
    data: params.data,
  }, null, 2)
  const file = await subirTextoADrive(accessToken, {
    folderId: targetFolder.id,
    fileName: params.fileName || backupFileName(params.context),
    content,
    mimeType: "application/json",
  })
  return { file, workspace }
}

export async function respaldarCursoVivoJsonDrive(
  accessToken: string,
  params: {
    context?: DriveResourceContext
    data: unknown
    year?: number
    fileName?: string
  },
): Promise<{ file: DriveItem; workspace: EduPanelDriveWorkspace }> {
  const workspace = await ensureEduPanelWorkspaceForContext(accessToken, params.context, params.year)
  const targetFolder = workspace.folders.exportaciones || workspace.focusFolder
  const content = JSON.stringify({
    app: "EduPanel",
    version: 1,
    mode: "respaldo_vivo_curso",
    backedUpAt: new Date().toISOString(),
    context: {
      asignatura: params.context?.asignatura || null,
      curso: params.context?.curso || null,
      year: params.year || workspace.year,
    },
    data: params.data,
  }, null, 2)
  const file = await subirTextoADrive(accessToken, {
    folderId: targetFolder.id,
    fileName: params.fileName || liveCourseBackupFileName(params.context),
    content,
    mimeType: "application/json",
    overwrite: true,
  })
  return { file, workspace }
}

export async function actualizarUnidadEnRespaldoVivoDrive(
  accessToken: string,
  params: {
    context: DriveResourceContext
    data: unknown
    year?: number
  },
): Promise<{ file: DriveItem; workspace: EduPanelDriveWorkspace }> {
  const workspace = await ensureEduPanelWorkspaceForContext(accessToken, params.context, params.year)
  const targetFolder = workspace.folders.exportaciones || workspace.focusFolder
  const fileName = liveCourseBackupFileName(params.context)
  const existing = await buscarArchivoDrive(accessToken, fileName, targetFolder.id)
  let previous: Record<string, unknown> = {}
  if (existing) {
    try {
      const blob = await descargarArchivoDrive(accessToken, existing, "application/json")
      previous = JSON.parse(await blob.text()) as Record<string, unknown>
    } catch {
      previous = {}
    }
  }
  const previousData = typeof previous.data === "object" && previous.data !== null
    ? previous.data as Record<string, unknown>
    : {}
  const unidades = typeof previousData.unidades === "object" && previousData.unidades !== null
    ? previousData.unidades as Record<string, unknown>
    : {}
  const unidadKey = params.context.unidadId || params.context.unidadNombre || "unidad"
  const previousUnidad = typeof unidades[unidadKey] === "object" && unidades[unidadKey] !== null
    ? unidades[unidadKey] as Record<string, unknown>
    : {}
  const nextUnidad = typeof params.data === "object" && params.data !== null
    ? { ...previousUnidad, ...params.data as Record<string, unknown> }
    : params.data
  if (
    typeof previousUnidad.clases === "object" &&
    previousUnidad.clases !== null &&
    typeof (params.data as { clases?: unknown })?.clases === "object" &&
    (params.data as { clases?: unknown }).clases !== null &&
    typeof nextUnidad === "object" &&
    nextUnidad !== null
  ) {
    ;(nextUnidad as Record<string, unknown>).clases = {
      ...previousUnidad.clases as Record<string, unknown>,
      ...(params.data as { clases: Record<string, unknown> }).clases,
    }
  }
  const content = JSON.stringify({
    app: "EduPanel",
    version: 1,
    mode: "respaldo_vivo_curso",
    backedUpAt: new Date().toISOString(),
    context: {
      asignatura: params.context.asignatura || null,
      curso: params.context.curso || null,
      year: params.year || workspace.year,
    },
    data: {
      ...previousData,
      unidades: {
        ...unidades,
        [unidadKey]: nextUnidad,
      },
    },
  }, null, 2)
  const file = await subirTextoADrive(accessToken, {
    folderId: targetFolder.id,
    fileName,
    content,
    mimeType: "application/json",
    overwrite: true,
  })
  return { file, workspace }
}

export async function autosaveJsonEduPanelDrive(
  accessToken: string,
  params: {
    context?: DriveResourceContext
    data: unknown
    year?: number
    fileName?: string
  },
): Promise<{ file: DriveItem; workspace: EduPanelDriveWorkspace }> {
  const workspace = await ensureEduPanelWorkspaceForContext(accessToken, params.context, params.year)
  const targetFolder = workspace.folders.exportaciones || workspace.focusFolder
  const content = JSON.stringify({
    app: "EduPanel",
    version: 1,
    mode: "autosave",
    autosavedAt: new Date().toISOString(),
    context: params.context || null,
    data: params.data,
  }, null, 2)
  const file = await subirTextoADrive(accessToken, {
    folderId: targetFolder.id,
    fileName: params.fileName || autosaveFileName(params.context),
    content,
    mimeType: "application/json",
    overwrite: true,
  })
  return { file, workspace }
}

export function buildDrivePreviewUrl(item: DriveItem): string | null {
  if (isDriveFolder(item)) return null
  if (item.mimeType === "application/vnd.google-apps.document") {
    return `https://docs.google.com/document/d/${item.id}/preview`
  }
  if (item.mimeType === "application/vnd.google-apps.spreadsheet") {
    return `https://docs.google.com/spreadsheets/d/${item.id}/preview`
  }
  if (item.mimeType === "application/vnd.google-apps.presentation") {
    return `https://docs.google.com/presentation/d/${item.id}/preview`
  }
  if (item.mimeType === "application/vnd.google-apps.drawing") {
    return `https://docs.google.com/drawings/d/${item.id}/preview`
  }
  return `https://drive.google.com/file/d/${item.id}/preview`
}

export function driveContextKey(context?: DriveResourceContext): string | null {
  if (!context) return null
  const parts = [
    context.tipo || "drive",
    context.asignatura || "all",
    context.curso || "all",
    context.unidadId || "all",
  ]
  return parts
    .join("__")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]+/g, "_")
}

export function getPinnedDriveFolder(context?: DriveResourceContext): DriveFolderPin | null {
  const key = driveContextKey(context)
  const win = storage()
  if (!key || !win) return null
  const raw = win.localStorage.getItem(`edupanel_drive_pin:${key}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as DriveFolderPin
  } catch {
    return null
  }
}

export function setPinnedDriveFolder(context: DriveResourceContext | undefined, pin: DriveFolderPin | null) {
  const key = driveContextKey(context)
  const win = storage()
  if (!key || !win) return
  const storageKey = `edupanel_drive_pin:${key}`
  if (!pin) {
    win.localStorage.removeItem(storageKey)
    return
  }
  win.localStorage.setItem(storageKey, JSON.stringify(pin))
}

// ─── Backup completo del curso en Exportaciones/ ─────────────────────────────

export interface BackupCursoCompletoParams {
  accessToken: string
  asignatura: string
  curso: string
  year?: number
  /** Datos completos del curso: unidades, clases, evaluaciones, etc. */
  data: unknown
}

export interface BackupCursoCompletoResult {
  file: DriveItem
  workspace: EduPanelDriveWorkspace
}

/**
 * Guarda un backup JSON completo del curso en la carpeta Exportaciones/.
 * El archivo se sobreescribe en cada llamada para mantener siempre el más reciente.
 * Nombre: Backup_Completo_{Asignatura}_{Curso}.json
 */
export async function respaldarCursoCompletoEnDrive(
  params: BackupCursoCompletoParams,
): Promise<BackupCursoCompletoResult> {
  const { accessToken, asignatura, curso, year, data } = params
  const workspace = await ensureEduPanelWorkspaceForContext(accessToken, {
    asignatura,
    curso,
  }, year)

  const exportacionesFolder = workspace.folders.exportaciones || workspace.focusFolder

  const content = JSON.stringify({
    app: "EduPanel",
    version: 1,
    mode: "backup_completo_curso",
    backedUpAt: new Date().toISOString(),
    context: {
      asignatura,
      curso,
      year: year || workspace.year,
    },
    data,
  }, null, 2)

  const fileName = `Backup_Completo_${sanitizeDriveNamePart(asignatura)}_${sanitizeDriveNamePart(curso)}.json`

  const file = await subirTextoADrive(accessToken, {
    folderId: exportacionesFolder.id,
    fileName,
    content,
    mimeType: "application/json",
    overwrite: true,
  })

  return { file, workspace }
}
