import { initializeApp, getApps } from "firebase/app"
import { getFirestore, initializeFirestore } from "firebase/firestore"
import { getAuth } from "firebase/auth"
import { getStorage } from "firebase/storage"
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check"

// Las credenciales SOLO vienen de variables de entorno.
// En desarrollo: definir en `.env.local`.
// En produccion (Vercel): definir en Settings > Environment Variables.
// NO hardcodear valores aqui — el repo es publico.
const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
}

// Validacion temprana — si falta una variable, mejor fallar al inicio que tener errores sutiles
if (typeof window !== "undefined" && !firebaseConfig.apiKey) {
  console.error("[firebase] Faltan variables NEXT_PUBLIC_FIREBASE_* en el entorno.")
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]

// App Check (solo navegador): protege Firestore/Storage/Auth y las API keys contra abuso.
// Requiere una clave de sitio reCAPTCHA v3 registrada en Firebase Console > App Check.
// Si la clave aún no está configurada, omitimos la inicialización para no romper la app.
if (typeof window !== "undefined") {
  const recaptchaKey = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_KEY
  if (recaptchaKey) {
    // En desarrollo, habilita el token de depuración para que App Check funcione en
    // localhost. Copia el token que se imprime en la consola del navegador y regístralo en
    // Firebase Console > App Check > (app) > Administrar tokens de depuración.
    if (process.env.NODE_ENV !== "production") {
      // @ts-expect-error — propiedad global que reconoce el SDK de App Check
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = true
    }
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(recaptchaKey),
        isTokenAutoRefreshEnabled: true,
      })
    } catch (error) {
      console.error("[firebase] No se pudo inicializar App Check:", error)
    }
  } else {
    // Sin clave configurada: limpiamos cualquier token inválido cacheado de intentos previos.
    try {
      window.indexedDB.deleteDatabase("firebase-app-check-database")
    } catch {}
  }
}

let firestoreDb: ReturnType<typeof getFirestore>
try {
  firestoreDb = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
  })
} catch {
  firestoreDb = getFirestore(app)
}

export const db = firestoreDb
export const auth = getAuth(app)
export const storage = getStorage(app)
export const firebaseApp = app
