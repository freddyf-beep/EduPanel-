# Guía de Implementación de Archivos JSON (Curriculum)

Hola, modelo de IA. Este documento detalla cómo manejar, integrar y migrar los archivos JSON de currículum que el usuario ha extraído dentro de este proyecto.

Actualmente existen múltiples archivos JSON de unidades de aprendizaje (ej. `musica_4to_basico_unidades_1_2.json`). El objetivo principal con estos JSON es subirlos y estructurarlos correctamente en la base de datos de **Firestore** para que la plataforma EduPanel pueda consumirlos en el módulo de "Planificaciones" y en la barra lateral "AI Copilot".

## ESTRUCTURA DEL JSON

Cada archivo JSON es un **Array de Objetos**, donde cada objeto representa una Unidad completa insertada bajo un Nivel y Asignatura específicos. La estructura base esperada es:

```json
[
  {
    "nivel": "4to Básico",
    "asignatura": "Música",
    "unidad": {
      "numero_unidad": 1,
      "nombre_unidad": "Unidad 1",
      "proposito": "...",
      "conocimientos_previos": ["..."],
      "palabras_clave": ["..."],
      "conocimientos": ["..."],
      "habilidades": ["..."],
      "actitudes": ["..."],
      "objetivos_aprendizaje": [
        {
          "tipo": "OA",
          "numero": 1,
          "descripcion": "...",
          "indicadores": ["..."]
        }
      ],
      "actividades_sugeridas": [
        {
          "nombre": "...",
          "oas_asociados": [1, 2, 3],
          "descripcion": "..."
        }
      ],
      "ejemplos_evaluacion": [
         // Pueden variar los keys internos según el tipo de evaluación
      ],
      "adecuaciones_dua": {
        "estrategias_neurodiversidad": "..."
      }
    }
  }
]
```

## FLUJO DE IMPLEMENTACIÓN ESPERADO EN FIRESTORE

Para integrar cualquier nuevo archivo `.json` de currículum, debes seguir este modelo de datos (Jerarquía de Colecciones en Firestore):

1. **Colección `asignaturas`**: Documento con ID igual a la asignatura normalizada (ej. `musica`).
2. **Sub-colección `niveles`**: Documento con ID igual al nivel (ej. `4to_basico`).
3. **Sub-colección `unidades`**: Documentos con ID igual al número de unidad (ej. `unidad_1`, `unidad_2`). El contenido de `"unidad"` en el JSON va aquí.

Debes asegurarte de:
- **Indexar correctamente los OA (Objetivos de Aprendizaje)** para que la interfaz los renderice.
- Proveer o mantener actualizado el **script de migración** (generalmente ubicado en `./scripts/` o scripts temporales) para leer estos JSONs, parcializar el objeto y subirlos en batch a Firestore evitando exceder el límite de escrituras por batch.

## USO POR PARTE DEL COPILOT IA

El Copilot utiliza estos datos cargados desde Firestore para contextualizar el prompt que genera las clases. Cuando integres nuevos JSONs:
1. Asegúrate de que los campos `habilidades` y `actitudes` no vengan como arrays vacíos, el backend los espera para construir los selectores dinámicos.
2. Mantén formatos consistentes en `objetivos_aprendizaje` ya que las funciones cliente (ej. `actividades-content.tsx`) iteran buscando exactamente la propiedad `.descripcion` e `.indicadores`.

## ¿QUÉ HACER SI EL USUARIO TE PIDE INSERTAR MÁS JSON PUBLICADOS?

1. Examina la estructura del nuevo JSON para confirmar que empata con el esquema mostrado arriba.
2. Si el esquema difiere (ej. faltan atributos o las keys se llaman distinto), crea un script de mapeo para uniformar el JSON previo a su migración.
3. Actualiza / ejecuta el script de migración apuntando a Firebase de Desarrollo/Producción del cliente para impactar la base de datos.
4. Verifica en el UI de Vercel/Localhost que la selectera de Actividades reconozca la nueva Asignatura / Nivel.
