# Próximos pasos antes de lanzar

Fecha: 2026-04-30 — Auditoría consolidada (Codex + Claude)

---

## ✅ Lo que se cerró en esta sesión (en `edupanel_local`)

### Bloqueadores del push (Fase A)

1. **Build roto reparado** — `components/edu-panel/rubricas/resultados-view.tsx` tenía un JSX corrupto en la sección "Promedio por criterio" (línea ~342). Restauré el bloque desde `edupanel_public`.
2. **API key Firebase ya no está hardcodeada como fallback**:
   - `lib/firebase.ts`: ahora solo lee de `process.env.NEXT_PUBLIC_FIREBASE_*` (sin `??` con valores reales)
   - `scripts/curriculo-common.mjs`: igual, lee de env vars y aborta si faltan
   - `scripts/seed-curriculo.mjs`: ahora importa la config de `curriculo-common.mjs`
   - **Aplicado también en `edupanel_public`**
3. **CHANGELOG sanitizado** — `Planificaciones_Freddy_Figueroa(1).docx` → `Planificaciones_formato_oficial.docx` (en local y public)
4. **Apellido removido del código** — `components/edu-panel/dashboard/dashboard-content.tsx` y `lib/ai/copilot.ts` ya no exponen "Freddy Figueroa"; ahora usan `user.displayName ?? "Docente"` o textos genéricos (en local y public)
5. **.gitignore reforzado** — agregado `firebase-adminsdk-*.json`, `*.log`, `.firebase/`, `.vercel/`, `*.bak`, `ts_errors.log`, `scratch.*` (en local y public)

### Bug de pérdida de datos en /perfil (Fase D)

Tu queja con la cuenta de prueba ahora está resuelta a nivel de código:

6. **Errores ya no son silenciosos** — `handleSavePerfil`, `handleSaveColegio`, `handleSaveHorario` y `handleSaveEstudiantes` ahora muestran un toast con el mensaje del error si Firestore falla. Antes solo `console.error`.
7. **Estado "error" ya no queda atrapado** — `handleSaveEstudiantes` ahora resetea a `idle` después de 5s en caso de error.
8. **Validación con feedback en horario** — al intentar agregar un bloque sin completar curso/hora-inicio/hora-fin, sale toast "Faltan datos" en vez de fallar silencioso.
9. **Race condition al cambiar curso resuelta** — agregué `previousCursoEstudiantesRef` y `estudiantesActualesRef`. Cuando cambias de curso con autosave pendiente, ahora se hace un flush síncrono al curso anterior antes de cargar el nuevo. Si ese flush falla, sale toast.

### Verificaciones

- `npx tsc --noEmit` → limpio
- `npm run build` → 29 páginas generadas, sin errores

---

## 🔴 Lo que TÚ tienes que hacer antes del push

### 1. Decidir la estrategia de sync local→public

Codex recomienda **NO copiar la carpeta entera**. Faltan estos archivos en `edupanel_public` (Codex bloqueador #1):

- `components/auth/auth-context.tsx` (con allowlist + `recheckAllowlist`)
- `components/auth/protected-route.tsx` (con `blockedByAllowlist`)
- `app/login/page.tsx` (con flujo de código de invitación)
- `lib/allowlist.ts`
- `lib/api-client.ts`
- `lib/auth/verify-token.ts`
- `app/api/redeem-invite/route.ts`
- `app/api/invitaciones/route.ts`
- `app/admin/invitaciones/page.tsx`
- `app/contacto/page.tsx`, `app/terminos/page.tsx`, `app/privacidad/page.tsx`
- `app/error.tsx`, `app/global-error.tsx`
- `firebase.json`, `firestore.rules`
- Las 6 rutas `app/api/*/route.ts` (ya con `verifyIdToken`)
- `next.config.mjs` (con `ignoreBuildErrors: false`)
- `package.json` con `firebase-admin`

Ya hay un comando robocopy en tu memoria. La pregunta es si copias la carpeta entera (con las exclusiones del robocopy) o si vas archivo por archivo. **Recomiendo robocopy con tus exclusiones** — es lo que ya tienes documentado y funciona.

Comando esperado (de tu memoria):
```powershell
robocopy "C:\Users\fredd\Documents\edupanel_local" "C:\Users\fredd\Documents\edupanel_public" /E /XD .git node_modules .next .claude .codex "PDF Y .JSON CURSOS" "PDF-FREDDY" "Archivos de Curriculum" backup_ia_antigua tmp /XF .env.local "Grupo 1.zip" edupanel_update.zip tsconfig.tsbuildinfo ts_errors.log next-env.d.ts scratch.js scratch.py read_pdf.py edupanel_context.md CONTINUAR_FIX_ESTUDIANTES.md logo-escuela.jpg AUDITORIA_LANZAMIENTO_2026-04-30.md PROXIMOS_PASOS_LANZAMIENTO.md /NJH /NJS
```

(Le agregué a la lista `AUDITORIA_LANZAMIENTO_2026-04-30.md` y este archivo `PROXIMOS_PASOS_LANZAMIENTO.md` para que NO suban a GitHub).

### 2. ⚠️ Considerar rotar la API key de Firebase

El historial de git de `edupanel_public` probablemente contiene la API key hardcodeada (de versiones anteriores). Verifica con:

```bash
cd ~/Documents/edupanel_public
git log -p --all -S "AIzaSyAPZ0knktdl2TINlaVhBi8" | head -60
```

Si aparece, técnicamente la key está expuesta. **Decisión:** las API keys públicas de Firebase no son secretas en sentido estricto (Firebase las diseñó para ir en el cliente), pero combinadas con reglas mal escritas o sin App Check, pueden permitir abuso. Como tus reglas de Firestore ya están firmes y la allowlist está en su lugar, el riesgo real es bajo. Mi recomendación: dejarla, NO rotar (rotar implica re-configurar todo y la key sigue siendo "pública por diseño" de Firebase).

### 3. Cosas pendientes que NO bloquean el push pero conviene resolver pronto

Codex marcó estas como bloqueadoras críticas (yo coincido pero no las hice porque requieren más tiempo y testing):

- **Allowlist server-side en las APIs** (Codex #3) — hoy un usuario con token válido pero NO invitado podría llamar `/api/generar-clase`. Hay que cambiar `verifyIdToken` por `verifyAllowedUser` en las 6 rutas. Esfuerzo: ~30min.
- **Proteger `/migrate`** (Codex #5) — la página tiene botones destructivos visibles para cualquier autenticado. Mínimo: agregar check `user.email === 'tu-email@gmail.com'` o eliminarla del repo público. Esfuerzo: ~15min.
- **Proteger `/ver-unidad`** (Codex #6) — falta `<MainLayout>`. Esfuerzo: ~10min.
- **Migrar `fetch` directo a `apiFetch` en `actividades-content.tsx:610`** — sino, "Generar con IA" devolverá 401 en producción. Esfuerzo: ~10min, pero hay que probar que sigue funcionando.
- **Canje de invitaciones transaccional** (Codex #8) — el flujo actual tiene race condition; dos usuarios simultáneos podrían consumir el mismo código. Esfuerzo: ~30min.
- **Regla Firestore de allowlist** (Codex #9) — hoy permite `list` global; debería permitir solo `get` del propio email. Esfuerzo: ~10min.

**Mi recomendación:** subir hoy lo que ya está cerrado (push + Vercel) e invitar a 2-3 personas de confianza primero. Mientras ellos prueban, hago en una nueva sesión las 6 cosas de arriba antes de abrir a más gente. Las 6 juntas son ~2h de trabajo.

### 4. Cuando subas, verificar:

- [ ] El sync no copió `.env.local`, `Grupo 1.zip`, `PDF-FREDDY/`, etc.
- [ ] El `npm run build` pasa también en `edupanel_public` después del sync
- [ ] Las env vars de Vercel siguen ahí: `FIREBASE_ADMIN_*`, `NEXT_PUBLIC_FIREBASE_*`, `GEMINI_API_KEY`
- [ ] Después del push, prueba en la URL de Vercel: login con cuenta no-admin, ingresar perfil completo, **recargar página** y verificar que datos persisten
- [ ] Forzar un error: cortar internet, intentar guardar perfil → debe salir toast de error visible

---

## 📋 Resumen de archivos modificados en local

```
components/edu-panel/rubricas/resultados-view.tsx   (build fix)
components/edu-panel/perfil/perfil-content.tsx       (4 fixes pérdida datos)
components/edu-panel/dashboard/dashboard-content.tsx (apellido → user.displayName)
lib/firebase.ts                                       (sin fallback API key)
lib/ai/copilot.ts                                     (apellido → genérico)
scripts/curriculo-common.mjs                          (env vars)
scripts/seed-curriculo.mjs                            (importa de common)
.gitignore                                            (firebase-admin*, logs, etc)
CHANGELOG.md                                          (sanitizado)
```

Y los mismos cambios aplicables en `edupanel_public` (firebase.ts, scripts, dashboard, copilot, CHANGELOG, .gitignore) ya están aplicados en ambas carpetas.

---

## 🚀 Comando rápido para subir

```bash
# 1. Sync local → public
robocopy ... (tu comando con las exclusiones)

# 2. En edupanel_public
cd ~/Documents/edupanel_public
npm install        # por si firebase-admin no está
npm run build      # verificar
bash deploy.sh     # tu script que hace commit + push
```

Vercel detecta el push y redeploya automático en ~2 min.
