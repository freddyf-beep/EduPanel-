// ═══════════════════════════════════════════════════════════════════════════
// Subida de imágenes para Pruebas y Guías
// ─────────────────────────────────────────────────────────────────────────
// Se almacenan en `users/{uid}/evaluaciones/{tipo}/{docId}/...`
// donde tipo = "pruebas" | "guias".
// ═══════════════════════════════════════════════════════════════════════════

import {
  deleteObject, getDownloadURL, ref, uploadBytesResumable,
  type UploadTaskSnapshot,
} from "firebase/storage"
import { auth, storage } from "@/lib/firebase"

const MAX_IMAGE_SIZE = 8 * 1024 * 1024  // 8 MB
const ALLOWED_IMAGE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])

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
    .slice(0, 80) || "img"
}

export interface ImagenSubida {
  url: string
  storagePath: string
  contentType: string
  size: number
  width?: number
  height?: number
}

export async function subirImagenEvaluacion(
  tipoDoc: "pruebas" | "guias",
  docId: string,
  file: File,
  onProgress?: (pct: number, snap: UploadTaskSnapshot) => void,
): Promise<ImagenSubida> {
  if (!ALLOWED_IMAGE.has(file.type)) {
    throw new Error("Solo se permiten imágenes JPG, PNG, WEBP o GIF.")
  }
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error("La imagen no puede superar los 8 MB.")
  }

  const uid = getUid()
  const id = crypto.randomUUID()
  const fname = sanitizeFileName(file.name)
  const path = `users/${uid}/evaluaciones/${tipoDoc}/${docId}/${id}_${fname}`
  const r = ref(storage, path)
  const task = uploadBytesResumable(r, file, { contentType: file.type })

  await new Promise<void>((resolve, reject) => {
    task.on(
      "state_changed",
      snapshot => {
        const pct = snapshot.totalBytes > 0
          ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
          : 0
        onProgress?.(pct, snapshot)
      },
      reject,
      () => resolve(),
    )
  })

  const url = await getDownloadURL(task.snapshot.ref)
  const dims = await getImageDimensions(file).catch(() => ({} as { width?: number; height?: number }))

  return {
    url,
    storagePath: path,
    contentType: file.type,
    size: file.size,
    width: dims.width,
    height: dims.height,
  }
}

export async function eliminarImagenEvaluacion(storagePath?: string): Promise<void> {
  if (!storagePath) return
  try {
    await deleteObject(ref(storage, storagePath))
  } catch (e) {
    // Si la imagen ya no existe, ignorar
    console.warn("No se pudo eliminar imagen:", storagePath, e)
  }
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight }
      URL.revokeObjectURL(url)
      resolve(dims)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("No se pudo leer la imagen"))
    }
    img.src = url
  })
}
