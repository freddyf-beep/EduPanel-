# Vertex AI Search sobre el corpus de currículum

Conecta `pedagogical-search` (y a futuro `recomendador-semantico`) a un buscador
semántico sobre tus documentos oficiales (programas MINEDUC, OAs, actividades) en
lugar de la web. **Consume el crédito de Google Cloud de "GenAI App Builder"
(~$950)**, que es el de alcance restringido a Vertex AI Search / Agent Builder.

El código ya está integrado y es **no-breaking**: si no completas esta
configuración, `pedagogical-search` sigue funcionando solo con búsqueda web.

---

## 1. Habilitar APIs (Google Cloud Console, proyecto `edupanel-bf5cb`)

En **APIs y servicios → Biblioteca**, habilita:
- **Discovery Engine API** (`discoveryengine.googleapis.com`)
- **Vertex AI Agent Builder** (si aparece como producto aparte)

## 2. Dar permiso a la cuenta de servicio

La app se autentica con la cuenta de servicio de Firebase Admin
(`firebase-adminsdk-fbsvc@edupanel-bf5cb.iam.gserviceaccount.com`). En
**IAM y administración → IAM**, dale a esa cuenta el rol:
- **Discovery Engine Viewer** (lectura/búsqueda). Usa Editor solo si vas a
  administrar data stores desde la app.

## 3. Crear el Data Store e ingerir el currículum

En **Agent Builder → Data Stores → Crear**:
- Tipo recomendado para empezar: **Unstructured** (sube los PDFs de los programas
  MINEDUC) o **Structured** (sube el JSON del currículum desde Firestore/archivos).
- Fuente: Cloud Storage (sube los PDF/JSON a un bucket) o importación directa.
- Espera a que termine la **indexación** (puede tardar minutos/horas).

> Atajo útil: los JSON de `public/curriculum/` y los programas en PDF que ya tienes
> sirven como corpus inicial.

## 4. Crear el motor de búsqueda (Search App)

En **Agent Builder → Apps → Crear → Search**, asóciala al data store del paso 3.
Anota el **Engine ID** (o el **Data Store ID**) y la **location** (`global`, `us`, `eu`).

## 5. Configurar variables de entorno

En `.env.local` (dev) y en **Vercel** (prod):

```
VERTEX_SEARCH_ENGINE_ID=<tu-engine-id>
VERTEX_SEARCH_PROJECT_ID=edupanel-bf5cb     # o deja que use FIREBASE_ADMIN_PROJECT_ID
VERTEX_SEARCH_LOCATION=global               # la location de tu app
VERTEX_SEARCH_COLLECTION=default_collection
```

Redeploy. A partir de ahí, `pedagogical-search` antepondrá resultados del corpus
curricular oficial como fuentes de grounding.

## 6. Verificar

- En **Cloud Console → Facturación → Informes**, filtra por el servicio
  "Discovery Engine" / "Vertex AI Search" y confirma que aparece consumo y que el
  crédito de GenAI App Builder se está aplicando (Ahorros > 0).
- En la app, una búsqueda pedagógica debería incluir fuentes del corpus MINEDUC.

---

### Notas de implementación
- Helper: `lib/ai/vertex-search.ts` (`searchCurriculumCorpus`, `isVertexSearchConfigured`).
- Auth: access token de la cuenta de servicio de Firebase Admin (scope cloud-platform);
  no requiere API key adicional.
- Integración: `app/api/pedagogical-search/route.ts` (grounding opcional + fuentes).
