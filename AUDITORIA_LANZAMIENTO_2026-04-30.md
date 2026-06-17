# Auditoria pre-lanzamiento EduPanel

Fecha: 2026-04-30  
Carpetas revisadas:
- `C:\Users\fredd\Documents\edupanel_local`
- `C:\Users\fredd\Documents\edupanel_public`

Regla de trabajo: no se modificaron archivos fuente de la app. Este informe es el unico archivo creado para documentar la revision.

## Resumen ejecutivo

EduPanel todavia no esta listo para lanzar la primera version. La razon principal no es una sola, sino una combinacion peligrosa:

1. `edupanel_public`, que es la carpeta que va a GitHub/Vercel, esta atrasada respecto a `edupanel_local` y no contiene las piezas de alfa cerrada/whitelist que ya existen en local.
2. `edupanel_local` no compila por un JSX roto en `components/edu-panel/rubricas/resultados-view.tsx`.
3. Las APIs de `edupanel_public` estan abiertas sin `verifyIdToken`, y en `edupanel_local` las APIs verifican token, pero no verifican allowlist del lado servidor.
4. La ruta `/migrate` esta visible sin login y contiene botones destructivos de base curricular.
5. Hay vulnerabilidades npm importantes, incluyendo 1 critica en ambos proyectos.

La carpeta `edupanel_local` efectivamente debe seguir siendo privada. Tiene `.env.local`, backups, archivos de curriculum, temporales, zips y otros materiales que no deben copiarse completos a GitHub. La estrategia correcta es sincronizar solo archivos seleccionados desde `local` hacia `public`.

## Backup

Backup Firestore local confirmado:

- Archivo: `backups/firestore/edupanel-firestore-2026-04-30T05-19-19-976Z.json.gz`
- Tamano aproximado: 480 KB
- Creado: 2026-04-30 01:26 local
- Resultado registrado antes: 1460 documentos / 360 colecciones
- Tarea Windows: `EduPanel Firestore Backup`, diaria a las 03:00

No se uso el codigo de invitacion `EDU-V9B4K3`, por lo que no consumi ninguno de sus usos.

## Estado de carpetas

### `edupanel_public`

Git esta limpio y es la carpeta correcta para subir:

- `git status --short`: sin cambios
- Ultimos commits: `v1.0.12`

Pero esta incompleta para la alfa cerrada. Faltan, entre otros:

- `app/admin/invitaciones/page.tsx`
- `app/api/invitaciones/route.ts`
- `app/api/redeem-invite/route.ts`
- `lib/allowlist.ts`
- `lib/api-client.ts`
- `lib/auth/verify-token.ts`
- `firebase.json`
- `firestore.rules`
- `app/contacto/page.tsx`
- `app/terminos/page.tsx`
- `app/privacidad/page.tsx`
- `app/error.tsx`
- `app/global-error.tsx`

Tambien `package.json`, `package-lock.json`, `next.config.mjs`, login/auth y rutas API difieren de local.

### `edupanel_local`

Esta es correctamente la carpeta privada. Tiene informacion sensible o no-publicable:

- `.env.local` con credenciales Firebase Admin
- backups Firestore
- PDFs/curriculum fuente
- carpetas `tmp`, backups antiguos y zips de trabajo
- scripts de backup

No debe moverse completa a `public`.

## Bloqueadores criticos

### 1. `edupanel_public` no tiene whitelist real

En `edupanel_public`, `components/auth/auth-context.tsx` acepta cualquier usuario Google autenticado. No existe chequeo de allowlist, no existe `blockedByAllowlist`, no existe `recheckAllowlist`.

En `edupanel_public`, `components/auth/protected-route.tsx` solo verifica `user`, no `blockedByAllowlist`.

En `edupanel_public`, `app/login/page.tsx` no muestra el flujo de codigo de invitacion.

Accion:

- Copiar/adaptar desde local:
  - `components/auth/auth-context.tsx`
  - `components/auth/protected-route.tsx`
  - `app/login/page.tsx`
  - `lib/allowlist.ts`
  - `app/api/redeem-invite/route.ts`
  - `app/api/invitaciones/route.ts`
  - `app/admin/invitaciones/page.tsx`
  - `lib/auth/verify-token.ts`
  - `lib/api-client.ts`
- Agregar `firebase-admin` a `edupanel_public/package.json`.
- Agregar las env vars server-side en Vercel.

### 2. APIs abiertas en `edupanel_public`

Revision de `app/api/*/route.ts` en `edupanel_public`:

- `distribuir-oas/route.ts`: sin `verifyIdToken`
- `export-planificacion/route.ts`: sin `verifyIdToken`
- `export-rubrica/route.ts`: sin `verifyIdToken`
- `generar-clase/route.ts`: sin `verifyIdToken`
- `import-rubrica/route.ts`: sin `verifyIdToken`
- `parse-rubrica/route.ts`: sin `verifyIdToken`

Esto significa que cualquiera podria llamar endpoints de IA/export/import si descubre la URL.

Accion:

- Sincronizar las rutas API protegidas desde `edupanel_local`.
- Mantener rate limit de `/api/generar-clase`.
- Agregar tambien chequeo server-side de allowlist, no solo token.

### 3. APIs en local verifican token, pero no allowlist

En `edupanel_local`, `lib/auth/verify-token.ts` valida Firebase ID Token, pero solo retorna `uid`, `email`, `emailVerified`. No comprueba si el email esta en `allowlist`.

Riesgo: un usuario Google bloqueado por el cliente podria llamar directamente `/api/generar-clase`, `/api/export-rubrica`, etc. con un ID token valido.

Accion:

- Crear helper server-side tipo `verifyAllowedUser(req)`.
- Despues de validar token, revisar:
  - admin email permitido
  - documento `allowlist/{emailLower}`
  - opcional: custom claim `allowed === true`
- Usarlo en todas las APIs privadas.

### 4. Build roto en `edupanel_local`

`npm run build` falla:

- Archivo: `components/edu-panel/rubricas/resultados-view.tsx`
- Linea principal: 350
- Error: `Expected '</', got 'ident'`

`npx tsc --noEmit --pretty false` tambien falla con errores TS17015/TS1382 desde la misma zona.

La seccion corrupta esta alrededor de lineas 342-354. Parece que se borro el wrapper de `Promedio por criterio` y el `criterioStats.map(...)`. En `edupanel_public` esa seccion existe correctamente.

Accion:

- Restaurar el bloque de `Promedio por criterio` desde `edupanel_public` o reconstruirlo manualmente.
- Repetir:
  - `npx tsc --noEmit --pretty false`
  - `npm run build`

### 5. `/migrate` esta expuesta

En ambas carpetas existe `app/migrate/page.tsx`.

Problemas:

- No usa `MainLayout`.
- No usa `ProtectedRoute`.
- Solo hace `if (!user) return` dentro de los handlers.
- Cualquier usuario autenticado podria intentar ejecutar acciones destructivas.
- En navegador sin login, la pagina igual muestra botones como:
  - "Limpiar y Reiniciar Curriculo General"
  - "Anadir Edu. Fisica y Parvularia"

Lineas relevantes:

- `app/migrate/page.tsx:21-23`: handler destructivo solo valida `user`
- `app/migrate/page.tsx:32-47`: borra documentos de `curriculo`
- `app/migrate/page.tsx:51-73`: borra colecciones privadas del usuario
- `app/migrate/page.tsx:379-396`: botones visibles

Accion:

- Para lanzamiento: eliminar esta ruta de `edupanel_public` o bloquearla detras de admin estricto.
- Ideal: mover migraciones a scripts locales/admin, no a UI publica.

### 6. `/ver-unidad` no esta protegida por `ProtectedRoute`

`app/ver-unidad/page.tsx` monta `Header`, `HelpButton` y `VerUnidadContent` directamente. No usa `MainLayout`.

En navegador sin login, `/ver-unidad?...` no redirige a `/login`; muestra header y luego "Usuario no autenticado".

Accion:

- Envolver esta pagina con `MainLayout` o `ProtectedRoute`.
- Confirmar padding/layout para que no se duplique `Header`.

### 7. Generacion IA inicial aun usa `fetch` directo en local

En `edupanel_local`, `components/edu-panel/actividades/actividades-content.tsx:610`:

```ts
const res = await fetch("/api/generar-clase", ...)
```

Ese flujo no manda `Authorization: Bearer <token>`, por lo que fallara con 401 cuando la API protegida este activa. Afecta:

- `handleGenerarClase`
- `regenerar_bloom`
- `regenerar_indicadores`
- `freddy_detallado`

Otros flujos ya usan `apiFetch`, como chat y aplicar cambios.

Accion:

- Reemplazar esa llamada por `apiFetch`.
- Rehacer busqueda de `fetch("/api` y `fetch('/api`.

### 8. Canje de invitaciones no es transaccional

En `app/api/redeem-invite/route.ts`:

- Lee invitacion.
- Comprueba `usos >= maxUsos`.
- Luego usa `batch` para agregar allowlist e incrementar usos.

Esto no evita carreras. Dos usuarios simultaneos pueden leer usos disponibles y ambos consumir el codigo.

Tambien el mismo email podria canjear el mismo codigo mas de una vez y consumir usos extra.

Accion:

- Usar `db.runTransaction`.
- Dentro de la transaccion:
  - re-leer invitacion
  - revisar limite
  - revisar si `allowlist/{email}` ya existe con ese codigo
  - si ya existe, responder idempotente sin incrementar
  - si no existe, crear allowlist e incrementar uso
- Guardar historial `usedBy` o subcoleccion `usos/{uid}`.

### 9. Reglas Firestore no estan en `edupanel_public`

`edupanel_local` tiene:

- `firebase.json`
- `firestore.rules`

`edupanel_public` no los tiene.

Ademas, regla actual de allowlist:

```js
match /allowlist/{email} {
  allow read: if isSignedIn();
  allow write: if isAdmin();
}
```

Esto permite a cualquier usuario autenticado leer/listar la allowlist, filtrando emails invitados.

Accion:

- Copiar reglas a `public`.
- Ajustar allowlist para evitar lectura/listado global.
- Preferible: que el cliente no lea allowlist directo; que use endpoint server-side.
- Si se mantiene lectura cliente: permitir solo `get` del propio email normalizado, no `list`.

### 10. Vulnerabilidades npm

`npm audit --omit=dev --json`

`edupanel_local`:

- Total: 19
- Criticas: 1
- Altas: 3
- Moderadas: 11
- Bajas: 4

`edupanel_public`:

- Total: 9
- Criticas: 1
- Altas: 3
- Moderadas: 3
- Bajas: 2

Paquetes/advisories relevantes:

- `protobufjs`: critical, arbitrary code execution
- `next`: high, varias vulnerabilidades; fix sugerido `next@16.2.4`
- `lodash`: high, code injection/prototype pollution
- `path-to-regexp`: high, ReDoS/DoS
- `postcss`: moderate, XSS via stringify
- `quill` / `react-quill-new`: low, XSS via HTML export
- `hono`: moderate

Accion:

- Subir `next` a `16.2.4`.
- Reinstalar y revisar lockfile.
- Revisar si `react-quill-new` tiene version segura real; npm sugiere downgrade mayor a `3.7.0`, no aplicar a ciegas.
- Revisar `firebase-admin` porque npm audit sugiere un downgrade mayor raro; no aceptar automaticamente sin probar.

## Hallazgos altos

### `next.config.mjs` difiere y public oculta errores TS

`edupanel_local`:

- `ignoreBuildErrors: false`
- tiene clave `eslint`, pero Next 16 la marca invalida

`edupanel_public`:

- `ignoreBuildErrors: true`

Accion:

- En `public`, cambiar a `ignoreBuildErrors: false` antes de release.
- Quitar `eslint` de `next.config.mjs` en local; Next 16 ya no soporta esa clave.
- Configurar lint por separado.

### Lint no existe realmente

`npm run lint` falla en local:

```txt
"eslint" no se reconoce como un comando interno o externo
```

`package.json` tiene `"lint": "eslint ."`, pero no hay `eslint` en devDependencies.

Accion:

- Instalar/configurar ESLint compatible con Next 16 o cambiar script a un comando real.
- No marcar lint como checklist cumplida hasta que ejecute.

### Riesgo XSS en mensajes/HTML

En `components/edu-panel/actividades/actividades-content.tsx`, `formatChatMessageHtml` retorna el HTML original sin sanitizar si detecta tags permitidos:

```ts
if (/<(p|ul|ol|li|b|strong|em|br)\b/i.test(source)) return source
```

Luego se usa con `dangerouslySetInnerHTML`.

Riesgo: texto generado por IA, importado o pegado podria meter atributos/eventos HTML no deseados.

Accion:

- Sanitizar con una libreria tipo DOMPurify/isomorphic-dompurify.
- O no aceptar HTML entrante: convertir siempre desde texto escapado a HTML controlado.

### App Check no esta activo

`lib/firebase.ts` importa App Check pero no lo inicializa. El comentario indica que se omitio por problemas con reCAPTCHA.

Accion:

- Para alfa cerrada puede esperar, pero antes de abrir mas usuarios conviene configurar App Check real para reducir abuso desde clientes no autorizados.

### `.env.example` incompleto para deploy real

`.env.example` solo muestra variables `NEXT_PUBLIC_FIREBASE_*`.

Pero el proyecto usa tambien:

- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GROQ_API_KEY`
- `FIREBASE_ADMIN_PROJECT_ID`
- `FIREBASE_ADMIN_CLIENT_EMAIL`
- `FIREBASE_ADMIN_PRIVATE_KEY`
- `NEXT_PUBLIC_ALLOWLIST_BYPASS`

Accion:

- Crear `.env.example` mas completo sin valores reales.
- En `NEXT_PUBLIC_ALLOWLIST_BYPASS`, documentar claramente: nunca `true` en produccion.

### Versiones inconsistentes

`components/edu-panel/version.ts` difiere:

- Local: `v1.0.11`
- Public: `v1.0.12`

Accion:

- Definir version unica antes de release.
- Actualizar `version.txt` y `version.ts` de forma consistente.

## Guardados y autoguardados

### Lo bueno

- La mayoria de datos privados viven bajo `users/{uid}/...`.
- Firestore helpers usan `getUid()` y fallan si no hay usuario.
- Hay autoguardado con debounce en planificaciones, cronograma, libro de clases, rubricas/evaluacion, calificaciones, ver unidad, actividades.
- Varias pantallas tienen `beforeunload` cuando hay estado `saving_silent` o `saving`.

### Riesgos detectados

1. Muchos guardados hacen `setDoc` del documento completo, sin merge ni version.
   - Ejemplos: `guardarPlanificacion`, `guardarCronograma`, `guardarPlanCurso`, `guardarActividadClase`, `guardarRubrica`, `guardarEvaluacion`, `guardarEstudiantes`, `guardarPerfil`.
   - Riesgo: si el usuario abre dos pestanas o hay dos autosaves en paralelo, gana el ultimo write y puede pisar cambios.

2. `useAutosave` no controla saves en vuelo.
   - Si un save lento termina despues de otro cambio, puede mostrar "Guardado" aunque haya cambios nuevos pendientes.
   - No usa contador/secuencia para ignorar respuestas viejas.

3. Hay implementaciones de autosave duplicadas.
   - Algunas usan `useAutosave`.
   - Otras tienen su propio `ignoreNextSaveRef` + `setTimeout`.
   - Esto aumenta el riesgo de diferencias sutiles.

4. Dependencias de effects omitidas.
   - El hook `useAutosave` desactiva `react-hooks/exhaustive-deps`.
   - Varios effects llaman `handleGuardar` sin incluirlo como dependency.
   - Puede estar bien por pragmatismo, pero hay que revisarlo con lint real.

Accion recomendada:

- Crear un autosave comun con:
  - `lastSaveId`
  - bloqueo/cola de save en vuelo
  - estado `dirty/saving/saved/error`
  - flush manual antes de navegar
  - mensajes claros cuando falla
- Para docs importantes, guardar tambien `updatedAt` y `clientRevision`, y detectar conflicto si el doc remoto cambio desde que se cargo.

## Pruebas realizadas

### Terminal

En `edupanel_local`:

- `npm run build`: falla por JSX en `resultados-view.tsx`
- `npx tsc --noEmit --pretty false`: falla por la misma zona
- `npm run lint`: falla porque `eslint` no esta instalado
- `npm audit --omit=dev --json`: 19 vulnerabilidades

En `edupanel_public`:

- `git status --short`: limpio
- `npm run build`: no se pudo ejecutar porque no hay `node_modules`; error `"next" no se reconoce`
- `npm audit --omit=dev --json`: 9 vulnerabilidades

No ejecute `npm install`/`npm ci` en `edupanel_public` para no ensuciar la carpeta publicable con `node_modules` durante esta revision.

### Navegador local

Servidor dev detectado en `http://localhost:3000`.

Resultados:

- `/login`: carga correctamente.
- `/`: redirige a `/login` cuando no hay sesion.
- `/terminos`: carga sin login.
- `/privacidad`: carga sin login.
- `/contacto`: carga sin login.
- `/ver-unidad?...`: no redirige, muestra header y error "Usuario no autenticado".
- `/migrate`: carga sin login y muestra UI de migracion/destruccion.

No se canjeo el codigo de invitacion porque eso consume un uso y modifica la allowlist.

## Orden recomendado para manana

1. Reparar `components/edu-panel/rubricas/resultados-view.tsx`.
2. Repetir `npx tsc --noEmit --pretty false` y `npm run build` en local.
3. Decidir oficialmente que `edupanel_public` es el repo fuente para GitHub.
4. Sincronizar desde local hacia public solo los archivos de seguridad/whitelist/API necesarios.
5. Proteger o eliminar `/migrate`.
6. Proteger `/ver-unidad`.
7. Cambiar `fetch("/api/generar-clase")` restante a `apiFetch`.
8. Agregar allowlist server-side en todas las APIs privadas.
9. Hacer canje de invitaciones con transaccion/idempotencia.
10. Copiar `firebase.json` y `firestore.rules` a public, ajustando lectura de allowlist.
11. Actualizar `next` a `16.2.4` y revisar vulnerabilidades npm.
12. Configurar ESLint real.
13. En `edupanel_public`, correr `npm ci`, `npm run build`, `npm audit`.
14. Probar con navegador:
    - usuario no invitado
    - codigo de invitacion
    - usuario invitado
    - admin/invitaciones
    - generar clase IA
    - exportar Word
    - importar rubrica
    - autosave en planificacion/actividad/rubrica
15. Desplegar a Vercel solo cuando build, auth y reglas esten verdes.

## Nota sobre Git

La decision de mover `.git` a `edupanel_public` tiene sentido para este flujo. Mantiene la historia limpia y evita subir material privado por accidente. La parte delicada es que `public` quedo atrasado frente a `local`; hay que sincronizar selectivamente, no copiar la carpeta completa.
