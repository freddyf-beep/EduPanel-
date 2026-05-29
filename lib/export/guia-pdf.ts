// ═══════════════════════════════════════════════════════════════════════════
// Exportación PDF de Guías de aprendizaje
// ─────────────────────────────────────────────────────────────────────────
// Genera HTML print-friendly. Las guías mezclan contenido didáctico con
// actividades intercaladas. Soporta dos modos:
//   - "para_alumno": versión para imprimir y entregar
//   - "con_pauta": versión con respuestas marcadas
// ═══════════════════════════════════════════════════════════════════════════

import type { GuiaTemplate, ActividadGuia, SeccionGuia } from "@/lib/guias"
import type { BloqueContenido } from "@/lib/evaluaciones-tipos"
import type { InfoColegio } from "@/lib/perfil"

export type ModoExportGuia = "para_alumno" | "con_pauta"

export interface ExportGuiaOpciones {
  guia: GuiaTemplate
  colegio?: InfoColegio | null
  profesorNombre?: string
  modo?: ModoExportGuia
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

function lineasRespuesta(n: number): string {
  return Array.from({ length: Math.max(1, n) }, () =>
    `<div class="linea-resp">&nbsp;</div>`
  ).join("")
}

function letraAlt(idx: number): string {
  return String.fromCharCode(97 + idx)
}

// ─── Bloques ──────────────────────────────────────────────────────────────

function renderBloque(b: BloqueContenido): string {
  switch (b.tipo) {
    case "texto":
      return `<div class="bloque-texto bloque-texto-${b.data.estilo || "normal"}">${b.data.html || ""}</div>`
    case "imagen": {
      const ancho = b.data.ancho === "small" ? "30%"
                  : b.data.ancho === "medium" ? "60%" : "100%"
      const alineacion = b.data.alineacion || "centro"
      const caption = b.data.caption
        ? `<div class="img-caption">${escapeHtml(b.data.caption)}</div>` : ""
      if (!b.data.url) {
        return `<div class="bloque-imagen align-${alineacion}">
          <div class="score-placeholder">Espacio para pentagrama / partitura</div>
          ${caption}</div>`
      }
      return `<div class="bloque-imagen align-${alineacion}">
        <img src="${escapeHtml(b.data.url)}" alt="${escapeHtml(b.data.alt || "")}" style="max-width:${ancho};" />
        ${caption}</div>`
    }
    case "tabla": {
      const cab = (b.data.cabeceras || []).map(c => `<th>${escapeHtml(c)}</th>`).join("")
      const filas = (b.data.filas || []).map(f => {
        const celdas = f.map((c, i) => {
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
  return recursos.map(renderBloque).join("")
}

// ─── Actividades ──────────────────────────────────────────────────────────

function renderActividad(act: ActividadGuia, modo: ModoExportGuia): string {
  const num = act.numero ? `<b>${act.numero}.</b>` : "•"
  const puntos = act.puntaje ? `<span class="puntos">(${act.puntaje} pts)</span>` : ""
  const enunciado = `<div class="act-enunciado">${num} ${escapeHtml(act.enunciado)} ${puntos}</div>`
  const recursos = renderRecursos(act.recursos)

  let cuerpo = ""

  switch (act.datos?.tipo) {
    case "seleccion_multiple": {
      cuerpo = `<ol class="alts">${(act.datos.alternativas || []).map((a, i) => {
        const correcta = modo === "con_pauta" && a.correcta ? " correcta" : ""
        const marca = modo === "con_pauta" && a.correcta ? "✓" : "○"
        const img = a.imagenUrl ? `<img src="${escapeHtml(a.imagenUrl)}" class="alt-img" />` : ""
        return `<li class="alt${correcta}"><span class="alt-marca">${marca}</span><b>${letraAlt(i)})</b> ${escapeHtml(a.texto)}${img}</li>`
      }).join("")}</ol>`
      break
    }
    case "verdadero_falso": {
      cuerpo = `<table class="vf-tabla">${(act.datos.afirmaciones || []).map((af, i) => {
        const resp = modo === "con_pauta"
          ? `<span class="vf-correcta">${af.correcta ? "V" : "F"}</span>`
          : `<span class="vf-input">_____</span>`
        return `<tr><td class="vf-num">${i + 1}.</td><td>${resp}</td><td>${escapeHtml(af.texto)}</td></tr>`
      }).join("")}</table>`
      break
    }
    case "completar": {
      let texto = act.datos.texto || ""
      if (modo === "con_pauta") {
        let i = 0
        texto = texto.replace(/__+/g, () => `<u class="resp-pauta">${escapeHtml(act.datos!.tipo === "completar" ? (act.datos.respuestas || [])[i++] || "____" : "")}</u>`)
      } else {
        texto = texto.replace(/__+/g, "<u>__________</u>")
      }
      const banco = act.datos.banco && act.datos.banco.length
        ? `<div class="banco-palabras"><b>Banco:</b> ${(act.datos.banco || []).map(escapeHtml).join(" · ")}</div>` : ""
      cuerpo = `${banco}<div class="completar-texto">${texto}</div>`
      break
    }
    case "respuesta_corta": {
      cuerpo = lineasRespuesta(act.datos.lineas || 2)
      if (modo === "con_pauta" && act.datos.respuestaSugerida) {
        cuerpo += `<div class="pauta-resp">Sugerida: ${escapeHtml(act.datos.respuestaSugerida)}</div>`
      }
      break
    }
    case "ordenar": {
      const pasos = [...(act.datos.pasos || [])].sort((a, b) => a.numeroCorrecto - b.numeroCorrecto)
      cuerpo = `<ol class="ordenar">${(modo === "con_pauta" ? pasos : (act.datos.pasos || [])).map(p => {
        const num = modo === "con_pauta" ? `<b>${p.numeroCorrecto}</b>` : `_____`
        return `<li>${num} ${escapeHtml(p.texto)}</li>`
      }).join("")}</ol>`
      break
    }
    case "pareados": {
      const colA = (act.datos.columnaA || []).map((a, i) =>
        `<tr><td class="par-num">${i + 1}.</td><td>${escapeHtml(a.texto)}</td><td class="par-input">_____</td></tr>`).join("")
      const colB = (act.datos.columnaB || []).map((b, i) => {
        if (modo === "con_pauta") {
          const aIdx = act.datos!.tipo === "pareados" ? (act.datos.columnaA || []).findIndex(x => x.id === b.pareCon) : -1
          return `<tr><td class="par-letra">${letraAlt(i)})</td><td>${escapeHtml(b.texto)}</td><td class="par-correcta">→ ${aIdx + 1}</td></tr>`
        }
        return `<tr><td class="par-letra">${letraAlt(i)})</td><td>${escapeHtml(b.texto)}</td><td></td></tr>`
      }).join("")
      cuerpo = `<div class="pareados-tablas">
        <table class="par-tabla"><thead><tr><th colspan="3">Columna A</th></tr></thead><tbody>${colA}</tbody></table>
        <table class="par-tabla"><thead><tr><th colspan="3">Columna B</th></tr></thead><tbody>${colB}</tbody></table>
      </div>`
      break
    }
    case "encerrar":
    case "marcar": {
      const items = (act.datos.opciones || []).map(o => {
        const correcta = modo === "con_pauta" && o.correcta ? " correcta" : ""
        const img = o.imagenUrl ? `<img src="${escapeHtml(o.imagenUrl)}" class="opt-img" />` : ""
        const marca = act.datos!.tipo === "encerrar" ? "○" : "□"
        return `<div class="opt-item${correcta}"><span class="opt-marca">${marca}</span> ${escapeHtml(o.texto)} ${img}</div>`
      }).join("")
      cuerpo = `<div class="opciones-grid">${items}</div>`
      break
    }
    case "colorear": {
      const img = act.datos.imagenUrl
        ? `<div class="bloque-imagen align-centro"><img src="${escapeHtml(act.datos.imagenUrl)}" /></div>`
        : `<div class="caja-dibujo" style="height:60mm;">Espacio para colorear</div>`
      cuerpo = `${act.datos.instruccion ? `<div class="act-instr">${escapeHtml(act.datos.instruccion)}</div>` : ""}${img}`
      break
    }
    case "dibujar": {
      cuerpo = `${act.datos.instruccion ? `<div class="act-instr">${escapeHtml(act.datos.instruccion)}</div>` : ""}
        <div class="caja-dibujo" style="height:${act.datos.alturaCm || 8}cm;">&nbsp;</div>`
      break
    }
    case "investigar": {
      cuerpo = `${act.datos.instruccion ? `<div class="act-instr">${escapeHtml(act.datos.instruccion)}</div>` : ""}
        ${lineasRespuesta(act.datos.lineasRespuesta || 4)}`
      break
    }
    case "sopa_letras": {
      const palabras = (act.datos.palabras || []).length
        ? `<div class="sopa-palabras"><b>Palabras a buscar:</b> ${(act.datos.palabras || []).map(escapeHtml).join(" · ")}</div>`
        : ""
      const t = act.datos.tamañoCuadro || 12
      // Cuadrícula vacía como placeholder visual
      const filas = Array.from({ length: t }, () =>
        `<tr>${Array.from({ length: t }, () => `<td>&nbsp;</td>`).join("")}</tr>`
      ).join("")
      cuerpo = `${palabras}<table class="sopa-tabla">${filas}</table>`
      break
    }
    case "abierta":
    default:
      cuerpo = lineasRespuesta(act.datos?.tipo === "abierta" ? act.datos.lineasRespuesta || 4 : 4)
  }

  return `<div class="actividad">${enunciado}${recursos}${cuerpo}</div>`
}

function renderSeccion(sec: SeccionGuia, modo: ModoExportGuia): string {
  const titulo = `<h2 class="sec-titulo">${escapeHtml(sec.titulo)}</h2>`
  const desc = sec.descripcion ? `<div class="sec-desc">${escapeHtml(sec.descripcion)}</div>` : ""
  const contenido = renderRecursos(sec.contenido)
  const actividades = sec.actividades.map(a => renderActividad(a, modo)).join("")
  return `<section class="seccion">${titulo}${desc}${contenido}${actividades}</section>`
}

// ─── HTML completo ────────────────────────────────────────────────────────

function buildHtml(opts: ExportGuiaOpciones): string {
  const { guia, colegio, profesorNombre, alumno } = opts
  const modo = opts.modo || "para_alumno"
  const colegioNombre = escapeHtml(colegio?.nombre || "")
  const docente = escapeHtml(profesorNombre || guia.docenteNombre || "")
  const alumnoNombre = escapeHtml(alumno?.nombre || "")
  const esCancionero = guia.secciones.length > 0
    && guia.secciones.every(s => (s.actividades || []).length === 0)
    && guia.secciones.some(s => (s.contenido || []).some(b => b.tipo === "imagen"))

  const encabezadoColegio = colegio?.encabezadoHabilitado ? `
    <div class="encabezado-colegio">
      <div class="enc-izq">${escapeHtml(colegio.encabezadoTextoIzq || "").replace(/\\n/g, "<br>")}</div>
      <div class="enc-der">${escapeHtml(colegio.encabezadoTextoDer || "").replace(/\\n/g, "<br>")}</div>
    </div>` : (colegioNombre ? `<div class="encabezado-colegio simple">${colegioNombre}</div>` : "")

  const tituloGuia = escapeHtml(guia.numeroGuia ? `${guia.numeroGuia} — ${guia.nombre || "Guía"}` : (guia.nombre || "Guía de aprendizaje"))

  const datosBox = `
    <div class="datos-box">
      <div><b>Asignatura:</b> ${escapeHtml(guia.asignatura)}</div>
      <div><b>Curso:</b> ${escapeHtml(guia.curso)}</div>
      ${docente ? `<div><b>Profesor(a):</b> ${docente}</div>` : ""}
      ${guia.tiempoMinutos ? `<div><b>Tiempo:</b> ${guia.tiempoMinutos} min</div>` : ""}
      <div><b>Nombre:</b> ${alumnoNombre || "_______________________________"}</div>
      ${guia.unidadNombre ? `<div><b>Unidad:</b> ${escapeHtml(guia.unidadNombre)}</div>` : ""}
    </div>`

  const objetivoBox = guia.objetivo ? `
    <div class="objetivo-box">
      <b>Objetivo:</b> ${escapeHtml(guia.objetivo)}
    </div>` : ""

  const oasBox = (guia.metadatosCurriculares?.objetivos?.length || 0) > 0 ? `
    <div class="oas-box">
      <b>OA(s):</b>
      <ul>${guia.metadatosCurriculares!.objetivos.map(o => `<li>${escapeHtml(o)}</li>`).join("")}</ul>
    </div>` : ""

  const instrucciones = (guia.instrucciones || []).length ? `
    <div class="instrucciones">
      <b>Instrucciones:</b>
      <ul>${guia.instrucciones.map(i => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
    </div>` : ""

  const secciones = guia.secciones.map(s => renderSeccion(s, modo)).join("")
  const cierre = (guia.cierre || []).length ? `
    <div class="cierre-box">
      <h3>Cierre y reflexión</h3>
      ${renderRecursos(guia.cierre)}
    </div>` : ""

  return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${tituloGuia}${modo === "con_pauta" ? " — Pauta" : ""}</title>
<style>
  @page { size: A4 portrait; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Verdana", "Helvetica", sans-serif; color: #1f2937; font-size: 11pt; line-height: 1.5; margin: 0; }
  h1, h2, h3 { margin: 0; padding: 0; }
  .doc-title { font-size: 16pt; font-weight: 800; text-align: center; margin: 6mm 0 4mm; color: #4338ca; }
  ${modo === "con_pauta" ? '.doc-title::after { content: " — PAUTA"; color: #b91c1c; font-size: 11pt; }' : ""}

  .encabezado-colegio { display: flex; justify-content: space-between; gap: 12px; border-bottom: 2px solid #6366f1; padding-bottom: 3mm; margin-bottom: 3mm; font-size: 9.5pt; }
  .encabezado-colegio.simple { display: block; text-align: center; font-weight: 700; }

  .datos-box { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 14px; padding: 3mm; background: #eef2ff; border-radius: 6px; margin: 3mm 0; font-size: 10.5pt; }

  .objetivo-box { padding: 3mm 4mm; background: #fef3c7; border-left: 4px solid #f59e0b; margin: 3mm 0; font-size: 11pt; }
  .oas-box { padding: 2mm 4mm; background: #f3f4f6; border-radius: 4px; margin: 2mm 0; font-size: 9.5pt; }
  .oas-box ul { margin: 2px 0 0 16px; padding: 0; }

  .instrucciones { padding: 2mm 4mm; background: #ecfdf5; border-left: 3px solid #059669; margin: 2mm 0 4mm; font-size: 10pt; }
  .instrucciones ul { margin: 2px 0 0 16px; padding: 0; }

  .seccion { margin: 5mm 0; }
  .sec-titulo { font-size: 13pt; font-weight: 800; color: #4338ca; border-bottom: 2px solid #6366f1; padding: 2px 0; margin-bottom: 3mm; }
  .sec-desc { font-style: italic; color: #4b5563; font-size: 10pt; margin-bottom: 2mm; }

  .bloque-texto { margin: 2mm 0; }
  .bloque-texto-destacado { background: #fef3c7; padding: 4px 8px; border-radius: 4px; }
  .bloque-texto-instrucciones { font-style: italic; color: #4b5563; }
  .bloque-texto-lectura { font-size: 11pt; line-height: 1.5; padding: 3mm; background: #f9fafb; border: 1px dashed #d1d5db; }

  .bloque-imagen { margin: 3mm 0; text-align: center; }
  .bloque-imagen.align-izq { text-align: left; }
  .bloque-imagen.align-der { text-align: right; }
  .bloque-imagen img { max-width: 100%; height: auto; border-radius: 3px; }
  .score-placeholder { min-height: 28mm; border: 1px dashed #9ca3af; border-radius: 4px; display: grid; place-items: center; color: #6b7280; font-size: 9pt; font-style: italic; background: #f9fafb; }
  .img-caption { font-size: 9pt; color: #6b7280; margin-top: 2mm; font-style: italic; }

  body.cancionero { font-size: 9.5pt; line-height: 1.25; }
  body.cancionero .doc-title { font-size: 13pt; margin: 2mm 0 2mm; }
  body.cancionero .encabezado-colegio { padding-bottom: 2mm; margin-bottom: 2mm; font-size: 8.5pt; }
  body.cancionero .datos-box { grid-template-columns: repeat(3, 1fr); gap: 2px 8px; padding: 2mm; margin: 2mm 0; font-size: 8.5pt; }
  body.cancionero .objetivo-box,
  body.cancionero .oas-box,
  body.cancionero .instrucciones { padding: 1.5mm 2mm; margin: 1.5mm 0; font-size: 8.5pt; }
  body.cancionero .seccion { margin: 2mm 0; }
  body.cancionero .sec-titulo { font-size: 10.5pt; margin-bottom: 1mm; border-bottom-width: 1px; }
  body.cancionero .sec-desc { font-size: 8.5pt; margin-bottom: 1mm; }
  body.cancionero .bloque-texto { margin: 1mm 0; }
  body.cancionero .bloque-texto-lectura { font-family: "Consolas", "Courier New", monospace; font-size: 9.2pt; line-height: 1.2; padding: 1.5mm 2mm; background: #fff; border: 1px solid #e5e7eb; white-space: pre-wrap; }
  body.cancionero .bloque-texto-destacado { padding: 2px 6px; text-align: center; font-size: 9pt; }
  body.cancionero .bloque-imagen { margin: 1.5mm 0; }
  body.cancionero .bloque-imagen img { max-height: 44mm; object-fit: contain; }
  body.cancionero .img-caption { margin-top: 1mm; font-size: 8pt; }

  .bloque-tabla { width: 100%; border-collapse: collapse; margin: 3mm 0; font-size: 10pt; }
  .bloque-tabla th, .bloque-tabla td { border: 1px solid #6b7280; padding: 4px 8px; }
  .bloque-tabla th { background: #e0e7ff; font-weight: 700; }

  .bloque-linea { border: none; border-top: 1px solid #d1d5db; margin: 4mm 0; }
  .bloque-espacio { height: 4mm; }
  .page-break { page-break-after: always; }

  .actividad { margin: 4mm 0; padding: 3mm; border-left: 3px solid #c4b5fd; background: #faf5ff; border-radius: 3px; page-break-inside: avoid; }
  .act-enunciado { font-weight: 600; font-size: 10.5pt; }
  .act-enunciado .puntos { color: #6b21a8; font-size: 9pt; font-style: italic; }
  .act-instr { margin: 2mm 0; font-style: italic; color: #4b5563; font-size: 10pt; }

  .alts { list-style: none; padding: 0; margin: 2mm 0 0 5mm; }
  .alts .alt { margin: 1mm 0; }
  .alts .alt.correcta { background: #d1fae5; padding: 2px 4px; border-radius: 3px; }
  .alts .alt-marca { margin-right: 6px; }
  .alts .alt-img { max-height: 16mm; vertical-align: middle; margin-left: 6px; }

  .vf-tabla { border-collapse: collapse; margin: 2mm 0 0 5mm; font-size: 10.5pt; }
  .vf-tabla td { padding: 2px 6px; }
  .vf-num { font-weight: 700; }
  .vf-correcta { font-weight: 800; color: #15803d; padding: 1px 6px; background: #d1fae5; border-radius: 3px; }
  .vf-input { letter-spacing: 4px; }

  .completar-texto { margin: 2mm 0 0 5mm; line-height: 1.8; }
  .completar-texto u { letter-spacing: 2px; min-width: 28mm; display: inline-block; }
  .completar-texto u.resp-pauta { color: #b91c1c; font-weight: 700; }
  .banco-palabras { margin: 2mm 0; padding: 3px 8px; background: #fef3c7; border-radius: 3px; font-size: 10pt; }

  .ordenar { list-style: none; padding: 0; margin: 2mm 0 0 5mm; }

  .pareados-tablas { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; margin: 2mm 0 0; }
  .par-tabla { border-collapse: collapse; width: 100%; font-size: 10pt; }
  .par-tabla th { background: #e0e7ff; padding: 3px; border: 1px solid #6b7280; }
  .par-tabla td { padding: 2px 6px; border: 1px solid #d1d5db; }
  .par-num, .par-letra { font-weight: 700; width: 10%; text-align: center; }
  .par-input { text-align: center; letter-spacing: 4px; width: 18%; }

  .opciones-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 3mm; margin: 2mm 0 0 5mm; }
  .opt-item { padding: 4px; border: 1px dashed #c4b5fd; border-radius: 4px; font-size: 10.5pt; }
  .opt-item.correcta { background: #d1fae5; border-color: #059669; }
  .opt-marca { margin-right: 6px; font-size: 11pt; }
  .opt-img { max-height: 18mm; display: block; margin-top: 4px; }

  .caja-dibujo { border: 2px dashed #9ca3af; border-radius: 4px; margin: 2mm 0 0 5mm; padding: 3mm; color: #9ca3af; text-align: center; font-style: italic; }

  .sopa-tabla { border-collapse: collapse; margin: 3mm auto; }
  .sopa-tabla td { width: 8mm; height: 8mm; border: 1px solid #6b7280; text-align: center; font-family: monospace; }
  .sopa-palabras { padding: 3px 8px; background: #ecfdf5; border-radius: 3px; font-size: 10pt; margin: 2mm 0; }

  .linea-resp { border-bottom: 1px solid #6b7280; height: 7mm; margin: 1mm 5mm; }

  .pauta-resp { margin: 2mm 0 0 5mm; padding: 3px 8px; background: #fee2e2; border-left: 3px solid #b91c1c; font-size: 10pt; font-style: italic; }

  .cierre-box { margin: 6mm 0 0; padding: 4mm; background: #fef3c7; border: 2px solid #f59e0b; border-radius: 6px; }
  .cierre-box h3 { color: #92400e; font-size: 12pt; margin-bottom: 2mm; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none; }
  }
</style>
</head>
<body class="${esCancionero ? "cancionero" : ""}">
${encabezadoColegio}
<h1 class="doc-title">${tituloGuia}</h1>
${datosBox}
${objetivoBox}
${oasBox}
${instrucciones}
${secciones}
${cierre}
</body>
</html>`
}

export function abrirGuiaImprimible(opts: ExportGuiaOpciones): void {
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
    try { win.focus(); win.print() } catch {}
  }, 700)
}
