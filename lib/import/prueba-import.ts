// ═══════════════════════════════════════════════════════════════════════════
// Importación de pruebas desde archivo .docx
// ─────────────────────────────────────────────────────────────────────────
// Detecta encabezados de sección (Ítem I, II, III...), tipo de pregunta y
// estructura básica. Genera una PruebaTemplate parcial que el docente debe
// revisar y completar manualmente.
//
// No pretende ser perfecto — los .docx son demasiado variables. Intenta
// extraer lo razonable y deja al docente afinar el resto.
// ═══════════════════════════════════════════════════════════════════════════

import {
  nuevaPrueba, nuevaSeccion, nuevoItem,
  type PruebaTemplate, type SeccionPrueba, type ItemPrueba, type TipoItem,
} from "@/lib/pruebas"

interface ImportResult {
  prueba: PruebaTemplate
  warnings: string[]
}

/**
 * Lee un .docx y extrae texto + heurística de detección.
 * `mammoth` ya está como dependencia.
 */
export async function importarPruebaDesdeDocx(
  file: File,
  asignatura: string,
  curso: string,
): Promise<ImportResult> {
  const mammoth = await import("mammoth")
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  const texto = result.value

  return procesarTextoPrueba(texto, asignatura, curso, file.name)
}

function procesarTextoPrueba(
  texto: string,
  asignatura: string,
  curso: string,
  fileName: string,
): ImportResult {
  const warnings: string[] = []
  const prueba = nuevaPrueba(asignatura, curso)

  // Nombre por defecto desde el nombre del archivo
  prueba.nombre = fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")

  const lines = texto.split("\n").map(l => l.trim()).filter(l => l.length > 0)

  // 1. Detectar encabezados tipo "Ítem I:", "Ítem II:", "Item 1.", etc.
  const seccionRegex = /^(?:[ÍI]tem|Pregunta|Sección)\s*([IVXLCDM]+|\d+)[:.\-)\s]*(.*)$/i

  // 2. Detectar tipo por keywords
  const tipoKeywords: Array<{ tipo: TipoItem; keywords: RegExp[] }> = [
    { tipo: "seleccion_multiple", keywords: [/selección\s+múltiple/i, /seleccion\s+multiple/i, /alternativa/i, /marca\s+(?:la|con)/i] },
    { tipo: "verdadero_falso", keywords: [/verdadero\s+(?:o|y|\/)\s*falso/i, /\bv\/f\b/i, /\bV\s+o\s+F\b/] },
    { tipo: "pareados", keywords: [/pareados?/i, /asocia/i, /columna\s+a/i, /une\s+con/i] },
    { tipo: "ordenar", keywords: [/orden(?:a|ar)/i, /enumera/i, /numera/i, /secuencia/i] },
    { tipo: "completar", keywords: [/completa(?:r)?/i, /rellena/i, /llena los/i, /espacios/i] },
    { tipo: "respuesta_corta", keywords: [/respuesta\s+(?:corta|breve)/i] },
    { tipo: "desarrollo", keywords: [/desarrollo/i, /argumenta/i, /justifica/i, /explica/i, /redacta/i] },
  ]

  function detectarTipo(texto: string): TipoItem {
    for (const { tipo, keywords } of tipoKeywords) {
      if (keywords.some(re => re.test(texto))) return tipo
    }
    return "seleccion_multiple"
  }

  // 3. Detectar instrucciones generales (al inicio, antes de la primera sección)
  let i = 0
  let inInstrucciones = false
  const instruccionesGen: string[] = []

  while (i < lines.length) {
    const line = lines[i]
    if (seccionRegex.test(line)) break
    if (/instrucciones/i.test(line)) {
      inInstrucciones = true
      i++
      continue
    }
    if (inInstrucciones && /^[-•*]\s+/.test(line)) {
      instruccionesGen.push(line.replace(/^[-•*]\s+/, ""))
    } else if (inInstrucciones && line.match(/^\d+[\.)]/)) {
      instruccionesGen.push(line.replace(/^\d+[\.)]\s*/, ""))
    } else if (inInstrucciones && line.length > 10 && !line.match(/^N°|^Estudiante|^Docente|^Asignatura|^Curso|^Tiempo|^Puntaje/i)) {
      // si no es metadato, agregar como instrucción
      instruccionesGen.push(line)
    }
    i++
  }
  if (instruccionesGen.length > 0) {
    prueba.instruccionesGenerales = instruccionesGen
  }

  // 4. Procesar secciones
  let seccionActual: SeccionPrueba | null = null
  let bufferEnunciado = ""
  const itemsTemp: Array<{ enunciado: string; alternativas: string[] }> = []

  const flushItem = () => {
    if (!seccionActual || !bufferEnunciado.trim()) return
    const tipo = (seccionActual.tipoPredominante !== "mixto"
      ? seccionActual.tipoPredominante
      : "seleccion_multiple") as TipoItem

    const item = nuevoItem(tipo, 1) as ItemPrueba
    item.enunciado = bufferEnunciado.trim().replace(/^\d+[.\)]\s*/, "")

    // Si es selección múltiple, las "alternativas" están en bufferAlternativas
    if (item.tipo === "seleccion_multiple" && itemsTemp.length > 0 && itemsTemp[itemsTemp.length - 1].alternativas.length > 0) {
      const alts = itemsTemp[itemsTemp.length - 1].alternativas
      item.alternativas = alts.map((t, idx) => ({
        id: `imp_alt_${Date.now()}_${idx}`,
        texto: t.replace(/^[a-d][.\)]\s*/i, ""),
        esCorrecta: idx === 0, // por defecto la primera es correcta — el docente corrige
      }))
    }

    seccionActual.items.push(item)
    bufferEnunciado = ""
  }

  while (i < lines.length) {
    const line = lines[i]
    const matchSeccion = line.match(seccionRegex)

    if (matchSeccion) {
      flushItem()
      const orden = prueba.secciones.length + 1
      const tipoDetectado = detectarTipo(line + " " + (lines[i + 1] || ""))
      seccionActual = nuevaSeccion(orden, tipoDetectado)
      seccionActual.titulo = `Ítem ${matchSeccion[1]}: ${(matchSeccion[2] || "").trim() || tipoDetectado}`
      // Buscar instrucciones de la sección en la siguiente línea
      if (i + 1 < lines.length && !lines[i + 1].match(/^\d+[.\)]/) && !seccionRegex.test(lines[i + 1])) {
        seccionActual.instrucciones = lines[i + 1]
        i++
      }
      prueba.secciones.push(seccionActual)
      itemsTemp.push({ enunciado: "", alternativas: [] })
      i++
      continue
    }

    if (!seccionActual) { i++; continue }

    // Detectar item numerado: "1.", "1)", "1-"
    const itemNumMatch = line.match(/^(\d+)[.\)\-]\s*(.*)/)
    if (itemNumMatch) {
      flushItem()
      bufferEnunciado = itemNumMatch[2]
      itemsTemp.push({ enunciado: bufferEnunciado, alternativas: [] })
      i++
      continue
    }

    // Detectar alternativa: "a)", "a.", "•"
    const altMatch = line.match(/^([a-d])[.\)]\s*(.*)/i)
    if (altMatch && itemsTemp.length > 0) {
      itemsTemp[itemsTemp.length - 1].alternativas.push(altMatch[2])
      i++
      continue
    }

    // Continuación del enunciado
    if (bufferEnunciado.length < 500) {
      bufferEnunciado += " " + line
    }
    i++
  }
  flushItem()

  // 5. Si no se detectaron secciones, crear una por defecto
  if (prueba.secciones.length === 0) {
    warnings.push("No se detectaron secciones (Ítem I, II, etc.). Se creó una vacía.")
    prueba.secciones = [nuevaSeccion(1, "seleccion_multiple")]
  }

  // 6. Warning si hay pocas alternativas en SM
  prueba.secciones.forEach(s => {
    s.items.forEach(it => {
      if (it.tipo === "seleccion_multiple" && it.alternativas.length < 2) {
        warnings.push(`Pregunta "${it.enunciado.slice(0, 40)}..." no tiene alternativas suficientes.`)
      }
    })
  })

  // Recalcular puntaje
  const puntajeMaximo = prueba.secciones.reduce((acc, s) =>
    acc + s.items.reduce((a, it) => a + (it.puntaje || 0), 0)
  , 0)
  prueba.puntajeMaximo = puntajeMaximo

  warnings.push("Revisa cuidadosamente: la importación es aproximada. Marca alternativas correctas, ajusta puntajes y agrega imágenes.")

  return { prueba, warnings }
}
