# 🤖 MANUAL DE ACTIVACIÓN: MÓDULOS PREMIUM (GRUPO 3)

> **AVISO PARA LA IA DEL FUTURO:**
> Si estás leyendo este archivo, es porque Freddy (el Administrador) ha decidido activar las funciones **PREMIUM (Grupo 3)** de EduPanel. Estas funciones estaban deliberadamente "apagadas" o "durmientes" a través de un sistema de *Feature Flags* para ahorrar costos de infraestructura en Google Cloud Platform (GCP).

Tu misión como IA de turno es encender estos motores. El código base ya existe, solo debes seguir las instrucciones de arquitectura.

---

## 🚩 Arquitectura Base (Feature Flags)
Todas las funciones se controlan desde `lib/feature-flags.ts` y se consultan en Firestore bajo la colección `config/feature_flags`.
Si el flag de una función está en `false`, los componentes UI ocultan los botones y los endpoints de API rechazan las peticiones por seguridad (para evitar facturación sorpresa).

Freddy puede encender el flag desde `app/admin/features/page.tsx` sin tu ayuda, pero **tú debes configurar los índices en la nube antes de que él apriete el botón**.

---

## 1️⃣ Módulo: Recomendador Semántico de Recursos (#2) y Rúbricas con Sello (#12)
**Estado actual:** El código de frontend existe (los botones "Buscar por Significado" o "Inyectar PEI" en los modales), pero el motor de búsqueda vectorial en GCP no está corriendo.

### Tareas para la IA:
1. **Crear Índice en Vertex AI Vector Search:**
   - Debes guiar a Freddy para crear un índice en Vertex AI llamado `edupanel-resources-index`.
   - Dimensiones del vector: `768` (Asumiendo que usamos el modelo `textembedding-gecko@003`).
2. **Levantar el Cloud Function de Sincronización:**
   - Hay un Cloud Function (o debes crearlo en `functions/src/syncVectors.ts`) que escuche cada vez que se guarda una Guía o Prueba en Firestore, genere su embedding (vector) y lo suba al índice de Vertex AI.
3. **Desbloquear Endpoint:**
   - Revisa `app/api/semantic-search/route.ts`. Asegúrate de que la validación `const flags = await getFeatureFlags(); if (!flags['recomendador-semantico'].active) return 403` esté lista para recibir tráfico una vez que Freddy active el switch.

---

## 2️⃣ Módulo: Asistente de Apoderados 24/7 (#4)
**Estado actual:** Existe un botón flotante de chat en el portal de apoderados (`components/edu-panel/apoderados/chat-widget.tsx`), pero el Agente de Dialogflow / Vertex AI Agent Builder no está creado en la nube.

### Tareas para la IA:
1. **Crear el Data Store en Agent Builder:**
   - Dile a Freddy que entre a "Vertex AI Search and Conversation" (Agent Builder) en la consola de GCP.
   - Deben crear un "Data Store" de tipo "Cloud Storage" o "Website" alimentado con el Reglamento Interno, Manual de Convivencia y FAQs del colegio.
2. **Crear la App de tipo Chat:**
   - Conecta el Data Store creado a una app de tipo Chatbot.
3. **Configurar las credenciales en Vercel/Env:**
   - Obtén el `AGENT_ID` y `DATA_STORE_ID` e inyéctalos en las variables de entorno de EduPanel (`.env.local`).
4. **Desbloquear el Componente:**
   - Dile a Freddy que vaya a `/admin/features` y encienda la flag `bot-apoderados`. El botón del chat aparecerá automáticamente en la pantalla de las familias.

---

## 🎯 Mensaje Final para la IA
No reinventes la rueda. No borres los Feature Flags. Solo conecta la tubería de GCP a los componentes que ya dejamos preparados. ¡Buena suerte!
