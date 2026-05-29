export type PedagogicalEngine = "legacy" | "pedagogical_v1"

export interface StudentSummary {
  anonymized: true
  total: number
  pieCount: number
  pieDiagnoses: string[]
  supportSignals: string[]
}

export interface PedagogicalExternalSource {
  title: string
  uri: string
  snippet?: string
}

export interface PedagogicalBrief {
  diagnostico: string
  focoPedagogico: string
  tono: string
  estrategiaPrincipal: string
  estrategiasAplicadas: string[]
  riesgos: string[]
  adecuaciones: string[]
  evidenciaEsperada: string[]
  fuentesExternas?: PedagogicalExternalSource[]
  textoEditable: string
}

interface Strategy {
  id: string
  title: string
  focus: string[]
  tones: string[]
  subjects: string[]
  keywords: string[]
  needs: string[]
  summary: string
  steps: string[]
  adaptations: string[]
  evidence: string[]
  risks: string[]
}

const STRATEGIES: Strategy[] = [
  {
    id: "dua_multimodal",
    title: "DUA multimodal con evidencia breve",
    focus: ["dua", "inclusion", "activo"],
    tones: ["ludico", "academico", "tecnico"],
    subjects: [],
    keywords: ["comprender", "identificar", "reconocer", "describir", "representar"],
    needs: ["pie", "tdah", "tea", "atencion", "lectura", "lenguaje"],
    summary: "Presenta el mismo aprendizaje por tres vias: visual, oral/corporal y producto breve.",
    steps: [
      "Activacion con estimulo corto y pregunta visible.",
      "Modelado docente con ejemplo y contraejemplo.",
      "Practica guiada en parejas con apoyo visual.",
      "Salida rapida individual para recoger evidencia.",
    ],
    adaptations: [
      "Dar instrucciones en pasos numerados y visibles.",
      "Permitir respuesta oral, grafica o escrita segun necesidad.",
      "Reducir carga de copia y aumentar pistas visuales.",
    ],
    evidence: [
      "Ticket de salida con una respuesta observable.",
      "Registro docente de 2 criterios durante la practica guiada.",
    ],
    risks: [
      "Sobrecarga de instrucciones si se proponen demasiadas actividades.",
      "Evidencia poco clara si no se define una produccion concreta.",
    ],
  },
  {
    id: "abp_producto_minimo",
    title: "ABP de producto minimo viable",
    focus: ["abp", "activo"],
    tones: ["ludico", "tecnico", "academico"],
    subjects: [],
    keywords: ["crear", "elaborar", "argumentar", "aplicar", "resolver"],
    needs: ["motivacion", "colaboracion", "producto"],
    summary: "Convierte el objetivo en un desafio pequeno con producto visible al final de la clase.",
    steps: [
      "Plantear una pregunta desafiante conectada al contexto del curso.",
      "Definir criterios de exito antes de trabajar.",
      "Construir un producto pequeno en equipos.",
      "Cerrar con galeria rapida y retroalimentacion por criterio.",
    ],
    adaptations: [
      "Asignar roles claros: lector, relator, encargado de material y verificador.",
      "Ofrecer plantilla base para estudiantes que necesiten andamiaje.",
    ],
    evidence: [
      "Producto del equipo alineado al OA.",
      "Autoevaluacion breve usando los criterios de exito.",
    ],
    risks: [
      "El producto puede desplazar el aprendizaje si no se explicita el contenido.",
      "La colaboracion puede ser desigual sin roles concretos.",
    ],
  },
  {
    id: "estaciones_activas",
    title: "Estaciones activas con rotacion corta",
    focus: ["activo", "dua", "inclusion"],
    tones: ["ludico", "tecnico"],
    subjects: [],
    keywords: ["clasificar", "relacionar", "comparar", "aplicar", "practicar"],
    needs: ["atencion", "movimiento", "participacion", "tdah"],
    summary: "Organiza la clase en microtareas de 7 a 10 minutos para mantener atencion y participacion.",
    steps: [
      "Presentar objetivo y reglas de rotacion.",
      "Estacion 1: reconocer o explorar.",
      "Estacion 2: aplicar con apoyo.",
      "Estacion 3: explicar o producir evidencia.",
      "Cierre comun con patron detectado por el curso.",
    ],
    adaptations: [
      "Usar temporizador visual.",
      "Entregar tarjetas de instruccion por estacion.",
      "Dejar una estacion de baja demanda lectora.",
    ],
    evidence: [
      "Hoja de ruta completada por estacion.",
      "Una respuesta oral o grafica en el cierre.",
    ],
    risks: [
      "Transiciones desordenadas si no se anticipan roles y tiempos.",
      "Puede quedar superficial si cada estacion no apunta al mismo contenido.",
    ],
  },
  {
    id: "modelado_practica",
    title: "Modelado, practica guiada y autonomia gradual",
    focus: ["tecnico", "dua", "inclusion"],
    tones: ["tecnico", "academico"],
    subjects: [],
    keywords: ["aplicar", "resolver", "representar", "analizar", "interpretar"],
    needs: ["andamiaje", "lectura", "escritura", "brecha"],
    summary: "Asegura profundidad con una secuencia explicita: yo hago, hacemos, ustedes hacen.",
    steps: [
      "Modelado docente pensando en voz alta.",
      "Practica guiada con preguntas de control.",
      "Practica colaborativa con pauta breve.",
      "Practica autonoma diferenciada por nivel de apoyo.",
    ],
    adaptations: [
      "Mantener ejemplo resuelto visible.",
      "Dar banco de palabras o pasos para quien lo necesite.",
      "Permitir extension a estudiantes avanzados.",
    ],
    evidence: [
      "Producto individual corto.",
      "Comparacion entre intento guiado e intento autonomo.",
    ],
    risks: [
      "Puede volverse expositivo si no se limita el modelado.",
      "El cierre debe recoger evidencia, no solo preguntar si entendieron.",
    ],
  },
  {
    id: "musica_cuerpo_escucha",
    title: "Escucha activa, cuerpo y representacion visual",
    focus: ["activo", "dua", "inclusion"],
    tones: ["ludico", "tecnico"],
    subjects: ["musica", "musica y artes"],
    keywords: ["sonido", "ritmo", "duracion", "pulso", "escuchar", "representar"],
    needs: ["movimiento", "atencion", "participacion"],
    summary: "Usa escucha, movimiento corporal y simbolos simples para llevar el contenido musical a evidencia visible.",
    steps: [
      "Escuchar un patron breve y marcarlo con el cuerpo.",
      "Representar el patron con tarjetas, dibujos o grafias simples.",
      "Comparar dos ejemplos para verbalizar la diferencia.",
      "Crear o interpretar un micro patron en grupo.",
    ],
    adaptations: [
      "Permitir respuestas corporales en vez de escritura extensa.",
      "Usar pictogramas o colores para cualidades del sonido.",
      "Reducir ruido simultaneo para estudiantes sensibles.",
    ],
    evidence: [
      "Representacion visual del patron escuchado.",
      "Ejecucion o explicacion breve del criterio musical trabajado.",
    ],
    risks: [
      "La actividad puede quedar solo ludica si no se nombra el concepto musical.",
      "La evidencia debe distinguir escucha, representacion y explicacion.",
    ],
  },
  {
    id: "lectura_compartida",
    title: "Lectura compartida con andamiaje de comprension",
    focus: ["dua", "inclusion", "activo"],
    tones: ["academico", "ludico"],
    subjects: ["lenguaje", "lenguaje y comunicacion"],
    keywords: ["leer", "texto", "comprension", "inferir", "vocabulario", "argumentar"],
    needs: ["lectura", "lenguaje", "escritura"],
    summary: "Divide la comprension en antes, durante y despues de la lectura con apoyos visibles.",
    steps: [
      "Predecir desde titulo, imagen o vocabulario clave.",
      "Leer por fragmentos con preguntas de monitoreo.",
      "Subrayar evidencia textual con codigo de colores.",
      "Responder con frase marco y cita simple.",
    ],
    adaptations: [
      "Entregar vocabulario previo con imagen o ejemplo.",
      "Permitir lectura compartida o audiolectura.",
      "Usar frase iniciadora para respuestas escritas.",
    ],
    evidence: [
      "Respuesta breve con evidencia del texto.",
      "Organizador grafico de idea principal y detalle.",
    ],
    risks: [
      "Las preguntas pueden ser demasiado generales si no se vinculan al OA.",
      "La escritura puede ocultar comprension si no hay apoyos.",
    ],
  },
]

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function plain(value: unknown): string {
  return clean(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(clean).filter(Boolean)
}

function normalizeKey(value: unknown): string {
  return clean(value)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

function clip(value: unknown, max = 900): string {
  const text = plain(value)
  return text.length > max ? `${text.slice(0, max).trimEnd()}...` : text
}

export function buildAnonymousStudentSummary(students: Array<Record<string, unknown>>): StudentSummary {
  const total = students.length
  const pieStudents = students.filter((student) => student.pie === true || student.hasPie === true)
  const diagnoses = new Set<string>()
  const signalCounts = new Map<string, number>()
  const signalDefs = [
    ["tdah", /tdah|atenci[oó]n|concentraci[oó]n/i],
    ["tea", /\btea\b|autis/i],
    ["lectura", /lectura|leer|decodific/i],
    ["escritura", /escritura|grafomot|redacci/i],
    ["lenguaje", /lenguaje|vocabulario|oral/i],
    ["socioemocional", /emoc|ansiedad|frustraci|conduct/i],
    ["sensorial", /sensorial|auditiv|visual|ruido/i],
    ["motricidad", /motric|coordinaci/i],
  ] as const

  for (const student of pieStudents) {
    const diagnosis = clean(student.pieDiagnostico || student.diagnostico)
    if (diagnosis) diagnoses.add(diagnosis.slice(0, 80))
    const notes = `${clean(student.pieNotas)} ${clean(student.notas)} ${diagnosis}`
    for (const [label, pattern] of signalDefs) {
      if (pattern.test(notes)) signalCounts.set(label, (signalCounts.get(label) || 0) + 1)
    }
  }

  return {
    anonymized: true,
    total,
    pieCount: pieStudents.length,
    pieDiagnoses: Array.from(diagnoses).slice(0, 6),
    supportSignals: Array.from(signalCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => `${label}: ${count}`)
      .slice(0, 8),
  }
}

function formatStudentSummary(summary?: StudentSummary): string {
  if (!summary || summary.total === 0) return "No hay resumen anonimo de estudiantes disponible."
  return [
    `Total estudiantes considerados: ${summary.total}.`,
    `Estudiantes PIE/NEE: ${summary.pieCount}.`,
    summary.pieDiagnoses.length ? `Diagnosticos o apoyos declarados: ${summary.pieDiagnoses.join("; ")}.` : "",
    summary.supportSignals.length ? `Senales agregadas de apoyo: ${summary.supportSignals.join("; ")}.` : "",
    "Privacidad: resumen anonimo, sin nombres ni identificadores personales.",
  ].filter(Boolean).join("\n")
}

function formatOAs(oas: any[] = []): string {
  if (!Array.isArray(oas) || oas.length === 0) return "No hay OA seleccionados."
  return oas.map((oa) => {
    const numero = clean(oa?.numero) || (typeof oa?.numero === "number" ? String(oa.numero) : "")
    const header = numero ? `OA ${numero}` : clean(oa?.id) || "OA"
    const indicadores = Array.isArray(oa?.indicadores)
      ? oa.indicadores.map((i: any) => clean(i?.texto || i)).filter(Boolean)
      : []
    return `- ${header}: ${clean(oa?.descripcion) || "Sin descripcion"}${indicadores.length ? `\n  Indicadores: ${indicadores.join("; ")}` : ""}`
  }).join("\n")
}

function formatUnit(unit: any): string {
  if (!unit) return "No hay contexto adicional de unidad."
  return [
    clean(unit.nombre_unidad) ? `Unidad: ${clean(unit.nombre_unidad)}` : "",
    clean(unit.proposito) ? `Proposito: ${clip(unit.proposito, 700)}` : "",
    list(unit.conocimientos).length ? `Conocimientos: ${list(unit.conocimientos).join("; ")}` : "",
    list(unit.conocimientos_previos).length ? `Conocimientos previos: ${list(unit.conocimientos_previos).join("; ")}` : "",
    list(unit.habilidades).length ? `Habilidades de unidad: ${list(unit.habilidades).join("; ")}` : "",
    list(unit.actitudes).length ? `Actitudes de unidad: ${list(unit.actitudes).join("; ")}` : "",
    clean(unit.adecuaciones_dua) ? `DUA unidad: ${clip(unit.adecuaciones_dua, 700)}` : "",
    clean(unit.contexto_docente) ? `Contexto docente de unidad: ${clip(unit.contexto_docente, 700)}` : "",
    clean(unit.objetivo_docente) ? `Objetivo docente de unidad: ${clip(unit.objetivo_docente, 500)}` : "",
  ].filter(Boolean).join("\n") || "No hay contexto adicional de unidad."
}

function formatReferences(body: any): string {
  const acts = Array.isArray(body?.referenciasCurriculares?.actividadesSugeridas)
    ? body.referenciasCurriculares.actividadesSugeridas
    : Array.isArray(body?.unidad?.actividades_sugeridas)
      ? body.unidad.actividades_sugeridas
      : []
  const evals = Array.isArray(body?.referenciasCurriculares?.ejemplosEvaluacion)
    ? body.referenciasCurriculares.ejemplosEvaluacion
    : Array.isArray(body?.unidad?.ejemplos_evaluacion)
      ? body.unidad.ejemplos_evaluacion
      : []
  const actText = acts.slice(0, 4).map((a: any) => `- ${clean(a.nombre) || clean(a.titulo) || "Actividad"}: ${clip(a.descripcion || a.actividad_evaluacion, 280)}`).join("\n")
  const evalText = evals.slice(0, 3).map((e: any) => `- ${clean(e.titulo) || "Ejemplo"}: ${clip(e.actividad_evaluacion || e.descripcion, 280)}`).join("\n")
  if (!actText && !evalText) return "No hay sugerencias ministeriales o ejemplos de evaluacion cargados para esta clase."
  return [
    actText ? `Actividades sugeridas:\n${actText}` : "",
    evalText ? `Ejemplos de evaluacion:\n${evalText}` : "",
  ].filter(Boolean).join("\n")
}

function inferNeeds(body: any): string[] {
  const haystack = normalizeKey([
    body?.focoPedagogico,
    body?.tono,
    body?.contextoProfesor,
    body?.instruccionesAdicionales,
    body?.unidad?.adecuaciones_dua,
    body?.studentSummary?.pieDiagnoses?.join(" "),
    body?.studentSummary?.supportSignals?.join(" "),
    ...(Array.isArray(body?.oas) ? body.oas.map((oa: any) => oa?.descripcion) : []),
  ].filter(Boolean).join(" "))
  const needs = new Set<string>()
  if (body?.studentSummary?.pieCount > 0) needs.add("pie")
  ;["tdah", "tea", "atencion", "lectura", "lenguaje", "escritura", "movimiento", "motivacion", "colaboracion", "andamiaje"].forEach((need) => {
    if (haystack.includes(need)) needs.add(need)
  })
  return Array.from(needs)
}

export function selectPedagogicalStrategies(body: any, max = 3): Strategy[] {
  const focus = normalizeKey(body?.focoPedagogico || "dua")
  const tone = normalizeKey(body?.tono || "ludico")
  const subject = normalizeKey(body?.asignatura)
  const needs = inferNeeds(body)
  const oaText = normalizeKey((Array.isArray(body?.oas) ? body.oas : []).map((oa: any) => `${oa?.descripcion || ""} ${(oa?.indicadores || []).map((i: any) => i?.texto || i).join(" ")}`).join(" "))

  return STRATEGIES
    .map((strategy) => {
      let score = 0
      if (strategy.focus.includes(focus)) score += 4
      if (strategy.tones.includes(tone)) score += 2
      if (strategy.subjects.length === 0 || strategy.subjects.some((s) => subject.includes(s))) score += strategy.subjects.length ? 4 : 1
      for (const keyword of strategy.keywords) if (oaText.includes(normalizeKey(keyword))) score += 1
      for (const need of needs) if (strategy.needs.includes(need)) score += 2
      return { strategy, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((item) => item.strategy)
}

export function formatPedagogicalBrief(brief: Omit<PedagogicalBrief, "textoEditable">): string {
  return [
    `Diagnostico pedagogico:\n${brief.diagnostico}`,
    `Foco y tono:\n- Foco: ${brief.focoPedagogico}\n- Tono: ${brief.tono}`,
    `Estrategia principal:\n${brief.estrategiaPrincipal}`,
    brief.estrategiasAplicadas.length ? `Estrategias aplicadas:\n${brief.estrategiasAplicadas.map((item) => `- ${item}`).join("\n")}` : "",
    brief.riesgos.length ? `Riesgos a evitar:\n${brief.riesgos.map((item) => `- ${item}`).join("\n")}` : "",
    brief.adecuaciones.length ? `Adecuaciones y apoyos:\n${brief.adecuaciones.map((item) => `- ${item}`).join("\n")}` : "",
    brief.evidenciaEsperada.length ? `Evidencia esperada:\n${brief.evidenciaEsperada.map((item) => `- ${item}`).join("\n")}` : "",
    brief.fuentesExternas?.length ? `Fuentes externas consultadas:\n${brief.fuentesExternas.map((source) => `- ${source.title}: ${source.uri}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n")
}

export function buildPedagogicalBrief(body: any): PedagogicalBrief {
  const focus = clean(body?.focoPedagogico) || "dua"
  const tone = clean(body?.tono) || "ludico"
  const strategies = selectPedagogicalStrategies(body)
  const principal = strategies[0]
  const oaCount = Array.isArray(body?.oas) ? body.oas.length : 0
  const selectedIndicators = Array.isArray(body?.oas)
    ? body.oas.reduce((acc: number, oa: any) => acc + (Array.isArray(oa?.indicadores) ? oa.indicadores.length : 0), 0)
    : 0
  const studentSummary = body?.studentSummary as StudentSummary | undefined
  const diagnostico = [
    `La clase debe responder a ${oaCount || "los"} OA seleccionados y ${selectedIndicators} indicadores priorizados.`,
    clean(body?.contextoProfesor) ? `La idea docente declarada es: "${clip(body.contextoProfesor, 280)}".` : "No hay una idea docente explicita; la propuesta debe apoyarse en el OA y la unidad.",
    studentSummary?.total ? `El curso tiene ${studentSummary.total} estudiantes en el resumen anonimo; ${studentSummary.pieCount} requieren apoyos PIE/NEE declarados.` : "No hay datos de estudiantes disponibles; se usara DUA general.",
    principal ? `La estrategia recomendada es "${principal.title}" porque calza con el foco ${focus}, el tono ${tone} y las necesidades detectadas.` : "",
  ].filter(Boolean).join(" ")

  const risks = Array.from(new Set(strategies.flatMap((strategy) => strategy.risks))).slice(0, 5)
  const adaptations = Array.from(new Set([
    ...strategies.flatMap((strategy) => strategy.adaptations),
    ...(studentSummary?.pieCount ? ["Mantener apoyos anonimos y universales, sin exponer estudiantes PIE frente al curso."] : []),
  ])).slice(0, 7)
  const evidence = Array.from(new Set(strategies.flatMap((strategy) => strategy.evidence))).slice(0, 5)
  const briefBase = {
    diagnostico,
    focoPedagogico: focus,
    tono: tone,
    estrategiaPrincipal: principal?.title || "DUA multimodal con evidencia breve",
    estrategiasAplicadas: strategies.map((strategy) => `${strategy.title}: ${strategy.summary}`),
    riesgos: risks,
    adecuaciones: adaptations,
    evidenciaEsperada: evidence,
    fuentesExternas: body?.pedagogicalBrief?.fuentesExternas || body?.externalSources || [],
  }

  return {
    ...briefBase,
    textoEditable: clean(body?.pedagogicalBrief?.textoEditable) || formatPedagogicalBrief(briefBase),
  }
}

function formatStrategies(strategies: Strategy[]): string {
  return strategies.map((strategy) => [
    `- ${strategy.title}: ${strategy.summary}`,
    `  Pasos: ${strategy.steps.join(" | ")}`,
    `  Adecuaciones: ${strategy.adaptations.join(" | ")}`,
    `  Evidencia: ${strategy.evidence.join(" | ")}`,
  ].join("\n")).join("\n")
}

function formatSources(sources?: PedagogicalExternalSource[]): string {
  if (!sources?.length) return "No se usaron fuentes externas en esta generacion."
  return sources.slice(0, 6).map((source) => `- ${source.title}: ${source.uri}${source.snippet ? ` (${clip(source.snippet, 180)})` : ""}`).join("\n")
}

export function buildPedagogicalLessonPrompt(body: any): string {
  const brief = buildPedagogicalBrief(body)
  const strategies = selectPedagogicalStrategies(body)
  const current = body?.claseActual || {}

  return `Eres un motor pedagogico experto para EduPanel. Tu tarea es disenar una clase chilena aplicable, contextualizada y didacticamente fuerte. No eres un chatbot generico: debes usar el brief pedagogico, el curriculo, el contexto del curso y las estrategias seleccionadas.

MODO: Motor Pedagogico v1 para clases.
FOCO PEDAGOGICO: ${brief.focoPedagogico}
TONO DIDACTICO: ${brief.tono}

BRIEF PEDAGOGICO EDITABLE DEL DOCENTE (vinculante):
${brief.textoEditable}

CONTEXTO CURRICULAR:
- Asignatura: ${clean(body?.asignatura) || "No especificada"}
- Curso: ${clean(body?.curso) || "No especificado"}
- Nivel curricular: ${clean(body?.nivelCurricular) || clean(body?.curso) || "No especificado"}
- Clase: ${body?.numeroClase ?? "?"} de ${body?.totalClasesUnidad ?? "?"}
- Duracion: ${body?.duracionMinutos ?? 90} minutos
- Idea/contexto del profesor: ${clip(body?.contextoProfesor || body?.instruccionesAdicionales) || "No especificado"}

OA E INDICADORES SELECCIONADOS:
${formatOAs(body?.oas)}

UNIDAD Y CONTEXTO DOCENTE:
${formatUnit(body?.unidad)}

REFERENCIAS MINEDUC / BANCO INTERNO DISPONIBLE:
${formatReferences(body)}

RESUMEN ANONIMO DEL CURSO:
${formatStudentSummary(body?.studentSummary)}

ESTRATEGIAS CURADAS SELECCIONADAS:
${formatStrategies(strategies)}

FUENTES EXTERNAS USADAS SOLO SI EL DOCENTE LAS PIDIO:
${formatSources(brief.fuentesExternas)}

CLASE ACTUAL, SI EXISTE:
${JSON.stringify({
  objetivo: plain(current.objetivo),
  inicio: clip(current.inicio, 500),
  desarrollo: clip(current.desarrollo, 700),
  cierre: clip(current.cierre, 500),
  adecuacion: clip(current.adecuacion, 400),
  materiales: list(current.materiales),
  tics: list(current.tics),
}, null, 2)}

INSTRUCCIONES DE CALIDAD:
1. Genera una clase especifica para el OA, no una plantilla generica.
2. El objetivo debe ser una sola oracion con VERBO + CONTENIDO + CONTEXTO, maximo 32 palabras.
3. Inicio, desarrollo y cierre deben incluir acciones del docente, acciones de estudiantes, tiempo sugerido y evidencia observable.
4. El desarrollo debe usar explicitamente la estrategia principal y debe tener modelado, practica guiada y aplicacion.
5. La adecuacion debe ser DUA/PIE concreta, anonima y aplicable sin exponer estudiantes.
6. Los materiales y TIC deben ser realistas para una sala chilena.
7. La actividad de evaluacion debe estar integrada en la clase y tener criterios observables.
8. Antes de responder, revisa internamente si el resultado es generico. Si lo es, reescribelo con mas contexto, pasos y evidencia.

RESPUESTA: devuelve solo JSON puro, sin markdown ni explicaciones, con esta forma exacta:
{
  "analisisBloom": [
    { "oaId": "OA1", "categoria": "Comprender", "nivel": "MEDIO", "justificacion": "...", "verbosSugeridos": ["..."] }
  ],
  "objetivoMultinivel": {
    "basico": "...",
    "intermedio": "...",
    "avanzado": "...",
    "recomendado": "intermedio"
  },
  "objetivo": "...",
  "indicadoresEvaluacion": [
    { "id": "IND_1", "texto": "...", "dimension": "saber", "nivelBloom": "MEDIO", "oaId": "OA1" }
  ],
  "actividadEvaluacion": {
    "tipo": "formativa",
    "descripcion": "...",
    "criterios": ["...", "..."],
    "alineacionMBE": ["4.1", "4.2", "9.2"]
  },
  "inicio": "<p>...</p>",
  "desarrollo": "<p>...</p>",
  "cierre": "<p>...</p>",
  "materiales": ["..."],
  "tics": ["..."],
  "adecuacion": "<p>...</p>"
}`
}

export function findLessonQualityIssues(lesson: any): string[] {
  const issues: string[] = []
  const objetivo = plain(lesson?.objetivo)
  const inicio = plain(lesson?.inicio)
  const desarrollo = plain(lesson?.desarrollo)
  const cierre = plain(lesson?.cierre)
  const adecuacion = plain(lesson?.adecuacion)

  if (!objetivo) issues.push("Falta objetivo de clase.")
  if (objetivo.split(/\s+/).filter(Boolean).length > 36) issues.push("El objetivo es demasiado largo.")
  if (inicio.length < 180) issues.push("Inicio demasiado breve o generico.")
  if (desarrollo.length < 420) issues.push("Desarrollo demasiado breve o generico.")
  if (cierre.length < 160) issues.push("Cierre demasiado breve o generico.")
  if (adecuacion.length < 120) issues.push("Adecuacion DUA/PIE insuficiente.")
  if (!Array.isArray(lesson?.materiales) || lesson.materiales.length < 2) issues.push("Materiales poco concretos.")
  if (!lesson?.actividadEvaluacion?.descripcion) issues.push("Falta actividad de evaluacion formativa.")

  return issues
}

export function buildPedagogicalRepairPrompt(body: any, currentJson: Record<string, unknown>, issues: string[]): string {
  return `${buildPedagogicalLessonPrompt(body)}

REVISION DE CALIDAD OBLIGATORIA:
La respuesta anterior fue considerada insuficiente por estas razones:
${issues.map((issue) => `- ${issue}`).join("\n")}

JSON ANTERIOR:
${JSON.stringify(currentJson, null, 2)}

Reescribe el JSON completo. Conserva lo que este correcto, pero mejora inicio, desarrollo, cierre, adecuacion y evaluacion para que sean especificos, aplicables y alineados al brief pedagogico. Devuelve solo JSON puro.`
}
