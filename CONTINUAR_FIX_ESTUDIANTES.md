# Continuar: Fix Base de Estudiantes

**Fecha de corte**: 2026-04-23
**Plan completo**: `C:\Users\fredd\.claude\plans\create-un-plan-en-goofy-avalanche.md`

---

## TL;DR — 3 bugs a arreglar

1. **Perfil no guarda** estudiantes al agregar (necesita auto-save).
2. **Perfil 360 muestra alumnos fantasma** (merge con libro-clases/calif viejos).
3. **Normalización de `cursoId` inconsistente** entre `lib/estudiantes.ts` y el resto (frágil a futuro).

Fuente única de verdad: `users/{uid}/estudiantes/{cursoId}` — se lee desde `cargarEstudiantes(curso)` en `lib/estudiantes.ts`.

---

## Archivos y cambios (en orden de ejecución)

### ✅ Fase 1 — `lib/shared.ts`: agregar `buildCursoId`
```ts
export function buildCursoId(curso: string): string {
  return normalizeKeyPart(curso)
}
```

### ✅ Fase 2 — `lib/estudiantes.ts`: fallback legacy + usar `buildCursoId`
Reemplazar la normalización local (`curso.toLowerCase().replace(/[^a-z0-9]/g, "_")`) por `buildCursoId(curso)`.
En `cargarEstudiantes`, intentar primero el id nuevo, si no existe probar el id legacy:
```ts
function legacyCursoId(curso: string) {
  return curso.toLowerCase().replace(/[^a-z0-9]/g, "_")
}
// En cargarEstudiantes:
const newId = buildCursoId(curso)
let snap = await getDoc(doc(db, col, newId))
if (!snap.exists()) {
  const oldId = legacyCursoId(curso)
  if (oldId !== newId) snap = await getDoc(doc(db, col, oldId))
}
```
En `guardarEstudiantes`, siempre escribir con `buildCursoId(curso)`.

### ⬜ Fase 3 — `components/edu-panel/perfil/perfil-content.tsx`: auto-save en tab Estudiantes
Copiar el patrón de `calificaciones-content.tsx` líneas 109–139. Ver detalle exacto en el plan principal §Fase 3. Agregar:
- `ignoreNextSaveRef` para evitar save en primer render / cambio de curso.
- `saveStatus: "idle"|"saving"|"saved"|"error"` con indicador junto al título.
- `useEffect([estudiantes, cursoEstudiantes])` con `setTimeout` 2500 ms.
- Mantener botón "Guardar Estudiantes" como respaldo (ya existe, sin cambios).

### ⬜ Fase 4 — `components/edu-panel/perfil-360/perfil-360-content.tsx`: sacar fantasmas
Reemplazar el `useEffect` de líneas 103–189: la fuente de identidades debe ser **solo** `estDocs` (de `cargarEstudiantes`). Ver detalle en el plan principal §Fase 4.
- Borrar las ramas que hacen `mapa.set(a.nombre, {...})` desde calif (líneas 116–133) y libro-clases (154–171).
- Dejar libro-clases **solo** para sumar asistencia a los alumnos que ya están en el mapa.

### ⬜ Fase 5 (opcional) — `calificaciones-content.tsx`: poda automática
Actualmente líneas 67–100 ya hacen `estDocs.map(...)` como base, así que probablemente NO requiere cambio. Verificar que el próximo `setDoc` escriba la lista podada.

---

## Verificación (al terminar)

1. `npm run dev` → `/perfil` → agregar alumno → esperar 3 s → recargar → persiste.
2. Alumno aparece en `/calificaciones`, `/libro-clases`, `/perfil-360`, `/rubricas`.
3. Borrar alumno en `/perfil` → recargar `/perfil-360` → ya no está.
4. DevTools Offline → agregar alumno → banner "Error al guardar".
5. `npx tsc --noEmit` sin errores.

---

## Estado al corte de esta sesión

Marcar las fases según avance. Ver al final de este archivo la sección "LOG" para notas incrementales.

## LOG

(Se completa a medida que se avanza en esta sesión y en futuras.)
