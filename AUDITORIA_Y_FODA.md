# Auditoría de Sistema, Feature Flags y Matriz FODA

Este documento recopila la evaluación del estado actual del repositorio principal de EduPanel (`edupanel_local`), los controles de calidad implementados, el mapeo de feature flags y el estado de la integración con servicios Cloud de Google.

---

## 1. Matriz FODA (SWOT Analysis)

| Fortalezas (F) | Oportunidades (O) |
| :--- | :--- |
| **Arquitectura Desacoplada**: El backend está implementado sobre API routes de Next.js, lo que facilita cambiar proveedores de IA o de base de datos sin afectar la interfaz.<br>**Fallback de Datos**: Soporte robusto para fallbacks offline y cargas simuladas en entornos donde Firebase-admin no está disponible.<br>**Control de Costos de IA**: Se implementó una verificación y registro de uso de cuota mensual por token en Firestore, previniendo facturaciones descontroladas de API keys. | **Integración de Modelos Locales/Open Source**: Posibilidad de usar endpoints compatibles con OpenAI (ollama, LM Studio o vLLM) para entornos auto-hospedados.<br>**Respaldos Automatizados**: Programación de tareas automáticas para respaldos de Firestore en Google Drive, atrayendo a instituciones con estrictas políticas de backup corporativo.<br>**Personalización Curricular**: Habilidad de extenderse a cualquier asignatura o nivel de forma dinámica. |
| **Debilidades (D)** | **Amenazas (A)** |
| **Poder de Cómputo del Servidor Local**: Dependencia del hardware del cliente para el desarrollo local; Next.js compilando con Turbopack o Webpack puede tener consumos altos de memoria.<br>**Variables de Entorno Complejas**: Gran cantidad de configuraciones y API keys requeridas (`.env.local`) que pueden complicar el despliegue inicial para desarrolladores novicios. | **Latencia de Red e IA**: Tiempos de respuesta prolongados de los LLMs en conexiones móviles o saturadas.<br>**Consumo de Tokens por Retries/Repairs**: El reintento de prompts cuando la salida JSON es inválida duplica el consumo de tokens. (Mitigado mediante el nuevo tracking acumulativo de tokens). |

---

## 2. Feature Flags y Control de Características

Las características se clasifican según su costo operativo y complejidad técnica en tres niveles principales:

### Grupo 1: Costo Cero (Funcionalidades Básicas y Offline)
* **Estado**: Completamente operativo y activo en local.
* **Características**:
  - **Manejo Curricular Local**: Lectura y selección de asignaturas, unidades, Objetivos de Aprendizaje (OA), habilidades, conocimientos y actitudes cargados desde archivos estáticos locales.
  - **Edición Manual de Unidades**: Modificación de propósitos, objetivos del profesor, indicadores curriculares y agregar actividades/clases personalizadas.
  - **Descargas en Word (DOCX)**: Exportación de planificaciones y unidades directamente desde el cliente en formato `.docx`.

### Grupo 2: Costo Bajo / Intermedio (Integración Local y Drive)
* **Estado**: Opcional, requiere autenticación o APIs específicas.
* **Características**:
  - **Sincronización con Google Drive**: Sincronización automática de cambios de planificación de unidades (JSON) y subida de archivos Word/PDF autogenerados en carpetas compartidas de Drive.
  - **IA con API Key Personal**: Habilidad de que cada usuario ingrese su propia API key de OpenAI/Gemini/Anthropic en los ajustes para no consumir saldo de la plataforma.

### Grupo 3: Premium / Cloud Avanzado (Servicios de Producción)
* **Estado**: Requiere credenciales de Google Cloud habilitadas y base de datos activa.
* **Características**:
  - **Planificación de Unidades y Clases con IA de EduPanel**: Generación y reparación pedagógica de planes semanales mediante llamadas centralizadas de Gemini/OpenAI con control de cuota mensual por usuario.
  - **Generación de Evaluaciones / Rúbricas**: Creación de pruebas personalizadas, pautas de evaluación y listas de cotejo guiadas por el Copilot de evaluaciones.
  - **Respaldos de Datos Programados**: Agente cron que realiza respaldos regulares de Firestore y los transfiere a Drive.

---

## 3. Estado de Módulos e Integración con Google Cloud

A continuación se detalla la conectividad de los módulos de IA y bases de datos con Google Cloud:

| Módulo | Endpoint de API | Tipo de Conexión | Estado de Integración |
| :--- | :--- | :--- | :--- |
| **Planificador de Clases** | `/api/generar-clase` | Google Cloud Vertex AI / Gemini API | **Activo** (Soporta cuotas e incremento en Firestore `ai_usage_stats/{uid}`) |
| **Copilot de Evaluaciones** | `/api/generar-evaluacion` | Google Cloud Vertex AI / Gemini API | **Activo** (Soporta cuotas e incremento en Firestore `ai_usage_stats/{uid}`) |
| **Creador de Rúbricas** | `/api/parse-rubrica` | OpenAI API / Gemini API | **Activo** |
| **Importador de Evaluaciones** | `/api/import-rubrica` | OpenAI / Gemini | **Activo** |
| **Agente de Respaldo de Datos** | `/api/admin/backups` | Firebase Admin SDK + Google Drive API | **Activo** |
| **Buscador Pedagógico Semántico** | `/api/pedagogical-search` | Vector Embeddings en Vertex AI | **En Desarrollo** |

---

## 4. Control de Calidad de QA (Checklist de Smoke Test)

El script automatizado `scripts/smoke-test.mjs` valida los siguientes aspectos críticos para despliegues:

1. **Estructura del Repositorio**: Comprobación de que todos los archivos de rutas críticas, helpers de cuotas de IA, y hooks corregidos existan.
2. **Seguridad de Tipos (TypeScript)**: Ejecución de `tsc --noEmit` para asegurar compatibilidad estricta.
3. **Compilación de Producción (Next.js Build)**: Proceso de optimización de assets estáticos y empaquetamiento del servidor Next.js para asegurar cero fallos de importaciones o sintaxis.
