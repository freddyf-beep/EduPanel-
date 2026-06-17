# Paquete Stitch v2: rediseño real de `/ver-unidad`

Este documento reemplaza la maqueta HTML anterior. No es un prototipo generico: es un brief para que Google Stitch rediseñe las paginas reales que hoy existen en EduPanel.

La app ya tiene estas rutas:

- `/ver-unidad` = Unidad
- `/ver-unidad/cronograma` = Cronograma
- `/ver-unidad/clases` = Clases

El problema actual no es falta de funciones. El problema es que hay demasiadas herramientas compitiendo al mismo nivel visual. Stitch debe proponer una interfaz mas ordenada, manteniendo las funciones reales.

## Prompt base para Stitch

Rediseña una seccion real de EduPanel, una app SaaS para docentes chilenos. La seccion se llama "Ver unidad" y tiene tres paginas conectadas: Unidad, Cronograma y Clases.

No diseñes una landing page. No inventes un producto nuevo. No uses hero sections, ilustraciones escolares, tarjetas decorativas, gradientes grandes ni una UI infantil. Esto debe verse como una herramienta profesional que un profesor usa a diario para planificar, ajustar, exportar y llevar clases.

El diseño debe mantener el shell de app existente:

- Sidebar lateral izquierda con navegacion global.
- Area principal amplia.
- Header compacto de pagina.
- Navegacion interna horizontal: Unidad, Cronograma, Clases.
- Fondo neutro claro.
- Superficies blancas.
- Bordes suaves.
- Texto compacto.
- Iconos en acciones.
- Color primario solo como acento.

El objetivo del rediseño es ordenar herramientas, no eliminarlas. Agrupa acciones avanzadas en menus o paneles laterales. Las acciones principales deben ser pocas y claras.

Datos simulados:

- Asignatura: Musica
- Curso: 4to Basico A
- Nivel curricular: 4to Basico
- Unidad: Paisajes sonoros y creacion ritmica
- Unidad local: Unidad 2
- Duracion: 8 clases
- Fechas: 04/06/2026 al 25/06/2026
- Estado: Guardado
- Progreso: 78% formato anual completo

OA seleccionados:

- OA1: Escuchar cualidades del sonido y describirlas usando vocabulario musical.
- OA2: Interpretar y crear patrones ritmicos con voz, cuerpo e instrumentos.
- OA4: Expresar ideas musicales mediante recursos sonoros diversos.

Clases simuladas:

1. Exploracion sonora del entorno, 04/06, OA1, planificada
2. Ritmos corporales y patrones, 06/06, OA2, planificada
3. Timbre e intensidad, 11/06, OA1 + OA4, planificada
4. Boceto de paisaje sonoro grupal, 13/06, OA4, en progreso
5. Ensayo guiado por estaciones, 18/06, OA2 + OA4, pendiente
6. Grabacion de paisaje sonoro, 20/06, OA4, pendiente
7. Escucha y retroalimentacion, 23/06, OA1 + OA4, pendiente
8. Presentacion y cierre reflexivo, 25/06, OA1 + OA2 + OA4, pendiente

## Pantalla 1: Unidad

Ruta real: `/ver-unidad`

Esta pagina hoy contiene la base pedagogica de la unidad. Stitch debe rediseñarla manteniendo estas funciones reales.

Header real actual:

- Boton volver a Planificaciones.
- Punto de color de la unidad.
- Breadcrumb: Musica / 4to Basico / 4to Basico A.
- Titulo: Paisajes sonoros y creacion ritmica.
- Estado de guardado.
- Acciones: Drive, Exportar a Drive, Planificar clase, Programa Oficial, menu mas acciones, Guardar.

Navegacion interna:

- Unidad
- Cronograma
- Clases

Contenido real actual:

- Base pedagogica de la unidad.
- Proposito.
- Contexto docente editable.
- Objetivo docente editable.
- Objetivos de Aprendizaje seleccionados.
- Modal o detalle de OA e indicadores.
- Habilidades seleccionadas.
- Conocimientos seleccionados.
- Actitudes seleccionadas.
- Panel lateral "Formato anual" con checklist y porcentaje.
- Panel lateral "Fechas y carga" con inicio, termino, numero de clases y horas calculadas desde horario.
- Panel lateral "Campos faltantes" con conocimientos previos, recursos/materiales y estrategia de evaluacion.
- Acceso al cronograma general.

Problema de diseño actual:

- Se ve como muchas cajas similares.
- El usuario no distingue que es resumen, que es editable y que es siguiente paso.
- Hay demasiados botones visibles arriba.
- "Base pedagogica", OA, habilidades, conocimientos y actitudes compiten con la misma importancia.

Propuesta que Stitch debe diseñar:

- Header mas limpio con una sola accion primaria: Guardar.
- Acciones secundarias agrupadas: Exportar, Drive, Programa oficial.
- Boton destacado pero no dominante: Continuar en Clase 4.
- Contenido en dos zonas:
  - Columna principal: Foco de unidad, OA prioritarios, aprendizajes asociados.
  - Panel lateral: estado, faltantes y siguiente accion.
- OA como bloques legibles con cobertura y conteo de clases donde aparecen.
- Habilidades, conocimientos y actitudes como listas/chips menos pesados.
- Campos editables visibles pero tranquilos, no como formulario gigante.

Texto visible sugerido:

- "Foco de la unidad"
- "Que necesita este curso"
- "Meta docente"
- "OA priorizados"
- "Aprendizajes asociados"
- "Faltantes para cerrar la unidad"
- "Siguiente accion: completar Clase 4"

Acciones visibles:

- Guardar
- Continuar clase
- Editar OA
- Agregar recurso
- Agregar evaluacion
- Exportar
- Abrir Drive
- Programa oficial

## Pantalla 2: Cronograma

Ruta real: `/ver-unidad/cronograma`

Esta pagina organiza clases, fechas y OA. Hoy funciona como matriz OA x clases. Stitch debe mantener la matriz, pero proponer una vista mas clara y menos agotadora.

Header interno real:

- Total de clases.
- Base fechas.
- Cobertura porcentual.
- Input de fecha inicio.
- Boton "Calcular fechas desde mi horario".
- Boton "Autorelleno".
- Estado de guardado.
- Boton Guardar.

Funciones reales:

- Editar fecha de cada clase.
- Duplicar clase.
- Asignar o quitar OA por clase.
- Ver cobertura de OA.
- Calcular fechas automaticas desde horario semanal.
- Autorelleno curricular.
- Autorelleno IA.
- Autorelleno aleatorio.
- Ir a clase desde cada columna.
- Paginacion horizontal de clases.

Problema de diseño actual:

- La matriz es util, pero domina demasiado.
- Para un profesor es mas natural pensar en secuencia de clases que en tabla.
- Autorelleno IA, curricular y aleatorio deberian estar explicados como opciones de estrategia, no como botones sueltos.

Propuesta que Stitch debe diseñar:

- Vista principal tipo "secuencia de clases" con tarjetas horizontales o verticales compactas.
- Cada clase debe mostrar:
  - Numero
  - Fecha
  - Titulo sugerido
  - OA asignados
  - Estado
  - Accion "Abrir clase"
- Panel lateral de cobertura:
  - OA1: 4 clases
  - OA2: 3 clases
  - OA4: 6 clases
  - Alertas: OA2 necesita evaluacion, Clase 5 pendiente.
- La matriz OA x clases queda como vista secundaria o modo "Matriz".
- Autorelleno se muestra como menu o panel:
  - Curricular recomendado
  - IA didactica
  - Rapido aleatorio

Texto visible sugerido:

- "Secuencia de clases"
- "Cobertura curricular"
- "Distribuir OA"
- "Calcular fechas desde horario"
- "Vista secuencia"
- "Vista matriz"

Acciones visibles:

- Calcular fechas
- Distribuir OA
- Guardar
- Editar fecha
- Duplicar clase
- Abrir clase
- Cambiar a matriz

## Pantalla 3: Clases

Ruta real: `/ver-unidad/clases`

Esta es la pantalla mas cargada. Hoy mezcla editor, OA, habilidades, actitudes, recursos, IA, exportaciones, Notebook, evaluaciones, sincronizacion y modo clase en vivo.

Header real actual:

- Volver a Ver Unidad.
- Breadcrumb a Mis planificaciones.
- Titulo: Clases / Musica / 4to Basico A.
- Estado de guardado.
- Borrar clase.
- Exportar a Drive.
- Guardar manualmente.

Layout real actual:

- Panel izquierdo: lista de clases, colapsable.
- Panel central: editor de clase.
- Paneles de apoyo: OA, habilidades, actitudes, desarrollo, adecuacion, materiales, TICs, sugerencias, banco de clases.
- Acciones IA y exportacion.

Funciones reales:

- Seleccionar clase.
- Colapsar lista de clases.
- Cambiar estado: no planificada, planificada, ejecutada u otros estados.
- Escribir contexto del profesor.
- Escribir objetivo de clase.
- Usar asistente IA.
- Importar Word.
- Abrir banco de clases.
- Ver y seleccionar OA de esta clase.
- Seleccionar indicadores por OA.
- Seleccionar habilidades y actitudes.
- Editar inicio, desarrollo y cierre.
- Editar adecuacion curricular.
- Ver analisis Bloom generado.
- Ver objetivo multinivel.
- Ver indicadores de evaluacion.
- Ver actividad de evaluacion.
- Agregar materiales.
- Agregar TICs.
- Adjuntar archivos.
- Exportar a Drive.
- Sincronizar con Libro de Clases.
- Preparar PPT con Notebook.
- Generar rubrica o guia con IA.
- Abrir Modo Clase en Vivo.
- Borrar clase.

Problema de diseño actual:

- Todas las herramientas aparecen como importantes.
- Hay demasiadas cajas y botones.
- La clase deberia tener un editor central claro: Objetivo, Inicio, Desarrollo, Cierre, Adecuacion.
- Las herramientas deberian vivir en un panel derecho agrupado por tarea.

Propuesta que Stitch debe diseñar:

- Layout de 3 zonas:
  - Izquierda: rail de clases, muy claro y compacto.
  - Centro: editor de la clase actual.
  - Derecha: panel de herramientas agrupadas.
- La clase seleccionada debe ser Clase 4: Boceto de paisaje sonoro grupal.
- El editor central debe tener estos bloques:
  - Objetivo
  - Inicio
  - Desarrollo
  - Cierre
  - Adecuacion
- Mostrar OA de esta clase arriba del editor, no escondidos.
- Habilidades y actitudes deben ser chips secundarios.
- Panel derecho con grupos:
  - Planificar: Asistente IA, mejorar objetivo, version PIE, banco de clases.
  - Importar: Word, Drive, adjuntos.
  - Evaluar: indicadores, rubrica, guia.
  - Exportar: Word/PDF, Notebook/PPT.
  - Sincronizar: Libro de Clases, Modo Clase.
- Borrar clase debe estar en menu secundario o zona peligrosa, no como boton protagonista.

Contenido simulado para Clase 4:

- Objetivo: Crear un primer boceto de paisaje sonoro usando al menos tres fuentes sonoras.
- Inicio: Escuchar un ejemplo breve de paisaje sonoro y responder: que sonidos construyen un lugar?
- Desarrollo: En grupos, elegir cuatro sonidos, ordenar una secuencia, ensayar y registrar un primer boceto.
- Cierre: Compartir avance y anotar una mejora para la proxima clase.
- Adecuacion: Usar tarjetas visuales de roles; permitir respuesta oral; reducir cantidad de sonidos si es necesario.
- Materiales: tarjetas de sonidos, instrumentos de percusion, celular para grabar.
- TICs: grabadora, parlante.

Acciones visibles:

- Guardar
- Generar con IA
- Importar Word
- Banco de clases
- Exportar
- Sincronizar
- Modo clase

Acciones secundarias en menu:

- Borrar clase
- Recalcular Bloom
- Regenerar indicadores
- Preparar Notebook
- Crear rubrica
- Crear guia

## Pantalla 4: Modo Clase en Vivo

Esta vista puede ser modal grande o pagina dedicada abierta desde Clases.

Funcion real existente:

- Abrir modo clase en vivo desde una clase planificada.
- Usar temporizador.
- Ver momentos de la clase.
- Apoyarse con IA durante la ejecucion.

Propuesta que Stitch debe diseñar:

- Debe sentirse distinta al editor: menos herramientas, mas foco.
- Header: Clase 4, curso, asignatura, tiempo restante, Finalizar.
- Centro: instruccion actual grande y clara.
- Timeline: Inicio, Desarrollo, Cierre.
- Panel lateral:
  - Observaciones rapidas
  - Estudiantes que requieren apoyo
  - Ajustes IA rapidos
  - Guardar evidencia
  - Sincronizar resumen al Libro de Clases

Datos simulados:

- Momento actual: Desarrollo
- Tiempo restante: 32:00
- Instruccion actual: Cada grupo arma una secuencia de 4 sonidos. Debe incluir un sonido fuerte, uno suave y un silencio.
- Observacion sugerida: Grupo 2 necesita roles mas claros.
- Ajuste IA sugerido: Convertir la tarea en 3 pasos proyectables.

Acciones visibles:

- Iniciar / pausar timer
- Marcar momento completado
- Mostrar instrucciones
- Registrar observacion
- Pedir alternativa IA
- Guardar evidencia
- Finalizar clase

## Reglas visuales especificas

- No usar paleta dominada por morado.
- No usar fondo oscuro salvo en Modo Clase, donde puede servir para foco.
- No usar tarjetas dentro de tarjetas.
- No usar hero.
- No usar ilustraciones escolares.
- No usar muchas sombras.
- No usar botones primarios para todo.
- Usar altura compacta en filas.
- Usar iconos simples.
- La UI debe caber en notebook 1366 x 768.
- Priorizar desktop, pero mostrar adaptacion tablet.

## Entregables esperados de Stitch

Generar prototipos high-fidelity de:

1. Unidad
2. Cronograma con vista secuencia
3. Cronograma con vista matriz secundaria
4. Clases con rail izquierdo, editor central y herramientas agrupadas
5. Modo Clase en Vivo

No generar codigo. Generar pantallas visuales realistas de app web.

## Prompt corto para pegar si Stitch pide una sola instruccion

Rediseña las paginas reales de EduPanel `/ver-unidad`, `/ver-unidad/cronograma` y `/ver-unidad/clases`. Es una app SaaS para docentes chilenos. Mantiene shell con sidebar, header compacto y tabs internas Unidad, Cronograma, Clases. No es landing page. Usa datos simulados: Musica, 4to Basico A, Unidad "Paisajes sonoros y creacion ritmica", 8 clases, OA1/OA2/OA4. El objetivo es ordenar demasiadas herramientas: en Unidad mostrar foco pedagogico, OA y faltantes; en Cronograma mostrar secuencia de clases y cobertura OA con matriz secundaria; en Clases mostrar rail izquierdo, editor central de Objetivo/Inicio/Desarrollo/Cierre/Adecuacion y panel derecho de herramientas agrupadas en Planificar, Importar, Evaluar, Exportar y Sincronizar. Incluir Modo Clase en Vivo con timer, instruccion actual, timeline y observaciones. Estilo profesional, compacto, sobrio, sin hero, sin decoracion infantil, sin gradientes grandes, sin botones primarios excesivos.

