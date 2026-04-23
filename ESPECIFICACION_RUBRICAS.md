# Especificación Técnica: Mejoras de Rúbricas

## Objetivo
Mejorar el módulo de rúbricas para que respete la estructura real de las evaluaciones del profesor, permita configurar grupos de forma usable y conecte la información importada con la base curricular existente.

## Problemas actuales detectados
1. La importación no siempre separa correctamente las partes o etapas de la rúbrica.
2. Se pierde o no se interpreta bien el nombre de cada parte.
3. Los criterios pueden quedar agrupados en una sola parte, aunque en el Word estén divididos.
4. El orden original de partes y criterios no está garantizado.
5. Al evaluar, los estudiantes no siempre aparecen ni quedan asignados a grupos de manera útil.
6. La vista de evaluación muestra toda la rúbrica junta, en vez de dividirla por etapa.
7. La importación no rescata de forma estructurada objetivos, indicadores y objetivos transversales ubicados antes de la tabla.
8. No existe configuración editable de cantidad y nombre de grupos desde la rúbrica.
9. La rúbrica aún no aprovecha la conexión con la base curricular.

## Alcance de esta mejora
La mejora se divide en cuatro bloques:

1. Importación y estructura real de la rúbrica.
2. Configuración de grupos y carga de estudiantes.
3. Evaluación por pestañas según etapas.
4. Metadatos curriculares e integración con base curricular.

## Cambios funcionales esperados

### 1. Importación de Word
El sistema debe:

1. Detectar correctamente cada parte o etapa de la rúbrica.
2. Conservar el nombre original de cada parte.
3. Mantener el orden en que aparecen las partes en el Word.
4. Mantener el orden de los criterios dentro de cada parte.
5. Importar bloques previos a la tabla, incluyendo:
   - objetivos
   - indicadores
   - objetivos transversales
6. Guardar esos bloques como datos editables, no solo como texto plano temporal.
7. Si una parte no tiene nombre reconocible, crear un nombre de respaldo como `Parte 1`, `Parte 2`, etc., sin mezclar criterios.

### 2. Configuración de grupos
Desde la vista de edición de la rúbrica debe ser posible:

1. Elegir la cantidad de grupos.
2. Editar el nombre de cada grupo.
3. Usar esa configuración luego al crear o abrir la evaluación.
4. Crear la evaluación usando los grupos definidos por la rúbrica, no una plantilla fija.

### 3. Evaluación por pestañas
La evaluación debe:

1. Mostrar estudiantes cargados del curso correspondiente.
2. Permitir asignar o mover estudiantes entre grupos fácilmente.
3. Mostrar cada parte o etapa como una pestaña.
4. Al cambiar de pestaña, mostrar solo los criterios de esa etapa.
5. Mantener la nota, puntaje y observaciones del alumno en tiempo real.
6. No bloquear la evaluación si aún no hay grupos perfectamente organizados.

### 4. Integración curricular
La rúbrica debe poder:

1. Guardar objetivos, indicadores y objetivos transversales importados.
2. Mostrar esos elementos en edición para corrección manual.
3. Vincular esos elementos con la base curricular ya cargada en la base de datos.
4. Permitir que un elemento quede:
   - vinculado automáticamente
   - vinculado manualmente
   - sin vincular, pero guardado como texto importado

## Propuesta de cambios al modelo de datos

### Nuevos tipos sugeridos

```ts
interface RubricaGrupoConfig {
  id: string
  nombre: string
  orden: number
}

interface RubricaMetadatosCurriculares {
  objetivos: string[]
  indicadores: string[]
  objetivosTransversales: string[]
}

interface VinculoCurricular {
  tipo: "objetivo" | "indicador" | "objetivoTransversal"
  textoOriginal: string
  entidadId?: string
  entidadNombre?: string
  origen: "importado" | "manual" | "sugerido"
}
```

### Extensiones sugeridas

```ts
interface RubricaParte {
  id: string
  nombre: string
  orden: number
  oasVinculados: string[]
  criterios: CriterioRubrica[]
}

interface RubricaTemplate {
  id: string
  nombre: string
  asignatura: string
  curso: string
  unidadId?: string
  unidadNombre?: string
  metadatosCurriculares?: RubricaMetadatosCurriculares
  vinculosCurriculares?: VinculoCurricular[]
  gruposConfig?: RubricaGrupoConfig[]
  partes: RubricaParte[]
  puntajeMaximo: number
  createdAt?: unknown
  updatedAt?: unknown
}
```

## Compatibilidad hacia atrás
Las rúbricas existentes deben seguir funcionando.

Reglas de compatibilidad:

1. Si una rúbrica no tiene `gruposConfig`, crear una configuración por defecto.
2. Si una parte no tiene `orden`, usar el índice actual.
3. Si no existen `metadatosCurriculares`, inicializar como listas vacías.
4. Las evaluaciones antiguas deben mapearse a la nueva configuración de grupos sin perder puntajes.

## Cambios técnicos por archivo

### [lib/rubricas.ts](C:\Users\fredd\Documents\edupanel_local\lib\rubricas.ts)
1. Extender interfaces.
2. Cambiar `nuevaEvaluacion()` para crear grupos desde `gruposConfig`.
3. Agregar helpers de normalización y compatibilidad.
4. Mantener cálculo de puntaje y nota sin romper lo existente.

### [app/api/parse-rubrica/route.ts](C:\Users\fredd\Documents\edupanel_local\app\api\parse-rubrica\route.ts)
1. Mejorar detección de separadores de parte.
2. Extraer nombre y orden de cada parte.
3. Extraer objetivos, indicadores y objetivos transversales antes de la tabla.
4. Retornar una estructura más completa, no solo `partes`.

### [app/api/import-rubrica/route.ts](C:\Users\fredd\Documents\edupanel_local\app\api\import-rubrica\route.ts)
1. Conservar estructura de partes del documento base.
2. Mantener mapeo de puntajes por posición, pero respetando partes y orden.
3. Crear evaluación inicial usando `gruposConfig`.

### [components/edu-panel/rubricas/rubrica-import.tsx](C:\Users\fredd\Documents\edupanel_local\components\edu-panel\rubricas\rubrica-import.tsx)
1. Agregar sección de configuración de grupos.
2. Permitir editar cantidad y nombres de grupos.
3. Agregar bloque editable de objetivos, indicadores y objetivos transversales.
4. Mostrar partes en el orden correcto.

### [components/edu-panel/rubricas/evaluacion-view.tsx](C:\Users\fredd\Documents\edupanel_local\components\edu-panel\rubricas\evaluacion-view.tsx)
1. Mostrar pestañas por parte.
2. Mostrar criterios solo de la parte activa.
3. Mejorar asignación y movimiento de estudiantes entre grupos.
4. Si no hay estudiantes en un grupo, mostrar estado vacío útil y no bloquear.

### [components/edu-panel/rubricas/resultados-view.tsx](C:\Users\fredd\Documents\edupanel_local\components\edu-panel\rubricas\resultados-view.tsx)
1. Mantener resultados generales.
2. Preparar la estructura para futuras métricas por parte.
3. Mostrar mejor consistencia con las partes importadas.

## Propuesta de UX

### Editar rúbrica
Secciones sugeridas:

1. Información general
2. Configuración de grupos
3. Metadatos curriculares
4. Partes y criterios

### Evaluar rúbrica
Layout sugerido:

1. Selector de grupo
2. Lista de estudiantes del grupo
3. Pestañas por parte o etapa
4. Criterios de la pestaña activa
5. Resumen lateral de puntaje y nota

## Orden de implementación recomendado
1. Corregir modelo de datos y compatibilidad.
2. Corregir parser e importación de partes y metadatos.
3. Agregar configuración editable de grupos.
4. Arreglar carga y asignación de estudiantes.
5. Cambiar evaluación a pestañas por etapa.
6. Agregar vinculación curricular inicial.

## Criterios de aceptación

### Importación
1. Una rúbrica con 3 o 4 partes debe importarse separada en 3 o 4 partes.
2. Cada parte debe conservar su nombre.
3. Los criterios deben quedar dentro de la parte correcta.
4. Objetivos, indicadores y objetivos transversales deben quedar visibles tras importar.

### Edición
1. El usuario puede definir cantidad de grupos.
2. El usuario puede cambiar el nombre de los grupos.
3. El usuario puede revisar y editar metadatos curriculares.

### Evaluación
1. Al abrir una evaluación, aparecen estudiantes del curso.
2. El usuario puede mover estudiantes entre grupos.
3. Cada etapa se evalúa desde una pestaña separada.
4. La nota se actualiza correctamente al evaluar criterios de distintas pestañas.

### Integración curricular
1. Los textos importados pueden guardarse aunque no haya match en BD.
2. Los elementos pueden vincularse luego a registros curriculares reales.

## Decisiones por defecto recomendadas
1. Si no se define cantidad de grupos, usar 4 por defecto.
2. Si el Word no trae nombre claro de parte, usar `Parte N`.
3. Si no se puede vincular un objetivo o indicador, conservarlo como texto importado.
4. La integración curricular debe comenzar como apoyo editable, no como validación obligatoria.
