"use client"

import type { BloqueContenido } from "@/lib/evaluaciones-tipos"
import type { GuiaTemplate, ActividadGuia, SeccionGuia } from "@/lib/guias"
import type { InfoColegio } from "@/lib/perfil"
import type { ItemPrueba, PruebaTemplate, SeccionPrueba } from "@/lib/pruebas"
import { romano } from "@/lib/pruebas"

export type DocumentPreviewMode = "para_alumno" | "con_pauta"

export type DocumentPreviewTarget =
  | { tipo: "prueba"; documento: PruebaTemplate }
  | { tipo: "guia"; documento: GuiaTemplate }

export type DocumentHtmlOptions = DocumentPreviewTarget & {
  colegio?: InfoColegio | null
  profesorNombre?: string
  modo?: DocumentPreviewMode
  alumno?: { nombre: string; curso?: string }
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

function lineasRespuesta(n: number, className = "linea-respuesta"): string {
  return Array.from({ length: Math.max(1, n) }, () => `<div class="${className}">&nbsp;</div>`).join("")
}

function letra(idx: number): string {
  return String.fromCharCode(97 + idx)
}

function safeFileName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "documento"
}

export function documentFileName(opts: DocumentHtmlOptions, ext: "pdf" | "docx" | "html" = "pdf"): string {
  const name = opts.tipo === "prueba"
    ? opts.documento.nombre || "prueba"
    : opts.documento.nombre || "guia"
  const suffix = opts.modo === "con_pauta" ? "-pauta" : "-alumno"
  return `${safeFileName(name)}${suffix}.${ext}`
}

function renderBloque(b: BloqueContenido): string {
  switch (b.tipo) {
    case "texto":
      return `<div class="bloque-texto bloque-texto-${escapeHtml(b.data.estilo || "normal")}">${b.data.html || ""}</div>`
    case "imagen": {
      const ancho = b.data.ancho === "small" ? "30%" : b.data.ancho === "medium" ? "60%" : "100%"
      const alineacion = b.data.alineacion || "centro"
      const caption = b.data.caption ? `<div class="img-caption">${escapeHtml(b.data.caption)}</div>` : ""
      if (!b.data.url) {
        return `<div class="bloque-imagen align-${alineacion}"><div class="image-fallback">Imagen no disponible</div>${caption}</div>`
      }
      return `<div class="bloque-imagen align-${alineacion}">
        <img src="${escapeHtml(b.data.url)}" alt="${escapeHtml(b.data.alt || "Imagen")}" style="max-width:${ancho};" />
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
  return recursos?.length ? `<div class="recursos-bloque">${recursos.map(renderBloque).join("")}</div>` : ""
}

function renderPruebaItem(item: ItemPrueba, numeroItem: number, modo: DocumentPreviewMode): string {
  const enunciado = `<div class="item-enunciado"><b>${numeroItem}.</b> ${escapeHtml(item.enunciado)} <span class="puntos">(${item.puntaje} pts)</span></div>`
  const recursos = renderRecursos(item.recursos)

  switch (item.tipo) {
    case "seleccion_multiple": {
      const alts = item.alternativas.map((a, i) => {
        const correcta = modo === "con_pauta" && a.esCorrecta ? " correcta" : ""
        const marca = modo === "con_pauta" && a.esCorrecta ? "✓" : "○"
        const img = a.imagenUrl ? `<img src="${escapeHtml(a.imagenUrl)}" alt="${escapeHtml(a.texto || "Alternativa")}" class="alt-img" />` : ""
        return `<li class="alt${correcta}"><span class="alt-marca">${marca}</span><span class="alt-letra">${letra(i)})</span> ${escapeHtml(a.texto)}${img}</li>`
      }).join("")
      return `<div class="item">${enunciado}${recursos}<ol class="alts">${alts}</ol></div>`
    }
    case "verdadero_falso": {
      const respuesta = modo === "con_pauta"
        ? `<span class="vf-correcta">${item.respuestaCorrecta ? "V" : "F"}</span>`
        : `<span class="vf-input">_____</span>`
      const justif = item.pideJustificacion ? `<div class="justif">Justificacion: ${lineasRespuesta(2)}</div>` : ""
      return `<div class="item">${enunciado}${recursos}<div class="vf">${respuesta}</div>${justif}</div>`
    }
    case "pareados": {
      const colA = item.columnaA.map((a, i) =>
        `<tr><td class="par-num">${i + 1}.</td><td>${escapeHtml(a.texto)}</td><td class="par-input">_____</td></tr>`
      ).join("")
      const colB = item.columnaB.map((b, i) => {
        if (modo === "con_pauta") {
          const aIdx = item.columnaA.findIndex(x => x.id === b.correctaParaAId)
          return `<tr><td class="par-letra">${letra(i)})</td><td>${escapeHtml(b.texto)}</td><td class="par-correcta">→ ${aIdx >= 0 ? aIdx + 1 : "?"}</td></tr>`
        }
        return `<tr><td class="par-letra">${letra(i)})</td><td>${escapeHtml(b.texto)}</td><td></td></tr>`
      }).join("")
      return `<div class="item">${enunciado}${recursos}<div class="pareados-tablas">
        <table class="par-tabla"><thead><tr><th colspan="3">Columna A</th></tr></thead><tbody>${colA}</tbody></table>
        <table class="par-tabla"><thead><tr><th colspan="3">Columna B</th></tr></thead><tbody>${colB}</tbody></table>
      </div></div>`
    }
    case "ordenar": {
      const items = item.pasos.map((p, i) => {
        const num = modo === "con_pauta" ? `<b>${i + 1}</b>` : "_____"
        return `<li>${num} ${escapeHtml(p.texto)}</li>`
      }).join("")
      return `<div class="item">${enunciado}${recursos}<ol class="ordenar">${items}</ol></div>`
    }
    case "completar": {
      const banco = item.bancoPalabras?.length
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
      const pauta = modo === "con_pauta" && item.respuestaEsperada
        ? `<div class="pauta-resp">Respuesta esperada: ${escapeHtml(item.respuestaEsperada)}</div>`
        : ""
      return `<div class="item">${enunciado}${recursos}${lineasRespuesta(item.lineasRespuesta || 2)}${pauta}</div>`
    }
    case "desarrollo": {
      const criterios = item.criterios?.length
        ? `<div class="criterios"><b>Criterios:</b><ul>${item.criterios.map(c => `<li>${escapeHtml(c.texto)} <i>(${c.puntaje} pts)</i></li>`).join("")}</ul></div>`
        : ""
      const pauta = modo === "con_pauta" && item.pautaCorreccion
        ? `<div class="pauta-resp">Pauta: ${escapeHtml(item.pautaCorreccion)}</div>`
        : ""
      return `<div class="item">${enunciado}${recursos}${criterios}${lineasRespuesta(item.lineasRespuesta || 5)}${pauta}</div>`
    }
  }
}

function renderPruebaSeccion(sec: SeccionPrueba, contador: { value: number }, modo: DocumentPreviewMode): string {
  const titulo = `<h2 class="sec-titulo">${escapeHtml(sec.titulo || `Seccion ${romano(sec.orden || 1)}`)}</h2>`
  const instr = sec.instrucciones ? `<div class="sec-instr">${escapeHtml(sec.instrucciones)}</div>` : ""
  const estimulo = renderRecursos(sec.estimulo)
  const items = sec.items.map(item => {
    contador.value += 1
    return renderPruebaItem(item, contador.value, modo)
  }).join("")
  return `<section class="seccion">${titulo}${instr}${estimulo}${items}</section>`
}

function renderGuiaActividad(act: ActividadGuia, modo: DocumentPreviewMode): string {
  const num = act.numero ? `<b>${act.numero}.</b>` : "•"
  const puntos = act.puntaje ? `<span class="puntos">(${act.puntaje} pts)</span>` : ""
  const enunciado = `<div class="act-enunciado">${num} ${escapeHtml(act.enunciado)} ${puntos}</div>`
  const recursos = renderRecursos(act.recursos)
  const datos = act.datos
  let cuerpo = ""

  switch (datos?.tipo) {
    case "seleccion_multiple":
      cuerpo = `<ol class="alts">${(datos.alternativas || []).map((a, i) => {
        const correcta = modo === "con_pauta" && a.correcta ? " correcta" : ""
        const marca = modo === "con_pauta" && a.correcta ? "✓" : "○"
        const img = a.imagenUrl ? `<img src="${escapeHtml(a.imagenUrl)}" alt="${escapeHtml(a.texto || "Alternativa")}" class="alt-img" />` : ""
        return `<li class="alt${correcta}"><span class="alt-marca">${marca}</span><b>${letra(i)})</b> ${escapeHtml(a.texto)}${img}</li>`
      }).join("")}</ol>`
      break
    case "verdadero_falso":
      cuerpo = `<table class="vf-tabla">${(datos.afirmaciones || []).map((af, i) => {
        const resp = modo === "con_pauta" ? `<span class="vf-correcta">${af.correcta ? "V" : "F"}</span>` : `<span class="vf-input">_____</span>`
        return `<tr><td class="vf-num">${i + 1}.</td><td>${resp}</td><td>${escapeHtml(af.texto)}</td></tr>`
      }).join("")}</table>`
      break
    case "completar": {
      let texto = datos.texto || ""
      if (modo === "con_pauta") {
        let i = 0
        texto = texto.replace(/__+/g, () => `<u class="resp-pauta">${escapeHtml((datos.respuestas || [])[i++] || "____")}</u>`)
      } else {
        texto = texto.replace(/__+/g, "<u>__________</u>")
      }
      const banco = datos.banco?.length ? `<div class="banco-palabras"><b>Banco:</b> ${datos.banco.map(escapeHtml).join(" · ")}</div>` : ""
      cuerpo = `${banco}<div class="completar-texto">${texto}</div>`
      break
    }
    case "respuesta_corta":
      cuerpo = lineasRespuesta(datos.lineas || 2, "linea-resp")
      if (modo === "con_pauta" && datos.respuestaSugerida) cuerpo += `<div class="pauta-resp">${escapeHtml(datos.respuestaSugerida)}</div>`
      break
    case "ordenar": {
      const pasos = modo === "con_pauta" ? [...(datos.pasos || [])].sort((a, b) => a.numeroCorrecto - b.numeroCorrecto) : (datos.pasos || [])
      cuerpo = `<ol class="ordenar">${pasos.map(p => `<li>${modo === "con_pauta" ? `<b>${p.numeroCorrecto}</b>` : "_____"} ${escapeHtml(p.texto)}</li>`).join("")}</ol>`
      break
    }
    case "pareados": {
      const colA = (datos.columnaA || []).map((a, i) => `<tr><td class="par-num">${i + 1}.</td><td>${escapeHtml(a.texto)}</td><td class="par-input">_____</td></tr>`).join("")
      const colB = (datos.columnaB || []).map((b, i) => {
        if (modo === "con_pauta") {
          const aIdx = (datos.columnaA || []).findIndex(x => x.id === b.pareCon)
          return `<tr><td class="par-letra">${letra(i)})</td><td>${escapeHtml(b.texto)}</td><td class="par-correcta">→ ${aIdx >= 0 ? aIdx + 1 : "?"}</td></tr>`
        }
        return `<tr><td class="par-letra">${letra(i)})</td><td>${escapeHtml(b.texto)}</td><td></td></tr>`
      }).join("")
      cuerpo = `<div class="pareados-tablas"><table class="par-tabla"><thead><tr><th colspan="3">Columna A</th></tr></thead><tbody>${colA}</tbody></table><table class="par-tabla"><thead><tr><th colspan="3">Columna B</th></tr></thead><tbody>${colB}</tbody></table></div>`
      break
    }
    case "encerrar":
    case "marcar":
      cuerpo = `<div class="opciones-grid">${(datos.opciones || []).map(o => {
        const correcta = modo === "con_pauta" && o.correcta ? " correcta" : ""
        const img = o.imagenUrl ? `<img src="${escapeHtml(o.imagenUrl)}" alt="${escapeHtml(o.texto || "Opcion")}" class="opt-img" />` : ""
        return `<div class="opt-item${correcta}"><span class="opt-marca">${datos.tipo === "encerrar" ? "○" : "□"}</span>${escapeHtml(o.texto)}${img}</div>`
      }).join("")}</div>`
      break
    case "colorear":
      cuerpo = `${datos.instruccion ? `<div class="act-instr">${escapeHtml(datos.instruccion)}</div>` : ""}${datos.imagenUrl ? `<div class="bloque-imagen align-centro"><img src="${escapeHtml(datos.imagenUrl)}" alt="Imagen para colorear" /></div>` : `<div class="caja-dibujo">Espacio para colorear</div>`}`
      break
    case "dibujar":
      cuerpo = `${datos.instruccion ? `<div class="act-instr">${escapeHtml(datos.instruccion)}</div>` : ""}<div class="caja-dibujo" style="height:${datos.alturaCm || 8}cm;">&nbsp;</div>`
      break
    case "investigar":
      cuerpo = `${datos.instruccion ? `<div class="act-instr">${escapeHtml(datos.instruccion)}</div>` : ""}${lineasRespuesta(datos.lineasRespuesta || 4, "linea-resp")}`
      break
    case "sopa_letras": {
      const size = Math.max(4, Math.min(20, Number((datos as any).tamañoCuadro ?? (datos as any)["tamaÃ±oCuadro"] ?? 12)))
      const filas = Array.from({ length: size }, () => `<tr>${Array.from({ length: size }, () => `<td>&nbsp;</td>`).join("")}</tr>`).join("")
      cuerpo = `${datos.palabras?.length ? `<div class="sopa-palabras"><b>Palabras:</b> ${datos.palabras.map(escapeHtml).join(" · ")}</div>` : ""}<table class="sopa-tabla">${filas}</table>`
      break
    }
    case "abierta":
    default:
      cuerpo = lineasRespuesta(datos?.tipo === "abierta" ? datos.lineasRespuesta || 4 : 4, "linea-resp")
  }

  return `<div class="actividad">${enunciado}${recursos}${cuerpo}</div>`
}

function renderGuiaSeccion(sec: SeccionGuia, modo: DocumentPreviewMode): string {
  const titulo = `<h2 class="sec-titulo">${escapeHtml(sec.titulo)}</h2>`
  const desc = sec.descripcion ? `<div class="sec-desc">${escapeHtml(sec.descripcion)}</div>` : ""
  const contenido = renderRecursos(sec.contenido)
  const actividades = sec.actividades.map(a => renderGuiaActividad(a, modo)).join("")
  return `<section class="seccion">${titulo}${desc}${contenido}${actividades}</section>`
}

function sharedImageFallbackScript(): string {
  return `<script>
    (function () {
      function replaceBrokenImage(img) {
        if (!img || !img.isConnected) return;
        var fallback = document.createElement("div");
        fallback.className = "image-fallback";
        fallback.textContent = img.alt ? "Imagen no disponible: " + img.alt : "Imagen no disponible";
        img.replaceWith(fallback);
      }
      function installFallback(img) {
        img.addEventListener("error", function () { replaceBrokenImage(img); }, { once: true });
        if (img.complete && img.naturalWidth === 0) replaceBrokenImage(img);
      }
      Array.prototype.forEach.call(document.images || [], installFallback);
    })();
  </script>`
}

function baseStyles(kind: "prueba" | "guia", modo: DocumentPreviewMode): string {
  const accent = kind === "prueba" ? "#111827" : "#4338ca"
  const accentSoft = kind === "prueba" ? "#f3f4f6" : "#eef2ff"
  const font = kind === "prueba" ? '"Times New Roman", Georgia, serif' : '"Verdana", "Helvetica", sans-serif'
  return `
    @page { size: A4 portrait; margin: 16mm 14mm; }
    * { box-sizing: border-box; }
    body { font-family: ${font}; color: #111827; font-size: 11pt; line-height: 1.45; margin: 0; background: white; }
    h1, h2, h3 { margin: 0; padding: 0; }
    .doc-title { font-size: 16pt; font-weight: 800; text-align: center; margin: 7mm 0 4mm; color: ${accent}; text-transform: ${kind === "prueba" ? "uppercase" : "none"}; }
    ${modo === "con_pauta" ? '.doc-title::after { content: " - PAUTA"; color: #b91c1c; font-size: 11pt; }' : ""}
    .encabezado-colegio { display: flex; justify-content: space-between; gap: 12px; border-bottom: 2px solid ${accent}; padding-bottom: 3mm; margin-bottom: 3mm; font-size: 9.5pt; }
    .encabezado-colegio.simple { display: block; text-align: center; font-weight: 700; }
    .tabla-datos, .bloque-tabla, .tabla-oa, .par-tabla, .vf-tabla { border-collapse: collapse; }
    .tabla-datos { width: 100%; margin-bottom: 4mm; }
    .tabla-datos td { border: 1px solid #6b7280; padding: 5px 8px; font-size: 10.5pt; }
    .tabla-datos td.lbl { background: #f3f4f6; font-weight: 700; width: 14%; }
    .datos-box { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 14px; padding: 3mm; background: ${accentSoft}; border-radius: 6px; margin: 3mm 0; font-size: 10.5pt; }
    .instrucciones-grales, .instrucciones, .objetivo-box, .oas-box { margin: 3mm 0; padding: 3mm; background: #f9fafb; border-left: 4px solid #9ca3af; }
    .objetivo-box { background: #fef3c7; border-left-color: #f59e0b; }
    .instrucciones { background: #ecfdf5; border-left-color: #059669; }
    ul { margin: 4px 0 0 18px; padding: 0; }
    .tabla-oa { width: 100%; margin: 3mm 0 5mm; font-size: 10pt; }
    .tabla-oa th, .tabla-oa td, .bloque-tabla th, .bloque-tabla td { border: 1px solid #6b7280; padding: 5px 7px; text-align: left; vertical-align: top; }
    .tabla-oa th, .bloque-tabla th { background: #e5e7eb; font-weight: 700; }
    .seccion { margin: 6mm 0; }
    .sec-titulo { font-size: 13pt; font-weight: 800; color: ${kind === "prueba" ? "white" : accent}; background: ${kind === "prueba" ? accent : "transparent"}; border-bottom: ${kind === "guia" ? `2px solid ${accent}` : "0"}; padding: ${kind === "prueba" ? "4px 10px" : "2px 0"}; margin-bottom: 3mm; }
    .sec-instr, .sec-desc { font-style: italic; color: #4b5563; font-size: 10.5pt; margin-bottom: 3mm; padding: 4px 8px; border-left: 3px solid #9ca3af; background: #f9fafb; }
    .recursos-bloque, .bloque-texto, .bloque-imagen, .bloque-tabla { margin: 3mm 0; }
    .bloque-texto-destacado { background: #fef3c7; padding: 4px 8px; border-radius: 4px; }
    .bloque-texto-instrucciones { font-style: italic; color: #4b5563; }
    .bloque-texto-lectura { font-size: 11pt; line-height: 1.5; padding: 3mm; background: #f9fafb; border: 1px dashed #d1d5db; }
    .bloque-imagen { text-align: center; }
    .bloque-imagen.align-izq { text-align: left; }
    .bloque-imagen.align-der { text-align: right; }
    .bloque-imagen img, .alt-img, .opt-img { max-width: 100%; height: auto; border-radius: 3px; }
    .alt-img, .opt-img { max-height: 18mm; vertical-align: middle; margin-left: 6px; }
    .image-fallback { min-height: 28mm; border: 1px dashed #9ca3af; border-radius: 4px; display: grid; place-items: center; color: #6b7280; font-size: 9pt; font-style: italic; background: #f9fafb; padding: 8px; }
    .img-caption { font-size: 9pt; color: #6b7280; margin-top: 2mm; font-style: italic; }
    .bloque-linea { border: none; border-top: 1px solid #d1d5db; margin: 4mm 0; }
    .bloque-espacio { height: 4mm; }
    .page-break { page-break-after: always; }
    .item, .actividad { margin: 4mm 0; page-break-inside: avoid; }
    .actividad { padding: 3mm; border-left: 3px solid #c4b5fd; background: #faf5ff; border-radius: 3px; }
    .item-enunciado, .act-enunciado { font-size: 11pt; line-height: 1.5; font-weight: 600; }
    .puntos { color: #6b7280; font-size: 9.5pt; margin-left: 8px; font-style: italic; }
    .alts, .ordenar { list-style: none; padding: 0; margin: 2mm 0 0 6mm; }
    .alt, .ordenar li { margin: 1.5mm 0; }
    .correcta { background: #d1fae5; padding: 2px 4px; border-radius: 3px; }
    .alt-marca, .opt-marca { margin-right: 6px; }
    .alt-letra { font-weight: 700; margin-right: 4px; }
    .vf, .justif, .criterios, .pauta-resp, .completar-texto { margin: 2mm 0 0 6mm; }
    .vf-correcta, .par-correcta { color: #15803d; font-weight: 800; background: #d1fae5; border-radius: 3px; padding: 1px 6px; }
    .vf-input, .par-input { letter-spacing: 4px; }
    .pareados-tablas { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin: 2mm 0 0; }
    .par-tabla { width: 100%; font-size: 10.5pt; }
    .par-tabla th { background: #f3f4f6; padding: 4px; border: 1px solid #6b7280; }
    .par-tabla td { padding: 3px 6px; border: 1px solid #d1d5db; }
    .par-num, .par-letra { font-weight: 700; width: 10%; text-align: center; }
    .banco-palabras { margin: 2mm 0; padding: 3px 8px; background: #fef3c7; border-radius: 3px; font-size: 10pt; }
    .completar-texto { line-height: 1.8; }
    .completar-texto u { letter-spacing: 2px; min-width: 30mm; display: inline-block; }
    .resp-pauta, .pauta-resp { color: #b91c1c; font-weight: 700; }
    .pauta-resp { padding: 3px 8px; background: #fee2e2; border-left: 3px solid #b91c1c; font-size: 10pt; }
    .linea-respuesta, .linea-resp { border-bottom: 1px solid #6b7280; height: 7mm; margin: 1mm 6mm; }
    .opciones-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 3mm; margin: 2mm 0 0 5mm; }
    .opt-item { padding: 4px; border: 1px dashed #c4b5fd; border-radius: 4px; font-size: 10.5pt; }
    .caja-dibujo { min-height: 60mm; border: 2px dashed #9ca3af; border-radius: 4px; margin: 2mm 0 0 5mm; padding: 3mm; color: #9ca3af; text-align: center; font-style: italic; }
    .sopa-tabla { border-collapse: collapse; margin: 3mm auto; }
    .sopa-tabla td { width: 8mm; height: 8mm; border: 1px solid #6b7280; text-align: center; font-family: monospace; }
    .cierre-box { margin: 6mm 0 0; padding: 4mm; background: #fef3c7; border: 2px solid #f59e0b; border-radius: 6px; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none; } }
  `
}

function colegioHeader(colegio?: InfoColegio | null, accent = "#111827"): string {
  if (colegio?.encabezadoHabilitado) {
    return `<div class="encabezado-colegio" style="border-bottom-color:${accent}">
      <div>${escapeHtml(colegio.encabezadoTextoIzq || "").replace(/\n/g, "<br>")}</div>
      <div>${escapeHtml(colegio.encabezadoTextoDer || "").replace(/\n/g, "<br>")}</div>
    </div>`
  }
  return colegio?.nombre ? `<div class="encabezado-colegio simple" style="border-bottom-color:${accent}">${escapeHtml(colegio.nombre)}</div>` : ""
}

function buildPruebaHtml(opts: Extract<DocumentHtmlOptions, { tipo: "prueba" }>): string {
  const prueba = opts.documento
  const modo = opts.modo || "para_alumno"
  const docente = escapeHtml(opts.profesorNombre || prueba.docenteNombre || "")
  const alumnoNombre = escapeHtml(opts.alumno?.nombre || "")
  const titulo = escapeHtml(prueba.nombre || "Evaluacion")
  const contador = { value: 0 }
  const secciones = prueba.secciones.map(s => renderPruebaSeccion(s, contador, modo)).join("")
  const instr = prueba.instruccionesGenerales?.length
    ? `<div class="instrucciones-grales"><b>Instrucciones generales:</b><ul>${prueba.instruccionesGenerales.map(i => `<li>${escapeHtml(i)}</li>`).join("")}</ul></div>`
    : ""
  const tablaOA = prueba.metadatosCurriculares?.objetivos?.length
    ? `<table class="tabla-oa"><thead><tr><th>Objetivo</th><th>Detalle</th></tr></thead><tbody>${prueba.metadatosCurriculares.objetivos.map(o => `<tr><td class="oa-num">${escapeHtml(o.match(/^(OA[A]?\s*\d+)/i)?.[1] || "OA")}</td><td>${escapeHtml(o)}</td></tr>`).join("")}</tbody></table>`
    : ""

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${titulo}</title><style>${baseStyles("prueba", modo)}</style></head>
  <body>${colegioHeader(opts.colegio, "#111827")}<h1 class="doc-title">${titulo}</h1>
    <table class="tabla-datos"><tbody>
      <tr><td class="lbl">Estudiante</td><td colspan="3">${alumnoNombre || "&nbsp;"}</td><td class="lbl">Curso</td><td>${escapeHtml(prueba.curso)}</td></tr>
      <tr><td class="lbl">Docente</td><td>${docente}</td><td class="lbl">Tiempo</td><td>${prueba.tiempoMinutos ? `${prueba.tiempoMinutos} min` : "&nbsp;"}</td><td class="lbl">Calificacion</td><td>&nbsp;</td></tr>
      <tr><td class="lbl">Asignatura</td><td>${escapeHtml(prueba.asignatura)}</td><td class="lbl">Puntaje ideal</td><td>${escapeHtml(prueba.puntajeMaximo)} pts</td><td class="lbl">Puntaje final</td><td>&nbsp;</td></tr>
    </tbody></table>
    ${instr}${tablaOA}${secciones}${sharedImageFallbackScript()}</body></html>`
}

function buildGuiaHtml(opts: Extract<DocumentHtmlOptions, { tipo: "guia" }>): string {
  const guia = opts.documento
  const modo = opts.modo || "para_alumno"
  const docente = escapeHtml(opts.profesorNombre || guia.docenteNombre || "")
  const alumnoNombre = escapeHtml(opts.alumno?.nombre || "")
  const titulo = escapeHtml(guia.numeroGuia ? `${guia.numeroGuia} - ${guia.nombre || "Guia"}` : guia.nombre || "Guia de aprendizaje")
  const secciones = guia.secciones.map(s => renderGuiaSeccion(s, modo)).join("")
  const objetivo = guia.objetivo ? `<div class="objetivo-box"><b>Objetivo:</b> ${escapeHtml(guia.objetivo)}</div>` : ""
  const oas = guia.metadatosCurriculares?.objetivos?.length
    ? `<div class="oas-box"><b>OA(s):</b><ul>${guia.metadatosCurriculares.objetivos.map(o => `<li>${escapeHtml(o)}</li>`).join("")}</ul></div>`
    : ""
  const instrucciones = guia.instrucciones?.length
    ? `<div class="instrucciones"><b>Instrucciones:</b><ul>${guia.instrucciones.map(i => `<li>${escapeHtml(i)}</li>`).join("")}</ul></div>`
    : ""
  const cierre = guia.cierre?.length ? `<div class="cierre-box"><h3>Cierre y reflexion</h3>${renderRecursos(guia.cierre)}</div>` : ""

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${titulo}</title><style>${baseStyles("guia", modo)}</style></head>
  <body>${colegioHeader(opts.colegio, "#6366f1")}<h1 class="doc-title">${titulo}</h1>
    <div class="datos-box">
      <div><b>Asignatura:</b> ${escapeHtml(guia.asignatura)}</div>
      <div><b>Curso:</b> ${escapeHtml(guia.curso)}</div>
      ${docente ? `<div><b>Profesor(a):</b> ${docente}</div>` : ""}
      ${guia.tiempoMinutos ? `<div><b>Tiempo:</b> ${guia.tiempoMinutos} min</div>` : ""}
      <div><b>Nombre:</b> ${alumnoNombre || "_______________________________"}</div>
      ${guia.unidadNombre ? `<div><b>Unidad:</b> ${escapeHtml(guia.unidadNombre)}</div>` : ""}
    </div>
    ${objetivo}${oas}${instrucciones}${secciones}${cierre}${sharedImageFallbackScript()}</body></html>`
}

export function buildDocumentHtml(opts: DocumentHtmlOptions): string {
  if (opts.tipo === "prueba") return buildPruebaHtml(opts)
  return buildGuiaHtml(opts)
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function descargarHtml(opts: DocumentHtmlOptions): void {
  const html = buildDocumentHtml(opts)
  downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), documentFileName(opts, "html"))
}

export function waitForImages(doc: Document): Promise<void> {
  const images = Array.from(doc.images || [])
  if (images.length === 0) return Promise.resolve()
  return Promise.all(images.map(img => {
    if (img.complete) return Promise.resolve()
    return new Promise<void>(resolve => {
      img.addEventListener("load", () => resolve(), { once: true })
      img.addEventListener("error", () => resolve(), { once: true })
    })
  })).then(() => undefined)
}

export async function imprimirHtml(html: string): Promise<void> {
  const win = window.open("", "_blank", "width=900,height=900")
  if (!win) {
    alert("Permite las ventanas emergentes para imprimir o guardar como PDF.")
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
  await waitForImages(win.document)
  try {
    win.focus()
    win.print()
  } catch {}
}

export async function imprimirDocumento(opts: DocumentHtmlOptions): Promise<void> {
  await imprimirHtml(buildDocumentHtml(opts))
}

function plainLinesFromPrueba(prueba: PruebaTemplate, modo: DocumentPreviewMode): string[] {
  const lines = [
    prueba.nombre || "Prueba",
    `Asignatura: ${prueba.asignatura}`,
    `Curso: ${prueba.curso}`,
    `Puntaje ideal: ${prueba.puntajeMaximo} pts`,
    "",
    ...(prueba.instruccionesGenerales || []).map(i => `Instruccion: ${i}`),
  ]
  let idx = 0
  prueba.secciones.forEach(sec => {
    lines.push("", sec.titulo)
    sec.items.forEach(item => {
      idx += 1
      lines.push(`${idx}. ${item.enunciado} (${item.puntaje} pts)`)
      if (item.tipo === "seleccion_multiple") {
        item.alternativas.forEach((a, i) => lines.push(`   ${letra(i)}) ${a.texto}${modo === "con_pauta" && a.esCorrecta ? " [correcta]" : ""}`))
      }
      if (item.tipo === "respuesta_corta" && modo === "con_pauta" && item.respuestaEsperada) lines.push(`   Respuesta esperada: ${item.respuestaEsperada}`)
      if (item.tipo === "desarrollo" && modo === "con_pauta" && item.pautaCorreccion) lines.push(`   Pauta: ${item.pautaCorreccion}`)
    })
  })
  return lines
}

function plainLinesFromGuia(guia: GuiaTemplate, modo: DocumentPreviewMode): string[] {
  const lines = [
    guia.numeroGuia ? `${guia.numeroGuia} - ${guia.nombre}` : guia.nombre || "Guia",
    `Asignatura: ${guia.asignatura}`,
    `Curso: ${guia.curso}`,
    guia.objetivo ? `Objetivo: ${guia.objetivo}` : "",
    "",
    ...(guia.instrucciones || []).map(i => `Instruccion: ${i}`),
  ].filter(Boolean)
  guia.secciones.forEach(sec => {
    lines.push("", sec.titulo)
    sec.contenido.forEach(b => {
      if (b.tipo === "texto") lines.push(stripHtml(b.data.html || ""))
      if (b.tipo === "tabla") lines.push([b.data.cabeceras.join(" | "), ...b.data.filas.map(f => f.join(" | "))].join("\n"))
      if (b.tipo === "imagen") lines.push(`[Imagen] ${b.data.caption || b.data.alt || ""}`)
    })
    sec.actividades.forEach(act => {
      lines.push(`${act.numero || "•"}. ${act.enunciado}${act.puntaje ? ` (${act.puntaje} pts)` : ""}`)
      if (modo === "con_pauta" && act.datos?.tipo === "seleccion_multiple") {
        act.datos.alternativas.filter(a => a.correcta).forEach(a => lines.push(`   Correcta: ${a.texto}`))
      }
    })
  })
  return lines
}

export async function descargarComoDOCX(opts: DocumentHtmlOptions): Promise<void> {
  const {
    Document: DocxDocument,
    HeadingLevel,
    Packer,
    Paragraph,
    TextRun,
  } = await import("docx")

  const lines = opts.tipo === "prueba"
    ? plainLinesFromPrueba(opts.documento, opts.modo || "para_alumno")
    : plainLinesFromGuia(opts.documento, opts.modo || "para_alumno")

  const children = lines.map((line, index) => new Paragraph({
    heading: index === 0 ? HeadingLevel.HEADING_1 : undefined,
    children: [new TextRun({ text: line || " ", bold: index === 0 })],
  }))

  const doc = new DocxDocument({
    sections: [{ properties: {}, children }],
  })
  const blob = await Packer.toBlob(doc)
  downloadBlob(blob, documentFileName(opts, "docx"))
}
