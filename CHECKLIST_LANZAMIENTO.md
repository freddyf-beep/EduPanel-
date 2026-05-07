# Checklist de Lanzamiento — EduPanel Alfa Cerrada

Fecha base: 2026-04-29

Este archivo lista exactamente qué falta para abrir la app a tu grupo pequeño.
La mayor parte del trabajo de **código** ya está hecho — lo que queda es
**configuración de Firebase + Vercel**.

---

## ✅ Lo que ya quedó hecho en esta sesión

- [x] **`firestore.rules`** creado con aislamiento por usuario + allowlist + bloqueo por defecto
- [x] **`lib/auth/verify-token.ts`** — verifica Firebase ID Token en API routes
- [x] **`lib/api-client.ts`** — `apiFetch()` wrapper que añade `Authorization: Bearer <token>` automáticamente
- [x] **`lib/allowlist.ts`** — helper `isEmailAllowed(email)` con bypass de desarrollo
- [x] **Allowlist enforcement en `auth-context.tsx`** — emails no invitados son expulsados
- [x] **Las 6 rutas `/api/*` protegidas** con `verifyIdToken`:
  - `/api/generar-clase` (+ rate limit 30/h por uid)
  - `/api/export-planificacion`
  - `/api/parse-rubrica`
  - `/api/import-rubrica`
  - `/api/export-rubrica`
  - `/api/distribuir-oas`
- [x] **`app/login/page.tsx`** muestra mensaje cuando email está fuera de allowlist + links a Términos/Privacidad/Contacto
- [x] **Páginas legales** `/terminos`, `/privacidad`, `/contacto` (Ley 19.628 Chile)
- [x] **`app/error.tsx`** + **`app/global-error.tsx`** — error pages amigables
- [x] **`next.config.mjs`** — `ignoreBuildErrors: false` (build estricto)
- [x] **`firebase-admin`** instalado
- [x] **`npx tsc --noEmit`** pasa sin errores

---

## 🔴 Antes de desplegar — pasos manuales obligatorios

### 1. Editar `firestore.rules` con tu email real

En el archivo `firestore.rules`, reemplazar:

```js
&& request.auth.token.email == 'freddy.figueroa@example.com';
```

con tu email real de Google. Aparece **2 veces** (currículo + allowlist).

### 2. Generar credenciales Firebase Admin (Service Account)

1. Ir a Firebase Console → **Configuración del proyecto** → pestaña **Cuentas de servicio**
2. Click en **Generar nueva clave privada** → descarga un JSON
3. Del JSON, copiar 3 campos:
   - `project_id`
   - `client_email`
   - `private_key` (con `\n` literales)

### 3. Configurar variables de entorno en Vercel

En el dashboard de Vercel del proyecto → Settings → Environment Variables, agregar:

| Variable | Valor |
|---|---|
| `FIREBASE_ADMIN_PROJECT_ID` | `edupanel-bf5cb` |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | (del JSON) |
| `FIREBASE_ADMIN_PRIVATE_KEY` | (del JSON, el string completo con `\n`) |
| `GEMINI_API_KEY` | (tu API key de Gemini si quieres mantener el modo "Público gratis") |

**Importante:** la `FIREBASE_ADMIN_PRIVATE_KEY` debe pegarse tal cual aparece en el JSON
(con los `\n` literales). El código en `verify-token.ts` los reemplaza por saltos reales.

### 4. Desplegar las reglas de Firestore

```bash
# Si no tienes firebase CLI
npm install -g firebase-tools
firebase login

# Desplegar reglas
firebase deploy --only firestore:rules --project edupanel-bf5cb
```

### 5. Sembrar el allowlist con los primeros invitados

En Firestore Console (consola web), crear documentos en la colección `allowlist`:

- ID del documento: el **email en minúsculas** (ej: `juan.perez@gmail.com`)
- Campos:
  - `invitedAt`: timestamp (now)
  - `invitedBy`: tu email
  - `nombre`: nombre del docente

Empezar agregándote a ti mismo para poder probar.

### 6. (Opcional) Bypass de allowlist en desarrollo local

En `.env.local` agregar:

```
NEXT_PUBLIC_ALLOWLIST_BYPASS=true
```

Esto permite entrar con cualquier email en localhost sin tocar Firestore. **NO** poner
esa variable en Vercel.

---

## 🟠 Trabajo pendiente (post-lanzamiento o si tienes tiempo)

Estos NO son bloqueadores para la alfa cerrada pero suman calidad:

### Bugs reportados sin verificar
- [ ] **DOCX export** — confirmar que funciona con la planificación real de Freddy (4° Básico Música). Probar en `/planificaciones` → botón Descargar
- [ ] **3 bugs estudiantes** documentados en `CONTINUAR_FIX_ESTUDIANTES.md`:
  - Auto-save de perfil
  - Estudiantes fantasma en perfil-360
  - Normalización inconsistente de cursoId
- [ ] **Bug cronograma**: enlace "Ver clase" hardcoded a `unidad_1` (líneas 397, 486 de `cronograma-content.tsx`)

### Mejoras sugeridas
- [ ] Onboarding wizard `/bienvenida` para nuevos docentes (3 pasos: perfil → cursos → tour)
- [ ] Sentry o Vercel Analytics activo
- [ ] Página `/admin/invitados` para gestionar allowlist sin ir a Firebase Console
- [ ] Migrar todas las llamadas `fetch('/api/...')` del cliente a usar `apiFetch()` del nuevo `lib/api-client.ts`
  - Si no se hace: las llamadas seguirán fallando con 401 hasta que se actualicen
  - **Buscar:** `grep -r "fetch.*api/" components/`

### Diferido al post-lanzamiento (del plan integral 2026-04-28)
- [ ] Fase B: integraciones cruzadas (rúbricas↔calificaciones)
- [ ] Fase C: lógica pedagógica (autorelleno OAs, evaluaciones↔OAs)
- [ ] Fase D: creatividad (drawer "Hoy", alertas D67, termómetro, resumen semanal, command palette)
- [ ] Fase E: calendario Mes/Semana/Día + Google Calendar push

---

## 🧪 Verificación end-to-end pre-lanzamiento

Antes de mandar el link a los invitados, ejecutar esta checklist:

1. [ ] `npm run build` pasa sin errores
2. [ ] Crear cuenta de prueba con un email que NO esté en allowlist → debe ver mensaje "Aún no tienes acceso" y NO entrar
3. [ ] Agregar el email al allowlist → recargar → debe entrar normal
4. [ ] `curl -X POST https://<tu-url>.vercel.app/api/generar-clase` (sin token) → debe retornar `401 Unauthorized`
5. [ ] Crear planificación con usuario A, salir, entrar con usuario B → B no ve datos de A
6. [ ] DOCX export funcionando (si no, reportar bug)
7. [ ] Móvil: abrir en celular, navegar entre secciones, sidebar colapsa
8. [ ] Páginas /terminos y /privacidad cargan sin login
9. [ ] Forzar URL inexistente → 404 page custom (no crash)
10. [ ] En Firebase Console intentar leer `users/<otro-uid>/...` desde la consola del navegador → permission denied

---

## ⚠️ Riesgo conocido — llamadas fetch sin apiFetch

Las páginas/componentes que ya hacen `fetch('/api/...')` directamente **van a empezar a
fallar con 401** porque ahora todas las rutas API exigen `Authorization: Bearer <token>`.

**Acción:** buscar y migrar:

```bash
grep -rn "fetch.*'/api/" components/ app/ --include="*.tsx" --include="*.ts"
```

Reemplazar por `apiFetch` de `@/lib/api-client`. Esto es **crítico** o ningún botón de
"Generar con IA", "Exportar Word", "Importar rúbrica" funcionará.

---

## Archivos creados/modificados en esta sesión

**Creados:**
- `firestore.rules`
- `lib/auth/verify-token.ts`
- `lib/api-client.ts`
- `lib/allowlist.ts`
- `app/terminos/page.tsx`
- `app/privacidad/page.tsx`
- `app/contacto/page.tsx`
- `app/error.tsx`
- `app/global-error.tsx`
- `CHECKLIST_LANZAMIENTO.md` (este archivo)

**Modificados:**
- `next.config.mjs` (ignoreBuildErrors: false)
- `components/auth/auth-context.tsx` (allowlist check)
- `app/login/page.tsx` (links legales + mensaje de bloqueo)
- `app/api/generar-clase/route.ts` (auth + rate limit)
- `app/api/export-planificacion/route.ts` (auth)
- `app/api/parse-rubrica/route.ts` (auth)
- `app/api/import-rubrica/route.ts` (auth)
- `app/api/export-rubrica/route.ts` (auth)
- `app/api/distribuir-oas/route.ts` (auth)

**Dependencias agregadas:**
- `firebase-admin`
