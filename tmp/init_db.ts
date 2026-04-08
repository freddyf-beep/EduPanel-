import { db } from "../lib/firebase";
import { 
  collection, doc, setDoc, getDocs, deleteDoc, writeBatch 
} from "firebase/firestore";
import fs from "fs";
import path from "path";

async function clearCollection(colPath: string) {
  const colRef = collection(db, colPath);
  const snap = await getDocs(colRef);
  for (const d of snap.docs) {
    await deleteDoc(d.ref);
  }
}

async function init() {
  console.log("Iniciando limpieza de 'curriculo'...");
  
  // Lista de niveles para generar data genérica
  const niveles = [
    "1ro Básico", "2do Básico", "3ro Básico", 
    "4to Básico", 
    "5to Básico", "6to Básico", "7mo Básico", "8vo Básico"
  ];

  for (const nivel of niveles) {
    const docId = ("musica_" + nivel)
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    
    console.log(`Procesando ${nivel} -> ${docId}`);

    if (nivel === "4to Básico") {
      // Cargar desde JSON real
      const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), "4tobasico.JSON"), "utf-8"));
      for (const item of data) {
        const unidad = item.unidad;
        const uId = `unidad_${unidad.numero_unidad}`;
        const uRef = doc(db, "curriculo", docId, "unidades", uId);
        
        // Asegurar que el documento padre existe
        await setDoc(doc(db, "curriculo", docId), { ready: true });
        
        await setDoc(uRef, {
          numero_unidad: unidad.numero_unidad,
          nombre_unidad: unidad.nombre_unidad,
          proposito: unidad.proposito,
          conocimientos_previos: unidad.conocimientos_previos,
          palabras_clave: unidad.palabras_clave,
          conocimientos: unidad.conocimientos,
          habilidades: unidad.habilidades,
          actitudes: unidad.actitudes,
          adecuaciones_dua: unidad.adecuaciones_dua?.estrategias_neurodiversidad || ""
        });

        // Objetivos
        for (const oa of unidad.objetivos_aprendizaje) {
          const oaRef = doc(db, "curriculo", docId, "unidades", uId, "objetivos_aprendizaje", `oa_${oa.numero}`);
          await setDoc(oaRef, oa);
        }
      }
    } else {
      // Data genérica
      // Asegurar que el documento padre existe
      await setDoc(doc(db, "curriculo", docId), { ready: true });

      for (let i = 1; i <= 4; i++) {
        const uId = `unidad_${i}`;
        const uRef = doc(db, "curriculo", docId, "unidades", uId);
        await setDoc(uRef, {
          numero_unidad: i,
          nombre_unidad: `Unidad ${i} de ${nivel}`,
          proposito: `Este año se verá este contenido en la unidad ${i} del curso ${nivel}`,
          conocimientos_previos: [],
          palabras_clave: [],
          conocimientos: [],
          habilidades: [],
          actitudes: [],
          adecuaciones_dua: ""
        });

        for (let j = 1; j <= 2; j++) {
          const oaRef = doc(db, "curriculo", docId, "unidades", uId, "objetivos_aprendizaje", `oa_${j}`);
          await setDoc(oaRef, {
            tipo: "OA",
            numero: j,
            descripcion: `OA${j}: Este es el objetivo ${j} del curso ${nivel}`,
            indicadores: [`Indicador genérico ${j}.1`, `Indicador genérico ${j}.2`]
          });
        }
      }
    }
  }
  console.log("¡Inicialización completada!");
}

init().catch(console.error);
