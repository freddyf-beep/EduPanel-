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

Las variables de Firebase, Firebase Admin, Gemini y servicios de Google se
configuran fuera del repositorio, en el entorno local privado o en Vercel. No
subir archivos `.env*`, service accounts, claves ni tokens.

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

## Documentos vivos

- `DESIGN.md`: direccion visual para Pruebas y Guias.
- `ESPECIFICACION_RUBRICAS.md`: decisiones tecnicas del modulo rubricas.
- `CHANGELOG.md`: historial heredado del proyecto.

Los documentos de auditoria, operacion interna, backups y configuracion privada
se mantienen fuera del repositorio publico.
