# EduPanel — Contexto para Claude

Plataforma web para profesores chilenos de música (K-12). Next.js 15 + App Router + TypeScript + Firebase Firestore + Tailwind CSS v4.

## Stack técnico
- **Framework**: Next.js 15.3 con App Router y Turbopack  
- **UI**: React 19.2, Tailwind CSS v4, lucide-react, shadcn/ui parcial  
- **Backend**: Firebase Firestore (cliente), Firebase Auth  
- **Gráficos**: Recharts (ya instalado)  
- **IA (BYOK)**: proveedor configurable en `localStorage.eduAiConfig` → `{ provider, token, model, endpoint }`  
- **Exportación**: mammoth (DOCX → texto), docx (generación Word)  
- **Dev server**: `npm run dev` → http://localhost:3000  

---

## Estructura Firestore
Todos los datos del usuario viven bajo `users/{uid}/`:

```
users/{uid}/
  ├── perfil/                    → datos del profesor (nombre, tipo, etc.)
  ├── horario_semanal/           → bloques de clases (resumen=nombreCurso, color)
  ├── planificaciones_curso/     → unidades por asignatura+curso
  ├── clases/                    → clases planificadas
  ├── calificaciones/            → notas por alumno
  ├── estudiantes/               → lista de alumnos por curso
  ├── rubricas/                  → plantillas de rúbricas (RubricaTemplate)
  └── rubricas_evaluaciones/     → evaluaciones aplicadas (EvaluacionRubrica)
```

Helpers compartidos en `lib/curriculo.ts`:
- `userDoc(colección, id)` → ref a `users/{uid}/colección/id`  
- `userCol(colección)` → ref a `users/{uid}/colección`  
- `normalizeKeyPart(texto)` → slug para IDs  

---

## Patrones de código establecidos

### Shell con useSearchParams (rutas internas)
```tsx
// app/alguna-pagina/page.tsx
export default function Page() {
  return <Suspense><AlgunaShell /></Suspense>
}
// components/.../alguna-shell.tsx
const view = useSearchParams().get("view")
if (view === "detalle") return <DetalleView />
return <HubDefault />
```

### URLs con asignatura activa
```tsx
import { buildUrl, withAsignatura } from "@/lib/shared"
import { useActiveSubject } from "@/hooks/use-active-subject"
const { asignatura } = useActiveSubject()
const href = buildUrl("/rubricas", withAsignatura({ view: "evaluacion", rubricaId: id }, asignatura))
```

### Auto-save con debounce 2.5s
```tsx
const ignoreNextSaveRef = useRef(true)  // evita guardar en el primer render
useEffect(() => {
  if (ignoreNextSaveRef.current) { ignoreNextSaveRef.current = false; return }
  const t = setTimeout(() => guardar(datos), 2500)
  return () => clearTimeout(t)
}, [datos])
```

### Fórmula de nota chilena
```ts
nota = Math.max(1.0, Math.min(7.0, parseFloat((1 + (6 * puntaje) / puntajeMax).toFixed(1))))
```

---

## Módulos activos

### 1. Módulos / Planificaciones (`/modulos`, `/planificaciones`)
Unidades didácticas organizadas por asignatura y curso. Cada unidad tiene clases planificadas.

### 2. Cronograma (`/cronograma`)
Horario semanal del profesor.

### 3. Libro de clases (`/libro-clases`)
Registro de asistencia.

### 4. Calificaciones (`/calificaciones`)
Notas por alumno con columnas configurables.

### 5. 🆕 Rúbricas de Evaluación (`/rubricas`)
**NUEVO** — Implementado en sesión 2025-01. Reemplaza el flujo de 26 Word individuales por una evaluación interactiva.

#### Archivos
| Archivo | Descripción |
|---------|-------------|
| `lib/rubricas.ts` | Tipos TS, helpers Firestore, `calcularNota()`, `sincronizarConCalificaciones()`, constantes UI (`NIVEL_META`, `NIVEL_ORDER`) |
| `app/api/parse-rubrica/route.ts` | API POST: recibe .docx, usa mammoth → parser heurístico → fallback IA (BYOK) |
| `app/rubricas/page.tsx` | Suspense wrapper |
| `components/edu-panel/rubricas/rubricas-shell.tsx` | Router: `view=import\|crear\|evaluacion\|resultados` → hub por defecto |
| `components/edu-panel/rubricas/rubricas-hub.tsx` | Lista rúbricas del curso, botones "Importar Word" y "Crear desde cero" |
| `components/edu-panel/rubricas/rubrica-card.tsx` | Tarjeta: partes/criterios/pts, botones Evaluar/Resultados/Eliminar |
| `components/edu-panel/rubricas/rubrica-import.tsx` | Drag & drop DOCX **o** editor vacío (`mode="blank"`). Incluye agregar/eliminar partes y criterios |
| `components/edu-panel/rubricas/criterio-row.tsx` | 4 botones nivel (verde/azul/ámbar/rojo) con tooltip descriptor, deseleccionable |
| `components/edu-panel/rubricas/evaluacion-view.tsx` | 3 paneles: alumnos por grupo, criterios del alumno activo, scoreboard. Auto-save 2.5s |
| `components/edu-panel/rubricas/resultados-view.tsx` | Stats, histograma Recharts, tabla por criterio, tabla alumnos, sync con Calificaciones |

#### Firestore schema
```
users/{uid}/rubricas/{id}            → RubricaTemplate (plantilla maestra)
users/{uid}/rubricas_evaluaciones/{id} → EvaluacionRubrica (puntajes por alumno)
```

#### Flujo
1. Profesor sube UN solo Word → `parse-rubrica` extrae template (heurística primero, IA como fallback)
2. Revisa/edita criterios en preview → Guarda como `RubricaTemplate`
3. "Evaluar" → carga alumnos de Firestore → selecciona nivel por criterio → nota en tiempo real
4. "Resultados" → distribución, histograma, sync opcional con `/calificaciones`

#### Parser DOCX (importante)
El parser heurístico detecta headers con formato `(4 pts) Logrado` (no solo "Logrado").
Detecta filas colspan como separadores de parte: `PARTE 1: ... (OA 2 y OA 4)` → extrae OAs automáticamente.

#### Puntos de acceso al módulo
- Sidebar → "Rúbricas" (después de Calificaciones)
- Ver Unidad → card "Rúbricas de la unidad" → botones Nueva / Ver todas
- URL directa: `/rubricas?view=crear&curso=X`

### 6. Perfil 360 (`/perfil-360`)
### 7. Soporte (`/soporte`)
### 8. Mi Perfil (`/perfil`)

---

## Sidebar — orden de ítems
```
Inicio / Módulos / Mis planificaciones
── Herramientas ──
Cronograma / Libro de clases / Calificaciones / Rúbricas / Perfil 360 / Ayuda / Mi Perfil
── Mis cursos ──  (cargados de horario_semanal)
```

---

## Convenciones de estilo
- Bordes redondeados: `rounded-[10px]` (cards menores) / `rounded-[14px]` (cards principales)
- Color primario rosa: clase `bg-primary`, `text-primary`, `bg-pink-light`
- Texto pequeño: `text-[13px]`, labels: `text-[12px]`, micro: `text-[11px]`
- Botón primario: `bg-primary text-primary-foreground hover:opacity-90`
- Botón outline: `border border-border hover:bg-muted/60`
- Cards: `bg-card border border-border rounded-[14px] p-5`

---

## Notas importantes
- **mammoth** debe estar instalado: `npm install mammoth` (necesario para parse-rubrica API)
- Los `undefined` se eliminan antes de `setDoc()` en Firestore (Firestore rechaza undefined)
- La fórmula de nota usa escala chilena: mínimo 1.0, máximo 7.0, se aprueba con 4.0
- El ID de evaluación se construye como `"eval_" + rubricaId`
- `normalizeKeyPart` viene de `lib/shared.ts` (no de curriculo.ts directamente)
