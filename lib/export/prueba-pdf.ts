// ═══════════════════════════════════════════════════════════════════════════
// Exportación PDF de Pruebas
// ─────────────────────────────────────────────────────────────────────────
// Genera HTML print-friendly con dos modos:
//   - "para_alumno": versión limpia para imprimir y aplicar
//   - "con_pauta": versión con respuestas correctas marcadas (para el docente)
// Estrategia: abre nueva ventana con window.print() — sin dependencias nuevas.
// ═══════════════════════════════════════════════════════════════════════════

import type { PruebaTemplate, ItemPrueba, SeccionPrueba } from "@/lib/pruebas"
import type { BloqueContenido } from "@/lib/evaluaciones-tipos"
import type { InfoColegio } from "@/lib/perfil"
import { romano } from "@/lib/pruebas"

export type ModoExportPrueba = "para_alumno" | "con_pauta"

export interface ExportPruebaOpciones {
  prueba: PruebaTemplate
  colegio?: InfoColegio | null
  profesorNombre?: string
  modo?: ModoExportPrueba
  /** Para personalizar puntaje obtenido / nombre alumno / etc. en una hoja específica */
  alumno?: { nombre: string; curso?: string }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function formatearFecha(): string {
  return new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" })
}

function lineasRespuesta(n: number): string {
  return Array.from({ length: Math.max(1, n) }, () =>
    `<div class="linea-respuesta">&nbsp;</div>`
  ).join("")
}

// ─── Renderizado de bloques de contenido ──────────────────────────────────

function renderBloque(b: BloqueContenido): string {
  switch (b.tipo) {
    case "texto": {
      const html = b.data.html || ""
      const cls = `bloque-texto bloque-texto-${b.data.estilo || "normal"}`
      return `<div class="${cls}">${html}</div>`
    }
    case "imagen": {
      const ancho = b.data.ancho === "small" ? "30%"
                  : b.data.ancho === "medium" ? "60%" : "100%"
      const alineacion = b.data.alineacion || "centro"
      const caption = b.data.caption
        ? `<div class="img-caption">${escapeHtml(b.data.caption)}</div>` : ""
      return `
        <div class="bloque-imagen align-${alineacion}">
          <img src="${escapeHtml(b.data.url)}" alt="${escapeHtml(b.data.alt || "")}" style="max-width:${ancho};" />
          ${caption}
        </div>`
    }
    case "tabla": {
      const cab = (b.data.cabeceras || []).map(c => `<th>${escapeHtml(c)}</th>`).join("")
      const filas = (b.data.filas || []).map(fila => {
        const celdas = fila.map((c, i) => {
          const tag = b.data.primeraColumnaCabecera && i === 0 ? "th" : "td"
          return `<${tag}>${escapeHtml(c)}</${tag}>`
        }).join("")
        return `<tr>${celdas}</tr>`
      }).join("")
      return `<table class="bloque-tabla"><thead><tr>${cab}</tr></thead><tbody>${filas}</tbody></table>`
    }
    case "separador":
      if (b.data.estilo === "saltoPagina") return `<div class="page-break"></div>`
      if (b.data.estilo === "linea") return `<hr class="bloque-linea" />`
      return `<div class="bloque-espacio"></div>`
  }
}

function renderRecursos(recursos?: BloqueContenido[]): string {
  if (!recursos || recursos.length === 0) return ""
  return `<div class="recursos-bloque">${recursos.map(renderBloque).join("")}</div>`
}

// ─── Renderizado de ítems ─────────────────────────────────────────────────

function letraAlternativa(idx: number): string {
  return String.fromCharCode(97 + idx) // a, b, c...
}

function renderItem(item: ItemPrueba, numeroItem: number, modo: ModoExportPrueba): string {
  const enunciado = `<div class="item-enunciado"><b>${numeroItem}.</b> ${escapeHtml(item.enunciado)}<span class="puntos">(${item.puntaje} pts)</span></div>`
  const recursos = renderRecursos(item.recursos)

  switch (item.tipo) {
    case "seleccion_multiple": {
      const alts = item.alternativas.map((a, i) => {
        const correcta = modo === "con_pauta" && a.esCorrecta ? " correcta" : ""
        const marca = modo === "con_pauta" && a.esCorrecta ? "✓" : "○"
        const img = a.imagenUrl ? `<img src="${escapeHtml(a.imagenUrl)}" class="alt-img" />` : ""
        return `<li class="alt${correcta}"><span class="alt-marca">${marca}</span><span class="alt-letra">${letraAlternativa(i)})</span> ${escapeHtml(a.texto)}${img}</li>`
      }).join("")
      return `<div class="item">${enunciado}${recursos}<ol class="alts">${alts}</ol></div>`
    }
    case "verdadero_falso": {
      const respuesta = modo === "con_pauta"
        ? `<span class="vf-correcta">${item.respuestaCorrecta ? "V" : "F"}</span>`
        : `<span class="vf-input">_____</span>`
      const justif = item.pideJustificacion
        ? `<div class="justif">Justificación (si es Falso): ${lineasRespuesta(2)}</div>` : ""
      return `<div class="item">${enunciado}${recursos}<div class="vf">${respuesta}</div>${justif}</div>`
    }
    case "pareados": {
      const colA = item.columnaA.map((a, i) =>
        `<tr><td class="par-num">${i + 1}.</td><td>${escapeHtml(a.texto)}</td><td class="par-input">_____</td></tr>`
      ).join("")
      // Mezclar columna B (en pauta, mostrar correspondencia)
      const colB = item.columnaB.map((b, i) => {
        if (modo === "con_pauta") {
          const aIdx = item.columnaA.findIndex(x => x.id === b.correctaParaAId)
          const aNum = aIdx >= 0 ? aIdx + 1 : "?"
          return `<tr><td class="par-letra">${letraAlternativa(i)})</td><td>${escapeHtml(b.texto)}</td><td class="par-correcta">→ ${aNum}</td></tr>`
        }
        return `<tr><td class="par-letra">${letraAlternativa(i)})</td><td>${escapeHtml(b.texto)}</td><td></td></tr>`
      }).join("")
      return `<div class="item">${enunciado}${recursos}
        <div class="pareados-tablas">
          <table class="par-tabla"><thead><tr><th colspan="3">Columna A</th></tr></thead><tbody>${colA}</tbody></table>
          <table class="par-tabla"><thead><tr><th colspan="3">Columna B</th></tr></thead><tbody>${colB}</tbody></table>
        </div></div>`
    }
    case "ordenar": {
      const items = item.pasos.map((p, i) => {
        const numero = modo === "con_pauta" ? `<b>${i + 1}</b>` : `_____`
        return `<li>${numero} ${escapeHtml(p.texto)}</li>`
      }).join("")
      return `<div class="item">${enunciado}${recursos}<ol class="ordenar">${items}</ol></div>`
    }
    case "completar": {
      const banco = item.bancoPalabras && item.bancoPalabras.length
        ? `<div class="banco-palabras"><b>Palabras:</b> ${item.bancoPalabras.map(escapeHtml).join(" · ")}</div>`
        : ""
      let texto = item.textoConBlancos || ""
      if (modo === "con_pauta") {
        let i = 0
        texto = texto.replace(/__+/g, () => `<u class="resp-pauta">${escapeHtml(item.respuestas[i++] || "____")}</u>`)
      } else {
        texto = texto.replace(/__+/g, "<u>__________</u>")
      }
      return `<div class="item">${enunciado}${recursos}${banco}<div class="completar-texto">${texto}</div></div>`
    }
    case "respuesta_corta": {
      const lineas = lineasRespuesta(item.lineasRespuesta || 2)
      const pauta = modo === "con_pauta" && item.respuestaEsperada
        ? `<div class="pauta-resp">Respuesta esperada: <i>${escapeHtml(item.respuestaEsperada)}</i></div>` : ""
      return `<div class="item">${enunciado}${recursos}${lineas}${pauta}</div>`
    }
    case "desarrollo": {
      const lineas = lineasRespuesta(item.lineasRespuesta || 5)
      const criterios = item.criterios && item.criterios.length
        ? `<div class="criterios"><b>Criterios:</b><ul>${item.criterios.map(c => `<li>${escapeHtml(c.texto)} <i>(${c.puntaje} pts)</i></li>`).join("")}</ul></div>` : ""
      const pauta = modo === "con_pauta" && item.pautaCorreccion
        ? `<div class="pauta-resp">Pauta: <i>${escapeHtml(item.pautaCorreccion)}</i></div>` : ""
      return `<div class="item">${enunciado}${recursos}${criterios}${lineas}${pauta}</div>`
    }
  }
}

function renderSeccion(sec: SeccionPrueba, contadorGlobal: { value: number }, modo: ModoExportPrueba): string {
  const titulo = `<h2 class="sec-titulo">${escapeHtml(sec.titulo)}</h2>`
  const instr = sec.instrucciones
    ? `<div class="sec-instr">${escapeHtml(sec.instrucciones)}</div>` : ""
  const estimulo = renderRecursos(sec.estimulo)

  const items = sec.items.map(it => {
    contadorGlobal.value += 1
    return renderItem(it, contadorGlobal.value, modo)
  }).join("")

  return `<section class="seccion">${titulo}${instr}${estimulo}${items}</section>`
}

// ─── HTML completo ────────────────────────────────────────────────────────

function buildHtml(opts: ExportPruebaOpciones): string {
  const { prueba, colegio, profesorNombre, alumno } = opts
  const modo = opts.modo || "para_alumno"
  const colegioNombre = escapeHtml(colegio?.nombre || "")
  const docente = escapeHtml(profesorNombre || prueba.docenteNombre || "")
  const alumnoNombre = escapeHtml(alumno?.nombre || "")
  const fecha = escapeHtml(formatearFecha())
  const tituloPrueba = escapeHtml(prueba.nombre || "Evaluación")

  const encabezadoColegio = colegio?.encabezadoHabilitado ? `
    <div class="encabezado-colegio">
      <div class="enc-izq">${escapeHtml(colegio.encabezadoTextoIzq || "").replace(/\n/g, "<br>")}</div>
      <div class="enc-der">${escapeHtml(colegio.encabezadoTextoDer || "").replace(/\n/g, "<br>")}</div>
    </div>
  ` : (colegioNombre ? `<div class="encabezado-colegio simple">${colegioNombre}</div>` : "")

  // Tabla de datos
  const tablaDatos = `
    <table class="tabla-datos">
      <tr>
        <td class="lbl">Estudiante</td><td colspan="3">${alumnoNombre || "&nbsp;"}</td>
        <td class="lbl">Curso</td><td>${escapeHtml(prueba.curso)}</td>
      </tr>
      <tr>
        <td class="lbl">Docente</td><td>${docente}</td>
        <td class="lbl">Tiempo</td><td>${prueba.tiempoMinutos ? `${prueba.tiempoMinutos} min` : "&nbsp;"}</td>
        <td class="lbl">Calificación</td><td>&nbsp;</td>
      </tr>
      <tr>
        <td class="lbl">Asignatura</td><td>${escapeHtml(prueba.asignatura)}</td>
        <td class="lbl">Puntaje Ideal</td><td>${prueba.puntajeMaximo} pts</td>
        <td class="lbl">Puntaje Final</td><td>&nbsp;</td>
      </tr>
      ${prueba.ponderacion ? `<tr><td colspan="6" class="ponderacion">Ponderación: <b>${prueba.ponderacion}%</b> · Tipo: <b>${prueba.tipoEvaluacion || "sumativa"}</b> · Fecha: ${fecha}</td></tr>` : ""}
    </table>`

  // Instrucciones generales
  const instrGen = (prueba.instruccionesGenerales || []).length
    ? `<div class="instrucciones-grales">
        <b>Instrucciones Generales:</b>
        <ul>${prueba.instruccionesGenerales.map(i => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
      </div>` : ""

  // Tabla de OAs e indicadores
  const tablaOA = (prueba.metadatosCurriculares?.objetivos?.length || 0) > 0 ? `
    <table class="tabla-oa">
      <thead><tr><th>N° Objetivo</th><th>Indicadores</th></tr></thead>
      <tbody>
        ${prueba.metadatosCurriculares!.objetivos.map(o => {
          const matchOA = o.match(/^(OA[A]?\s*\d+)/i)
          const num = matchOA ? matchOA[1] : "OA"
          const desc = o.replace(/^(OA[A]?\s*\d+):?\s*/i, "")
          // Indicadores asociados (si los hay)
          const ind = (prueba.metadatosCurriculares?.indicadores || []).slice(0, 3)
          return `<tr><td class="oa-num">${escapeHtml(num)}</td><td>${escapeHtml(desc)}<br><small>${ind.map(escapeHtml).join("<br>")}</small></td></tr>`
        }).join("")}
      </tbody>
    </table>` : ""

  // Secciones
  const contadorGlobal = { value: 0 }
  const secciones = prueba.secciones.map(s => renderSeccion(s, contadorGlobal, modo)).join("")

  return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${tituloPrueba}${modo === "con_pauta" ? " — Pauta" : ""}</title>
<style>
  @page { size: A4 portrait; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Times New Roman", Georgia, serif; color: #111827; font-size: 11pt; line-height: 1.4; margin: 0; }
  h1, h2, h3 { margin: 0; padding: 0; }
  .doc-title { font-size: 16pt; font-weight: 800; text-align: center; margin: 8mm 0 4mm; text-transform: uppercase; letter-spacing: 0.5px; }
  ${modo === "con_pauta" ? '.doc-title::after { content: " — PAUTA DE CORRECCIÓN"; color: #b91c1c; font-size: 11pt; }' : ""}

  .encabezado-colegio { display: flex; justify-content: space-between; gap: 12px; border-bottom: 2px solid #111; padding-bottom: 4mm; margin-bottom: 4mm; font-size: 9.5pt; }
  .encabezado-colegio.simple { display: block; text-align: center; font-weight: 700; }
  .enc-izq, .enc-der { line-height: 1.3; }

  .tabla-datos { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
  .tabla-datos td { border: 1px solid #6b7280; padding: 5px 8px; font-size: 10.5pt; }
  .tabla-datos td.lbl { background: #f3f4f6; font-weight: 700; width: 14%; }
  .tabla-datos td.ponderacion { background: #fef3c7; text-align: center; font-size: 10pt; }

  .instrucciones-grales { margin: 3mm 0; padding: 3mm; border-left: 4px solid #6b7280; background: #f9fafb; }
  .instrucciones-grales ul { margin: 4px 0 0 18px; padding: 0; }
  .instrucciones-grales li { font-size: 10pt; margin: 2px 0; }

  .tabla-oa { width: 100%; border-collapse: collapse; margin: 3mm 0 5mm; font-size: 10pt; }
  .tabla-oa th, .tabla-oa td { border: 1px solid #6b7280; padding: 5px 7px; text-align: left; vertical-align: top; }
  .tabla-oa th { background: #e5e7eb; font-weight: 700; }
  .tabla-oa td.oa-num { font-weight: 700; width: 18%; background: #f9fafb; }

  .seccion { margin: 6mm 0; }
  .sec-titulo { font-size: 13pt; font-weight: 800; background: #111827; color: white; padding: 4px 10px; margin-bottom: 3mm; }
  .sec-instr { font-style: italic; font-size: 10.5pt; margin-bottom: 3mm; padding: 4px 8px; border-left: 3px solid #9ca3af; background: #f9fafb; }

  .recursos-bloque { margin: 3mm 0; }
  .bloque-texto { margin: 2mm 0; }
  .bloque-texto-destacado { background: #fef9c3; padding: 4px 8px; border-radius: 4px; }
  .bloque-texto-instrucciones { font-style: italic; color: #4b5563; }
  .bloque-texto-lectura { font-size: 11pt; line-height: 1.5; padding: 3mm; background: #f9fafb; border: 1px dashed #d1d5db; }

  .bloque-imagen { margin: 3mm 0; text-align: center; }
  .bloque-imagen.align-izq { text-align: left; }
  .bloque-imagen.align-der { text-align: right; }
  .bloque-imagen img { max-width: 100%; height: auto; border-radius: 2px; }
  .img-caption { font-size: 9pt; color: #6b7280; margin-top: 2mm; font-style: italic; }

  .bloque-tabla { width: 100%; border-collapse: collapse; margin: 3mm 0; font-size: 10.5pt; }
  .bloque-tabla th, .bloque-tabla td { border: 1px solid #6b7280; padding: 4px 8px; }
  .bloque-tabla th { background: #f3f4f6; font-weight: 700; }

  .bloque-linea { border: none; border-top: 1px solid #d1d5db; margin: 4mm 0; }
  .bloque-espacio { height: 4mm; }
  .page-break { page-break-after: always; }

  .item { margin: 4mm 0; padding-left: 4px; page-break-inside: avoid; }
  .item-enunciado { font-size: 11pt; line-height: 1.5; }
  .item-enunciado .puntos { color: #6b7280; font-size: 9.5pt; margin-left: 8px; font-style: italic; }

  .alts { list-style: none; padding: 0; margin: 2mm 0 0 6mm; }
  .alts .alt { margin: 1.5mm 0; padding-left: 2px; }
  .alts .alt.correcta { background: #d1fae5; padding: 2px 4px; border-radius: 3px; }
  .alts .alt-marca { font-size: 11pt; margin-right: 6px; }
  .alts .alt-letra { font-weight: 700; margin-right: 4px; }
  .alts .alt-img { max-height: 18mm; vertical-align: middle; margin-left: 6px; }

  .vf { margin: 2mm 0 0 6mm; font-size: 11pt; }
  .vf-correcta { font-weight: 800; color: #15803d; padding: 2px 8px; background: #d1fae5; border-radius: 3px; }
  .vf-input { letter-spacing: 6px; }
  .justif { margin: 2mm 0 0 6mm; }

  .pareados-tablas { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin: 2mm 0 0; }
  .par-tabla { border-collapse: collapse; width: 100%; font-size: 10.5pt; }
  .par-tabla th { background: #f3f4f6; padding: 4px; border: 1px solid #6b7280; }
  .par-tabla td { padding: 3px 6px; border: 1px solid #d1d5db; }
  .par-num, .par-letra { font-weight: 700; width: 10%; text-align: center; }
  .par-input { text-align: center; letter-spacing: 4px; width: 18%; }
  .par-correcta { color: #15803d; font-weight: 700; }

  .ordenar { list-style: none; padding: 0; margin: 2mm 0 0 6mm; }
  .ordenar li { margin: 1.5mm 0; }

  .banco-palabras { margin: 2mm 0; padding: 3px 8px; background: #fef3c7; border-radius: 3px; font-size: 10pt; }
  .completar-texto { margin: 2mm 0 0 6mm; line-height: 1.8; font-size: 11pt; }
  .completar-texto u { letter-spacing: 2px; min-width: 30mm; display: inline-block; }
  .completar-texto u.resp-pauta { color: #b91c1c; font-weight: 700; }

  .linea-respuesta { border-bottom: 1px solid #6b7280; height: 7mm; margin: 1mm 6mm; }

  .criterios { margin: 2mm 0 0 6mm; font-size: 9.5pt; color: #4b5563; }
  .criterios ul { margin: 0 0 0 12px; padding: 0; }

  .pauta-resp { margin: 2mm 0 0 6mm; padding: 3px 8px; background: #fee2e2; border-left: 3px solid #b91c1c; font-size: 10pt; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
${encabezadoColegio}
<h1 class="doc-title">${tituloPrueba}</h1>
${tablaDatos}
${instrGen}
${tablaOA}
${secciones}
</body>
</html>`
}

export function abrirPruebaImprimible(opts: ExportPruebaOpciones): void {
  const html = buildHtml(opts)
  const win = window.open("", "_blank", "width=900,height=900")
  if (!win) {
    alert("Permite las ventanas emergentes para imprimir.")
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
  setTimeout(() => {
    try {
      win.focus()
      win.print()
    } catch {}
  }, 700)
}
