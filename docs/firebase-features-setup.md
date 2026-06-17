# Activación de features Firebase (Remote Config, FCM, Cron, RTDB)

Todo el código ya está en la rama `feat/migracion-ia-appcheck`, **no-breaking y gated**:
nada se activa hasta que completes el paso de consola correspondiente. Aquí está
qué hacer para cada uno.

---

## 1. Remote Config — afinar prompts de IA sin redeploy

**Qué hace:** un sufijo institucional global se agrega a los prompts de IA
(empezando por `pedagogical-search`), editable desde la consola sin tocar código.

1. Cloud Console → habilita **Firebase Remote Config API**.
2. Firebase Console → **Remote Config** → crea el parámetro:
   - `ai_prompt_suffix` (String) — texto que se anexa a los prompts.
   - (opcional) `ai_default_temperature` (String).
3. Publica los cambios. Listo: el server los lee con caché de 5 min.

> Código: `lib/server/remote-config.ts`. Pendiente opcional: cablear el sufijo a
> más rutas de IA (hoy está en `pedagogical-search` como patrón).

---

## 2. Cloud Messaging (FCM) — notificaciones push

**Qué hace:** permite enviar push a los profes (alertas de deserción, cobertura,
recordatorios). Conecta con la flag `notificaciones-push`.

1. Firebase Console → **Configuración del proyecto → Cloud Messaging** →
   **Certificados push web** → genera el par de claves (Web Push / VAPID).
2. Copia la clave pública a `NEXT_PUBLIC_FIREBASE_VAPID_KEY` (en `.env.local` y Vercel). Redeploy.
3. En la app, llama `enablePush()` (de `lib/push-client.ts`) desde un botón
   "Activar notificaciones" (donde quieras ubicarlo en la UI). Pide permiso,
   registra el SW y guarda el token en `users/{uid}/push_tokens`.
4. **Verificar:** con un token registrado, haz `POST /api/push/test` (autenticado)
   → debería llegar una notificación de prueba.
5. **Enviar desde el server:** `sendPushToUser(uid, { title, body, data })` de
   `lib/server/push.ts` (úsalo en radar-desercion / predictor-cobertura).

> Requiere App Check idealmente activo (ver banner de Firebase) para evitar abuso.

---

## 3. Tarea nocturna — fábrica de preguntas (Vercel Cron)

**Qué hace:** de noche genera preguntas con IA y las guarda en el banco de ítems
del usuario, procesando una cola de trabajos. Conecta con la flag `fabrica-preguntas`.

1. En **Vercel → Settings → Environment Variables**, crea `CRON_SECRET` con un
   valor aleatorio largo. Vercel lo envía como `Authorization: Bearer $CRON_SECRET`.
2. El cron ya está declarado en `vercel.json` (diario 06:00 UTC ≈ 02-03h Chile).
   Se activa solo al desplegar en Vercel.
3. **Encolar trabajo** = crear un doc en la colección `fabrica_jobs`:
   ```json
   {
     "uid": "<uid del profe>",
     "asignatura": "Música",
     "curso": "5°A",
     "oa": "OA 3: ...",
     "tema": "Ritmo y pulso",
     "cantidad": 5,
     "tipoItems": ["seleccion_multiple", "verdadero_falso"],
     "status": "pending"
   }
   ```
   El cron procesa hasta 10 jobs `pending` por corrida, guarda en
   `users/{uid}/itemBank` y marca el job `done` o `error`.
4. **Probar manual:** `GET /api/cron/fabrica-preguntas` con header
   `Authorization: Bearer <CRON_SECRET>`.

> Nota: la generación del cron no pasa por el budget por-usuario (es controlada
> por la frecuencia del cron y el tamaño de la cola). Alternativa a Vercel Cron:
> Firebase Cloud Functions (requiere `firebase init functions` + deploy aparte).

---

## 4. Realtime Database — cerrar el acceso (acción urgente)

La RTDB está **vacía y tu app no la usa**, pero sus reglas de modo de prueba
expiran el 18-jun (estaba abierta a todos). En Firebase Console → **Realtime
Database → Reglas**, reemplaza por esto y **Publica**:

```json
{ "rules": { ".read": false, ".write": false } }
```

> No la elimines: es la herramienta ideal para la futura flag `colaboracion-vivo`
> (presencia y clase en vivo). Queda cerrada y lista para cuando la uses.

---

## Resumen de variables de entorno nuevas

| Variable | Para | Dónde se obtiene |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_KEY` | App Check | Firebase → App Check (reCAPTCHA v3) |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | Push (FCM) | Firebase → Cloud Messaging → Web Push |
| `CRON_SECRET` | Cron nocturno | Lo defines tú (aleatorio) |
| `VERTEX_SEARCH_*` | Vertex AI Search | Ver `docs/vertex-ai-search-setup.md` |
| `GEMINI_API_KEY` (en el proyecto) | Que los créditos paguen la IA | Cloud Console → Credenciales |
