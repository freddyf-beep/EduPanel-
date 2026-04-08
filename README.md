# EduPanel 📚

Plataforma de planificación educativa para profesores, inspirada en Lirmi. Desarrollada para Freddy Figueroa, Profesor de Música.

## Stack
- **Frontend**: Next.js 16 + TypeScript + TailwindCSS + shadcn/ui
- **Base de datos**: Firebase Firestore
- **Fuente**: Plus Jakarta Sans
- **Hosting**: Vercel

## Páginas
| Ruta | Descripción |
|------|-------------|
| `/` | Dashboard — clases del día, horario, acciones rápidas |
| `/planificaciones` | Lista de planificaciones por curso |
| `/planificacion-anual` | Matriz curricular anual con fechas por unidad |
| `/ver-unidad` | Detalle de unidad: OA, habilidades, cronograma, actividades |
| `/actividades` | Planificación clase a clase (inicio/desarrollo/cierre) |
| `/cronograma` | Cronograma semanal con filtros por curso y unidad |
| `/libro-clases` | Libro de clases digital con asistencia por bloque |
| `/calificaciones` | Registro de notas por curso y evaluación |
| `/perfil-360` | Vista integrada por estudiante (notas + asistencia) |
| `/modulos` | Acceso a módulos externos |
| `/soporte` | Centro de ayuda |

## Setup local
```bash
npm install
npm run dev
```

## Deploy en Vercel
1. Sube el repositorio a GitHub
2. Conecta en vercel.com → "Add New Project"
3. Agrega las variables de entorno de Firebase (ver `.env.example`)
4. Deploy automático

## Variables de entorno
Copia `.env.example` como `.env.local` y completa los valores de Firebase.

## Cursos
1° A · 2° A · 2° B · 3° · 4° · Taller 1er Ciclo · Taller 2do Ciclo

## Año lectivo
2026 — Horario vigente hasta 12/06/2026
