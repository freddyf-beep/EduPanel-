# EduPanel

EduPanel es una plataforma web para planificacion docente, evaluaciones,
libro de clases, seguimiento de estudiantes y herramientas pedagogicas con IA.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS + shadcn/ui
- Firebase Auth + Firestore
- Firebase Admin para APIs server-side
- Gemini / Google GenAI para funciones IA
- Vercel como destino de despliegue

## Comandos

```powershell
npm ci
npm run dev
npm run build
npm run lint
```

La app local corre por defecto en `http://localhost:3000`.

## Variables

Copia `.env.example` como `.env.local` y completa Firebase, Firebase Admin y
Gemini. No subir `.env.local`, `.env.vercel` ni archivos de service account.

## Rutas actuales

| Ruta | Uso |
| --- | --- |
| `/` | Dashboard principal |
| `/login` | Acceso con Google |
| `/planificaciones` | Planificaciones por curso |
| `/ver-unidad` | Vista de unidad curricular |
| `/actividades` | Planificacion clase a clase |
| `/actividades-v2` | Experiencia alternativa de actividades |
| `/evaluaciones` | Pruebas, guias y editor unificado |
| `/rubricas` | Rubricas y resultados |
| `/cronograma` | Cronograma |
| `/libro-clases` | Libro de clases |
| `/calificaciones` | Registro de notas |
| `/calificaciones-v2` | Redireccion legacy hacia calificaciones |
| `/perfil` | Perfil y configuracion docente |
| `/perfil-360` | Vista integral por estudiante |
| `/soporte` | Ayuda y soporte |
| `/contacto` | Contacto |
| `/materiales-preview` | Vista previa de materiales |
| `/privacidad` | Politica de privacidad |
| `/terminos` | Terminos de uso |

## Admin

| Ruta | Uso |
| --- | --- |
| `/admin` | Panel admin |
| `/admin/usuarios` | Usuarios y permisos |
| `/admin/invitaciones` | Invitaciones |
| `/admin/establecimientos` | Establecimientos |
| `/admin/curriculum` | Curriculum |
| `/admin/mantenimiento` | Backups y salud operacional |
| `/admin/features` | Feature flags |
| `/admin/consumo-ia` | Consumo de IA |
| `/admin/predictor-cobertura` | Cobertura curricular |
| `/admin/radar-desercion` | Riesgo de desercion |
| `/admin/sustituciones` | Sugerencias de reemplazo |

## Documentos vivos

- `BACKUPS_FIRESTORE.md`: operacion de backups y restauracion.
- `DESIGN.md`: direccion visual para Pruebas y Guias.
- `DOCUMENTACION_PREMIUM_IA.md`: activacion de modulos premium IA.
- `ESPECIFICACION_RUBRICAS.md`: decisiones tecnicas del modulo rubricas.
- `CHANGELOG.md`: historial heredado del proyecto.

Los documentos de auditoria antigua, pendientes cerrados, notas de Claude y
briefs de Stitch fueron retirados para mantener una base mas limpia.
