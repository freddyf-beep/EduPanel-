import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAPZ0knktdl2TINlaVhBi8-o8o7o9DFVCc",
  authDomain: "edupanel-bf5cb.firebaseapp.com",
  projectId: "edupanel-bf5cb",
  storageBucket: "edupanel-bf5cb.firebasestorage.app",
  messagingSenderId: "1091516333641",
  appId: "1:1091516333641:web:0753278efac24ad4394998",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const NIVELES = [
  "1ro Básico", "2do Básico", "3ro Básico", 
  "4to Básico", 
  "5to Básico", "6to Básico", "7mo Básico", "8vo Básico"
];

async function fix() {
  console.log("🚀 Iniciando corrección de estructura...");
  for (const nivel of NIVELES) {
    const docId = ("musica_" + nivel)
      .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    
    console.log(`✍️ Asegurando documento: ${docId}`);
    await setDoc(doc(db, "curriculo", docId), { ready: true }, { merge: true });
  }
  console.log("✅ Estructura corregida.");
}

fix().catch(console.error);
