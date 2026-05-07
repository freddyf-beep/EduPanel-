import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type UploadTaskSnapshot,
} from "firebase/storage"
import { auth, storage } from "@/lib/firebase"
import type { ArchivoAdjunto } from "@/lib/curriculo"

const MAX_FILE_SIZE = 25 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "video/mp4",
])

function getUid(): string {
  const uid = auth?.currentUser?.uid
  if (!uid) throw new Error("Usuario no autenticado")
  return uid
}

function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "archivo"
}

export function validarArchivoClase(file: File): void {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Formato no soportado. Usa PDF, DOCX, PPTX, JPG, PNG o MP4.")
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("El archivo supera el limite de 25 MB.")
  }
}

export function formatoTamaño(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

export async function subirArchivoClase(
  actividadClaseId: string,
  file: File,
  onProgress?: (progress: number, snapshot: UploadTaskSnapshot) => void,
): Promise<ArchivoAdjunto> {
  validarArchivoClase(file)
  const uid = getUid()
  const id = crypto.randomUUID()
  const nombre = sanitizeFileName(file.name)
  const storagePath = `users/${uid}/clases/${actividadClaseId}/${id}_${nombre}`
  const fileRef = ref(storage, storagePath)
  const task = uploadBytesResumable(fileRef, file, { contentType: file.type })

  await new Promise<void>((resolve, reject) => {
    task.on(
      "state_changed",
      snapshot => {
        const progress = snapshot.totalBytes > 0
          ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
          : 0
        onProgress?.(progress, snapshot)
      },
      reject,
      () => resolve()
    )
  })

  const url = await getDownloadURL(task.snapshot.ref)
  return {
    id,
    nombre: file.name,
    url,
    storagePath,
    tipo: file.type,
    tamaño: file.size,
    subidoEn: Date.now(),
  }
}

export async function eliminarArchivoClase(storagePath: string): Promise<void> {
  if (!storagePath) return
  await deleteObject(ref(storage, storagePath))
}
