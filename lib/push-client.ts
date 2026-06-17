"use client"

// ═══════════════════════════════════════════════════════════════════════════
// Cloud Messaging (FCM) — lado cliente
// ─────────────────────────────────────────────────────────────────────────
// enablePush(): pide permiso de notificaciones, registra el service worker,
// obtiene el token FCM y lo guarda en Firestore (users/{uid}/push_tokens/{token}).
// onForegroundMessage(): escucha mensajes con la app en primer plano.
//
// No-breaking: si falta NEXT_PUBLIC_FIREBASE_VAPID_KEY o el navegador no soporta
// FCM, enablePush() devuelve { ok:false, reason } sin lanzar.
//
// Requisitos en consola: en Configuración del proyecto → Cloud Messaging,
// generar el par de claves Web Push (VAPID) y ponerlo en
// NEXT_PUBLIC_FIREBASE_VAPID_KEY. Ver docs/firebase-features-setup.md.
// ═══════════════════════════════════════════════════════════════════════════

import { getMessaging, getToken, isSupported, onMessage, type MessagePayload } from "firebase/messaging"
import { doc, serverTimestamp, setDoc } from "firebase/firestore"
import { auth, db, firebaseApp } from "@/lib/firebase"

export interface EnablePushResult {
  ok: boolean
  token?: string
  reason?: "ssr" | "sin-vapid" | "no-soportado" | "permiso-denegado" | "sin-token" | "error"
}

function buildSwUrl(): string {
  const params = new URLSearchParams({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  })
  return `/firebase-messaging-sw.js?${params.toString()}`
}

/** Pide permiso, obtiene el token FCM y lo persiste en Firestore. */
export async function enablePush(): Promise<EnablePushResult> {
  if (typeof window === "undefined") return { ok: false, reason: "ssr" }

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
  if (!vapidKey) return { ok: false, reason: "sin-vapid" }

  try {
    if (!(await isSupported())) return { ok: false, reason: "no-soportado" }
    if (!("serviceWorker" in navigator)) return { ok: false, reason: "no-soportado" }

    const permission = await Notification.requestPermission()
    if (permission !== "granted") return { ok: false, reason: "permiso-denegado" }

    const registration = await navigator.serviceWorker.register(buildSwUrl())
    const messaging = getMessaging(firebaseApp)
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration })
    if (!token) return { ok: false, reason: "sin-token" }

    const uid = auth.currentUser?.uid
    if (uid) {
      await setDoc(
        doc(db, "users", uid, "push_tokens", token),
        { token, platform: "web", userAgent: navigator.userAgent, updatedAt: serverTimestamp() },
        { merge: true },
      )
    }
    return { ok: true, token }
  } catch (error) {
    console.error("[push-client] enablePush falló:", error)
    return { ok: false, reason: "error" }
  }
}

/** Suscribe un callback a mensajes recibidos con la app en primer plano. */
export async function onForegroundMessage(cb: (payload: MessagePayload) => void): Promise<() => void> {
  if (typeof window === "undefined" || !(await isSupported())) return () => {}
  const messaging = getMessaging(firebaseApp)
  return onMessage(messaging, cb)
}
