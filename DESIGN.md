# EduPanel Design Brief

## Product Context

EduPanel is a professional web app for Chilean teachers. The section to redesign is **Pruebas y Guias**, used to create classroom assessments and learning handouts by course, curricular unit, learning objectives, and class context.

Do not redesign or modify **Rubricas**. Rubricas already has a working design and must remain visually and structurally untouched.

## Design Goal

Make Pruebas and Guias feel like a polished daily teacher workspace, not a heavy form. The teacher should quickly understand:

- what course and unit they are working on
- what materials already exist
- what is ready to print
- what can be generated with AI
- what needs review
- how to create a new prueba or guia without friction

The interface should feel practical, warm, focused, and professional.

## Visual Direction

- SaaS education product, not a marketing landing page.
- Desktop-first, usable on tablet.
- Clean, calm, dense enough for real work.
- No giant hero sections.
- No childish classroom decoration.
- No decorative blobs, orbs, heavy gradients, or stock-photo hero areas.
- Use restrained color accents to separate Pruebas and Guias.
- Cards may be used for repeated material items, but avoid cards inside cards.
- Border radius should be moderate: 8px to 12px.
- Typography should be compact and readable.
- Prefer icons plus concise labels for actions.

## Suggested Palette

Base:
- Background: warm off-white or very light neutral
- Surface: white
- Text: near-black neutral
- Muted text: slate gray
- Border: soft gray

Accents:
- Pruebas: rose or coral accent, used sparingly
- Guias: violet or indigo accent, used sparingly
- Success: emerald
- Warning: amber
- Error: red

Avoid a UI dominated entirely by purple, blue, beige, or orange.

## Main Navigation Rules

The page lives inside the existing EduPanel app shell with sidebar and top header. Design only the content area.

The section should include:
- Tabs: Pruebas, Guias, Rubricas
- Rubricas must remain a simple navigation tab only. Do not create new Rubricas screens.
- Pruebas and Guias should be redesigned fully.

## Hub Screen: Pruebas

Design a professional hub for written assessments.

Required elements:
- Compact page header: "Pruebas"
- Course selector
- Unit selector
- Search input
- Filters: Todas, Sumativas, Formativas, Diagnosticas, Borradores
- Primary action: "Crear con IA"
- Secondary actions: "Crear manual" and "Importar Word"
- Small metrics row: Total, Listas para imprimir, Borradores, Vinculadas a OA
- Material cards grid/list

Each prueba card should show:
- Title
- Course and unit
- Type badge
- Number of sections
- Number of items
- Total points
- Time
- OA coverage indicator
- Status: borrador, lista, aplicada
- Actions: Editar, Vista alumno, Pauta, Aplicar, Duplicar, Eliminar

Empty state:
- Calm and useful, not decorative.
- Explain that the teacher can create a first prueba with AI, manually, or import from Word.

## Hub Screen: Guias

Design a hub for learning guides and handouts.

Required elements:
- Compact page header: "Guias"
- Course selector
- Unit selector
- Search input
- Filters: Todas, Aprendizaje, Refuerzo, Ejercitacion, Evaluacion formativa
- Primary action: "Crear con IA"
- Secondary action: "Crear manual"
- Small metrics row: Total, Con contenido, Con actividades, Listas para imprimir
- Material cards grid/list

Each guia card should show:
- Title
- Course and unit
- Type badge
- Objective preview
- Number of sections
- Number of activities
- Time
- Status
- Actions: Editar, Vista alumno, Pauta, Imprimir, Duplicar, Eliminar

Guides should feel more like teaching material than assessment forms.

## Editor Screen: Prueba

Design a compact, powerful editor for long assessments.

Top sticky toolbar:
- Back button
- Editable prueba title
- Status indicator
- Save button
- Vista alumno
- Pauta
- AI assistant button

Editor layout:
- Left or top configuration area with course, unit, type, time, ponderacion, exigencia.
- Main document area with sections and items.
- Optional right-side assistant or preview panel if space allows.

Section design:
- Clear section title
- Instructions textarea
- Stimulus/content block area for reading texts, images, tables
- Item list with item type badges
- Add question control

AI should feel integrated:
- A visible assistant panel with prompts like:
  - "Generar prueba desde esta unidad"
  - "Agregar una seccion de seleccion multiple"
  - "Hacer una version mas facil"
  - "Crear pauta de correccion"

## Editor Screen: Guia

Design a guide editor with a teaching-material flow.

Top sticky toolbar:
- Back button
- Editable guia number
- Editable guia title
- Save button
- Vista alumno
- Pauta
- AI assistant button

Editor layout:
- Configuration: course, unit, guide type, time
- Objective block
- Student instructions
- Sections
- Closing/reflection block

Each section should clearly support:
- Didactic content: text, images, tables
- Activities: multiple choice, V/F, complete, short answer, pair matching, drawing, coloring, research, word search, open response

The Guia editor should feel like building a printable classroom handout, not filling database fields.

## Interaction Principles

- Teachers should always know what to do next.
- Prioritize creation, review, print, and apply workflows.
- Keep destructive actions visually secondary.
- Use confirmation for delete.
- Avoid overwhelming first-time users.
- Make AI useful but not noisy.
- Make print/export actions visible and trustworthy.

## Output Needed From Stitch

Generate high-fidelity web app screens for:

1. Pruebas hub
2. Guias hub
3. Prueba editor
4. Guia editor

Keep all screens consistent with the same design system.

