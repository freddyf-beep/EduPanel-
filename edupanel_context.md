# Contexto del Proyecto: EduPanel

Este documento está diseñado para ser entregado a cualquier Inteligencia Artificial (IA) estructurando el contexto completo de EduPanel. Contiene el propósito de la plataforma, la arquitectura de la base de datos, el flujo de las páginas y un registro de decisiones, problemas y soluciones. 

> **Instrucción para futuras IAs:** Por favor, lee detenidamente este documento antes de realizar cambios en el código. Si durante tu sesión de trabajo realizas cambios arquitectónicos, resuelves un problema complejo o agregas una nueva página, **DEBES actualizar este archivo** agregando esa información en la sección de "Registro de Cambios y Soluciones".

---

## 1. Propósito de la Plataforma
**EduPanel** es un SaaS/plataforma educativa pensada para profesores. Su objetivo principal es facilitar y digitalizar el proceso de **planificación curricular**. 
Permite a los docentes vincular sus cursos personalizados (ej. "4to Medio A") con las bases curriculares oficiales del Ministerio de Educación (Mineduc). Desde ahí, los profesores pueden crear unidades, asignar Objetivos de Aprendizaje (OA), habilidades, actitudes, y distribuir su año escolar en un **cronograma de clases**. La plataforma también hace uso de IA para generar propuestas de actividades y clases.

---

## 2. Organización de la Base de Datos (Firestore)

La plataforma distingue muy bien entre la data **Pública/Global** (el currículum oficial) y la data **Privada** (las planificaciones de cada profesor).

### Data Global (Currículum Oficial)
Ubicada en la colección raíz `curriculo`. Organizada por asignatura y nivel.
- **Ruta:** `curriculo/{Asignatura}_{Nivel}` (Ej: `curriculo/musica_4to_basico`).
- **Subcolecciones por Unidad:** Cada nivel tiene carpetas de unidades (`.../unidades/unidad_1`).
- **Contenido de la Unidad:** Dentro de cada unidad existen subcolecciones con la data detallada:
  - `objetivos_aprendizaje`
  - `actividades_sugeridas`
  - `ejemplos_evaluacion`

### Data Privada (Por Usuario/Profesor)
Ubicada dentro de la colección `users/{uid}`.
- **`planificaciones_curso`**: Mapeo donde el profesor indica a qué nivel oficial de Mineduc corresponde cada uno de sus cursos personalizados.
- **`planificaciones`**: Contiene la "Matriz Curricular". Guarda un registro booleano de qué OAs, habilidades y actitudes han sido seleccionados/planificados para un curso determinado a lo largo de sus unidades.
- **`ver_unidad`**: Detalles editados por el docente para una unidad específica (ej. cuántas horas y clases le asignará).
- **`cronograma_unidad` / `cronogramas`**: Donde el profesor distribuye los OAs seleccionados en clases específicas.

---

## 3. Flujo y Funcionamiento de las Páginas Principales

1. **`/dashboard`:** Panel principal del profesor con resúmenes rápidos y accesos directos.
2. **`/planificaciones`:** Hub central. Aquí el profesor selecciona un curso. Tras seleccionarlo, ve sus unidades. 
   - Sustituye de forma unificada a un antiguo módulo llamado "Planificación Anual" (que fue eliminado por ser redundante).
   - Permite enlazar la "Unidad 1" del profesor con la "Unidad 1" del Currículum Oficial.
3. **`components/.../ver-unidad/ver-unidad-content.tsx`:** Es la vista detallada de una unidad. Muestra:
   - **Pestaña Unidad:** Los conocimientos, habilidades y actitudes oficiales seleccionados.
   - **Clases Planificadas:** Enlace directo al cronograma oficial. Eliminamos la antigua creación de "Actividades sueltas" para centralizar todo en las "Clases".
   - **Visor PDF (Programa Oficial):** Una ventana flotante estilo "Sticky Note" que carga dinámicamente el programa de estudio oficial en PDF mediante Google Docs Viewer para evitar bloqueos del navegador.
4. **`/cronograma`:** Donde los docentes dividen las unidades en clases concretas (Clase 1, Clase 2, etc.) y le asignan OAs específicos a cada sesión.
5. **`/migrate`:** Página de uso administrativo/desarrollo interno. Se utiliza para cargar y estructurar los archivos JSON del Mineduc (ej. `musica_4to_basico_unidades_1_2.json`) y sembrarlos en la colección global `curriculo` de Firestore.

---

## 4. Tareas Pendientes y Qué Falta (Roadmap)
- [ ] **Desarrollo del Leccionario / Clases:** Pulir la experiencia de cómo el profesor anota el inicio, desarrollo y cierre de cada clase basándose en el cronograma.
- [ ] **Integraciones con IA Generativa:** Asegurar que los botones mágicos (Sparkles) que dicen "Generar con IA" funcionen correctamente llamando a las APIs para redactar clases automatizadas basadas en los OAs seleccionados.
- [ ] **Población de Datos:** Subir los JSONs y PDFs de las demás asignaturas y niveles faltantes. (A la fecha actual: 1ro, 3ro y 4to Básico de Música ya cargados).

---

## 5. Registro Histórico de Cambios, Problemas y Soluciones

### Abril 2026 - Copiloto Lateral, Prompt Editable y BYOK Multi-Proveedor
- **Problema:** El copiloto de `Actividades` se sentía visualmente débil, poco configurable y con un chat que mostraba negritas/listas como texto plano. Además, la configuración BYOK estaba demasiado rígida y no representaba bien la idea de que cada docente pudiera trabajar con su propia IA/token.
- **Solución:** Se transformó el copiloto en un **panel lateral fijo** tipo “sidebar asistida”, inspirado en experiencias como Edge Copilot. Se agregó soporte de configuración por usuario para `provider + model + token + endpoint`, incluyendo `Gemini`, `OpenAI`, `Anthropic` y un modo `Compatible OpenAI` para endpoints personalizados. También se incorporó un bloque de **prompt editable** que muestra el prompt efectivo usado por la IA, con acciones para copiarlo, volver al automático y restaurar el último guardado.
- **Mejora adicional:** El chat del copiloto ahora renderiza mejor el contenido generado (negritas, listas, párrafos) en lugar de mostrar marcadores crudos. En la misma página de `Actividades` se agregó un apartado visible para **actividades sugeridas** y **evaluaciones sugeridas** provenientes de la unidad curricular cargada en Firestore.

### Abril 2026 - Robustecimiento del Copiloto IA de Clases
- **Problema:** La generación de clases con IA se sentía inconsistente y poco útil. El frontend enviaba poca estructura curricular, la primera generación no aprovechaba bien la continuidad con la clase anterior, y la API era frágil frente a respuestas JSON imperfectas del modelo.
- **Solución:** Se reescribió `app/api/generar-clase/route.ts` para separar mejor los modos de **creación inicial**, **edición** y **chat pedagógico**, limpiar HTML antes de usarlo como contexto, enriquecer el prompt con información de unidad (propósito, conocimientos previos, habilidades, actitudes, DUA) y normalizar la respuesta final antes de devolverla al cliente. En `components/edu-panel/actividades/actividades-content.tsx` se ajustó el payload para enviar el modo correcto, incluir contexto de continuidad incluso en la primera generación de una clase y pasar un resumen curricular más útil al backend.
- **Nota técnica:** Durante la verificación apareció un falso error de TypeScript desde `.next/types` apuntando a una página eliminada (`planificacion-anual`). Bastó con limpiar `.next` y volver a compilar para validar el estado real del código.

### Abril 2026 - Carga de Datos Múltiples (1ro y 3ro Básico)
- **Problema:** El script de migración `/migrate` estaba estático y formateado para cargar solamente los archivos JSON de 4to Básico. El visor de PDF en `ver-unidad` necesitaba asegurarse de mostrar el PDF de acuerdo al nivel.
- **Solución:** Se movieron los archivos subidos para 1ro y 3ro básico a la carpeta pública (`/public/...`) y se reescribió `app/migrate/page.tsx` con un bucle dinámico (`nivelesReales`) para procesar simultáneamente 1ro, 3ro y 4to básico. La ruta dinámica generada previamente para el visor de PDFs (`encodeURIComponent`) fue capaz de ensamblar perfectamente los nombres de los nuevos PDFs del repositorio oficial (`Música 1.pdf`, `Música 3.pdf`).

### Marzo 2026 - Unificación Curricular
- **Problema:** Había redundancia entre "Mis Planificaciones" y "Planificación Anual". La data de currículum estaba desordenada en una lista plana anual.
- **Solución:** Se eliminó la carpeta `planificacion-anual` y se unificó todo bajo `/planificaciones`. Se rediseñó la BD para que el currículum se agrupe en subcolecciones organizadas **por unidad** (ej. la Unidad 1 ya trae filtrados sus OAs de Unidad 1).

### Marzo 2026 - Visor PDF y Ventanas Flotantes
- **Problema:** El Ministerio de Educación tiene políticas de seguridad (`X-Frame-Options: SAMEORIGIN`) que bloquean la inserción de sus PDFs en iframes.
- **Solución:** Se utilizó el visor embebido de Google Docs (`https://docs.google.com/viewer?url=...&embedded=true`) como puente para saltar la seguridad y mostrar los PDFs.
- **Problema:** La animación `animate-fade-up` destruía las coordenadas dinámicas del drag-and-drop de React asfixiando el movimiento de la ventana de PDF.
- **Solución:** Se eliminó la animación en la ventana flotante y se reemplazó la propiedad `transform` por manipulación directa de coordenadas CSS absolutas (`right` y `bottom`), logrando un efecto "Sticky Note" transparente, redimensionable y movible.

### Marzo 2026 - Simplificación de UI de Unidades
- **Problema:** Las tarjetas de unidad preguntaban por "Horas" y "Fechas de inicio/término" causando confusión de UX.
- **Solución:** Se eliminaron esas opciones de la tarjeta principal. También se eliminó una sección "Actividades" huérfana para redirigir toda la acción de planificación directamente a "Cronograma / Clases planificadas".

*(Si eres una IA trabajando en este repositorio, por favor agrega tus intervenciones importantes aquí debajo).*

### Abril 2026 - Pestana IA tipo Edge y barra de clases plegable
- **Problema:** El usuario seguia viendo el panel viejo de IA porque la version lateral nueva habia quedado montada pero desactivada. Ademas, la pantalla de `Actividades` se sentia apretada por la columna fija de clases a la izquierda.
- **Solucion:** En `components/edu-panel/actividades/actividades-content.tsx` se activo el **copiloto lateral fijo** y se agrego una **pestana visible en el costado derecho** para abrir/cerrar el panel como una sidebar asistida. En paralelo, la lista de `Clases` paso a ser una **barra plegable** que puede comprimirse a una rail compacta con numero, fecha y puntos de OA.
- **Ajuste UX:** El panel lateral ahora puede abrirse sin bloquear al docente por requisitos previos. La generacion inicial sigue guiada por contexto curricular, pero cuando faltan OA, habilidades, actitudes u objetivo, el panel lo explica con un mensaje claro en vez de cerrarle el acceso a la herramienta.

### Abril 2026 - Unidad curricular real, sugerencias oficiales y panel IA sin solaparse
- **Problema:** La vista de `Actividades` mezclaba el identificador local de la unidad con el identificador curricular real. Eso podia dejar `getUnidadCompleta(...)` en null y hacer desaparecer las `Sugerencias Oficiales de la Unidad`, especialmente al entrar desde `Ver Unidad` o desde el cronograma. Ademas, el panel lateral de IA seguia ocupando visualmente el mismo espacio que el contenido principal.
- **Solucion:** En `components/edu-panel/actividades/actividades-content.tsx` se separo `unidadParam` (local) de `unidadCurricularParam` (curricular) y se ajustaron los enlaces de retorno. `Ver Unidad` y `CronogramaUnidadContent` ahora pasan ambos ids cuando corresponde. Tambien se agrego un fallback en `lib/curriculo.ts` para leer `actividades_sugeridas` y `ejemplos_evaluacion` tanto desde subcolecciones como desde el documento de unidad si existiera una migracion antigua.
- **Ajuste UX:** El contenido principal ahora reserva espacio para el copiloto lateral con `paddingRight` dinamico, evitando que el panel tape la pagina. El bloque de sugerencias oficiales muestra estados explicitos cuando falta la base curricular, cuando la unidad no existe o cuando la unidad no trae referencias cargadas.

### Abril 2026 - Copiloto en flujo y prompt base neutral
- **Problema:** El lateral de IA seguia viendose como una capa montada encima del contenido, con una sensacion de espacio sobrante y un tab visualmente invasivo. En paralelo, el prompt base todavia empujaba demasiado una intencion pedagogica especifica y usaba ejemplos de formato que podian sesgar la generacion.
- **Solucion:** En `components/edu-panel/actividades/actividades-content.tsx` el copiloto paso a comportarse como una **sidepane real en desktop**, compartiendo el layout con la pagina en vez de ocupar espacio mediante `fixed + paddingRight`. El boton flotante solo aparece cuando el panel esta cerrado, y al abrirse el cierre rapido queda anclado al borde del mismo panel. En `lib/ai/copilot.ts` se neutralizo el prompt base para que no imponga metodologias, ejemplos ni estilos predeterminados, y las restricciones JSON dejaron de mostrar valores de ejemplo para evitar sesgos innecesarios.
- **Ajuste UX:** Tambien se limpiaron algunos textos visibles del copiloto para que se sienta menos demo y mas integrado a EduPanel.

### Abril 2026 - Prompt definitivo de generacion basado en seleccion curricular
- **Problema:** El prompt de generacion se habia ido deformando con muchas iteraciones y termino mezclando reglas generales con sesgos de ejemplo. El usuario definio un prompt definitivo centrado en 5 pasos pedagogicos obligatorios, pero habia que adaptarlo a la estructura real de EduPanel sin perder la seleccion curricular hecha en la pagina de `Actividades`.
- **Solucion:** En `lib/ai/copilot.ts` se reescribio `buildLessonPrompt(...)` para seguir el nuevo marco: asesor pedagogico experto en curriculum chileno, diseno didactico y Taxonomia de Bloom, con 5 pasos internos obligatorios. La nueva version usa como fuente principal la informacion seleccionada por el docente en la pagina (`OA`, habilidades, actitudes, objetivo, contexto de unidad, continuidad previa e instrucciones extra) y luego convierte ese trabajo interno al JSON que consume la app.
- **Ajuste importante:** No se elimino la intencion pedagogica general del prompt. El cambio fino fue quitar el sesgo por ejemplos de actividades o secuencias modelo como plantilla base, salvo que el contexto o el docente los pidan explicitamente.

### Abril 2026 - Deteccion de clase existente y lateral IA con menos desperdicio de espacio
- **Problema:** En `Actividades`, el copiloto seguia mostrando el estado de "Generar primera propuesta" aunque la clase ya tuviera contenido cargado. Eso impedía entrar directamente a preguntar o modificar la clase actual. Ademas, el lateral abierto seguia arrastrando una pestana/manilla negra y un layout demasiado centrado que dejaba espacio sobrante entre el contenido y el panel.
- **Solucion:** En `components/edu-panel/actividades/actividades-content.tsx` se agrego deteccion real de contenido existente usando los bloques de la clase (`objetivo`, `inicio`, `desarrollo`, `cierre`, `adecuacion`, materiales y TICs). Si la clase ya tiene contenido, el copiloto entra de inmediato en modo de trabajo sobre la clase actual y habilita `Preguntar` / `Modificar clase` sin exigir una primera generacion. Tambien se resetea el hilo del copiloto al cambiar de clase para evitar mezclar conversaciones.
- **Ajuste UX:** El lateral ahora usa mejor el ancho disponible cuando esta abierto, elimina la manilla negra lateral y reduce la sensacion de espacio perdido para acercarse mas a una sidepane tipo Edge sin tapar el contenido.

### Abril 2026 - Contexto y objetivo docente por unidad para alimentar el prompt de IA
- **Problema:** La IA estaba tomando principalmente el contexto curricular oficial y la seleccion de OA/habilidades/actitudes de `Actividades`, pero faltaba una capa clave: el contexto real del curso y el objetivo pedagogico propio que el profesor quiere empujar en esa unidad. Eso hacia que algunas generaciones quedaran demasiado pegadas al curriculum formal aunque el docente estuviera reforzando otra linea, por ejemplo mas teoria.
- **Solucion:** En `components/edu-panel/ver-unidad/ver-unidad-content.tsx` se agregaron dos nuevos campos persistentes por curso/unidad: `contextoDocente` y `objetivoDocente`. Ambos se guardan dentro de `ver_unidad` en Firestore mediante `lib/curriculo.ts`. Luego, `components/edu-panel/actividades/actividades-content.tsx` carga esos valores junto con la unidad y los envia en el payload del copiloto como `contexto_docente` y `objetivo_docente`, incluso si la base curricular oficial no estuviera disponible.
- **Impacto en IA:** `lib/ai/copilot.ts` ahora incorpora explicitamente esos dos campos dentro del `CONTEXTO DE UNIDAD` y los considera como parte de la `FUENTE PRINCIPAL DE INFORMACION`, de modo que la generacion, edicion y chat respeten mejor la intencion real del profesor para ese curso.

### Abril 2026 - Separacion real entre "Preguntar" y "Modificar clase" en el copiloto
- **Problema:** En el chat lateral de `Actividades`, los botones `Preguntar` y `Modificar clase` estaban demasiado cerca en comportamiento. `Preguntar` podia terminar devolviendo sugerencias casi como reescritura completa, y `Modificar clase` solo aplicaba el ultimo mensaje en vez de tomar la conversacion previa como acuerdos acumulados.
- **Solucion:** En `components/edu-panel/actividades/actividades-content.tsx` el payload del copiloto ahora envia `chatHistory` al backend y permite que `Modificar clase` funcione incluso sin mensaje nuevo, siempre que ya exista conversacion previa del docente. En `lib/ai/copilot.ts`, el modo `chat` quedo orientado explicitamente a resolver dudas, detectar incoherencias y proponer ajustes focalizados sin reescribir toda la clase, mientras que el modo `edicion` ahora usa tambien la conversacion previa como contexto para aplicar los cambios acordados.
- **Ajuste UX:** En el footer del panel se agrego una aclaracion breve del rol de cada boton y `Modificar clase` solo se habilita sin mensaje nuevo cuando realmente hay historial del docente que valga la pena aplicar.

### Abril 2026 - Pulido de BYOK para Claude / Anthropic
- **Problema:** El flujo de token personal para `Anthropic` estaba fragil. El proveedor seguia proponiendo un modelo por defecto mas antiguo y, si la cuenta del docente no tenia acceso a ese modelo exacto, la integracion fallaba aunque la API key fuera valida.
- **Solucion:** En `lib/ai/copilot.ts` se actualizo el modelo por defecto de Anthropic a `claude-sonnet-4-20250514` y se mejoro el texto de ayuda del proveedor. En `app/api/generar-clase/route.ts` la llamada a Anthropic ahora construye una lista de modelos candidatos y, si la API devuelve un error de modelo, reintenta automaticamente con variantes compatibles antes de fallar.
- **Resultado esperado:** El ingreso de una API key propia de Claude deberia funcionar con mucha mas consistencia, especialmente cuando el problema real era el modelo configurado y no el token.

### Abril 2026 - Modificar clase toma el ultimo pedido real y no finge cambios
- **Problema:** En `Actividades`, el boton `Modificar clase` podia terminar usando una instruccion demasiado generica al apretarse sin mensaje nuevo, aun cuando el docente ya habia escrito una peticion concreta en el chat. Ademas, el copiloto podia responder "Listo" aunque el contenido final quedara practicamente igual.
- **Solucion:** En `components/edu-panel/actividades/actividades-content.tsx` el flujo de edicion ahora recupera el ultimo mensaje real del docente del chat y lo usa como instruccion de edicion si el boton se pulsa sin texto nuevo. Tambien compara la clase antes y despues de aplicar la respuesta de IA para detectar si hubo cambios reales.
- **Ajuste en prompt:** En `lib/ai/copilot.ts` se reforzo el modo `edicion` para obligar a modificar el campo pedido cuando el docente menciona explicitamente `objetivo`, `inicio`, `desarrollo`, `cierre`, `materiales`, `TIC` o `adecuacion`. Si la IA devuelve algo sin cambios reales, el chat ahora lo informa en vez de afirmar falsamente que la clase fue modificada.

### Abril 2026 - Estado pendiente / no resuelto del copiloto al modificar clase
- **Situacion actual:** A pesar de los ajustes anteriores, el problema principal del usuario sigue sin resolverse del todo. El copiloto lateral todavia puede responder en modo demasiado conversacional cuando el docente usa `Modificar clase`, especialmente en pedidos como "editame y cumple las reglas de la creacion de objetivo de clase". En la evidencia compartida, la IA devolvio una explicacion/pulido pedagogico sobre el objetivo, pero el campo `objetivo` visible en la UI quedo igual (`Inferir las cualidades...`) y el chat termino mostrando un mensaje de exito como si hubiera reescrito la clase.
- **Sintoma observable:** El usuario espera que `Modificar clase` cambie efectivamente el contenido del editor (por ejemplo, reemplazar el objetivo de clase para que use un solo verbo), pero en la practica la IA puede devolver una respuesta tipo asesoramiento y luego la UI no refleja el cambio esperado en los bloques de texto.
- **Estado del codigo al cierre de esta sesion:** En `components/edu-panel/actividades/actividades-content.tsx` ya existen `buildConversationHistory(...)`, reutilizacion del ultimo mensaje real del docente para `edicion`, y comparacion `nextActividad` / `hasMeaningfulChanges`. En `lib/ai/copilot.ts` el prompt de `edicion` ya exige modificar explicitamente `objetivo`, `inicio`, `desarrollo`, `cierre`, `materiales`, `TIC` o `adecuacion` cuando el docente lo pide. Sin embargo, el flujo completo todavia no da garantia practica de que el contenido del editor cambie en todos los casos reales.
- **Sospechas para la siguiente IA:** Revisar primero si el proveedor/modelo esta devolviendo realmente JSON estructurado en `modo === "edicion"` o si a veces vuelve texto conversacional. Revisar tambien si `data.objetivo`, `data.inicio`, etc. llegan vacios desde `/api/generar-clase` y por eso `setActividad(...)` conserva el valor anterior. Conviene inspeccionar `promptUsado`, `rawText` del proveedor y el `parsed/coerceGeneratedLesson(...)` del backend en una corrida real de `Modificar clase`.
- **Contexto de proveedores en paralelo:** Claude / Anthropic no estaba disponible para depurar bien este problema porque la API respondio `Your credit balance is too low to access the Anthropic API`. Gemini tambien presento una falla paralela en el entorno local: la ruta backend reporto `API key not valid`, indicando que `GEMINI_API_KEY` del servidor local no era valida en ese momento. Esto puede haber contaminado parte de las pruebas de modificacion con diferentes proveedores.

### Abril 2026 - Resolucion del Modificar Clase y Conversacion AI en Modo Edicion
- **Problema:** En el modo `edicion`, la IA a menudo devolvia explicaciones pedagogicas sobre las modificaciones en lugar de limitarse a actualizar el JSON de la clase. Debido a que las API fuerzan el formato JSON, la IA colocaba su charla conversacional en los bloques de texto (como `inicio` o `desarrollo`) o dejaba los campos con strings vacios (los cuales fallaban el fallback de `"" || actividad.objetivo` en el frontend, manteniendo la pantalla igual aunque el chat decia "¡Listo! He re-escrito la clase").
- **Solucion:** Se modifico el prompt de edicion en `lib/ai/copilot.ts` para obligar al modelo a colocar cualquier explicacion en un nuevo campo `explicacion_cambios` dentro del JSON esperado, prohibiendole explicitamente ensuciar los bloques de la clase con chat. Luego, `route.ts` fue modificado para devolver este campo hacia el frontend. Finalmente, en `actividades-content.tsx` se reemplazo el texto *hardcoded* de "¡Listo! He re-escrito..." para que la conversacion real de la IA responda via `data.explicacionCambios` o caiga al fallback. De esta forma, se satisface el impulso natural del LLM de comunicarse sin destruir la UI, garantizando que los bloques de curso que el usuario pidio cambiar se modifiquen verdaderamente.
