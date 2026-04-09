import { initializeApp, getApps } from "firebase/app"
import { getFirestore } from "firebase/firestore"
import { getAuth } from "firebase/auth"
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check"
import { getVertexAI } from "@firebase/vertexai"

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY            ?? "AIzaSyAPZ0knktdl2TINlaVhBi8-o8o7o9DFVCc",
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN        ?? "edupanel-bf5cb.firebaseapp.com",
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID         ?? "edupanel-bf5cb",
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET     ?? "edupanel-bf5cb.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "1091516333641",
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID             ?? "1:1091516333641:web:0753278efac24ad4394998",
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]

// Initialize App Check if we're in the browser
if (typeof window !== "undefined") {
  // Omitimos inicializar App Check en localhost por ahora, ya que la clave de reCaptcha
  // era inventada y bloqueaba la petición (Error 401). 
  // Borramos cualquier token inválido que se haya cacheado accidentalmente en el navegador.
  try {
    window.indexedDB.deleteDatabase("firebase-app-check-database");
  } catch (e) {}
}

export const db = getFirestore(app)
export const auth = getAuth(app)

// Exporta la instancia de Vertex AI preconfigurada
export const vertexAI = getVertexAI(app)
