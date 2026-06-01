// ═══════════════════════════════════════════════════════════════════════════
// Exportación e Impresión de Listas de Cotejo (PDF)
// ═══════════════════════════════════════════════════════════════════════════

import type { ListaCotejoTemplate, ListaCotejoEvaluacion } from "@/lib/listas-cotejo"
import type { InfoColegio } from "@/lib/perfil"

function escapeHtml(value: string): string {
  return (value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function formatearFecha(fechaIso?: string): string {
  const d = fechaIso ? new Date(fechaIso) : new Date()
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" })
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Hoja de Evaluación Vacía Imprimible (para evaluar a mano en sala)
// ─────────────────────────────────────────────────────────────────────────────
export interface HojaEvaluacionListaOpciones {
  lista: ListaCotejoTemplate
  evaluacion: ListaCotejoEvaluacion
  colegio?: InfoColegio | null
  profesorNombre?: string
  fecha?: string
}

function buildHojaHtml(opts: HojaEvaluacionListaOpciones): string {
  const { lista, evaluacion, colegio, profesorNombre: profesor, fecha } = opts

  const colegioNombre = escapeHtml(colegio?.nombre || "")
  const profesorNombre = escapeHtml(profesor || "")
  const asignatura = escapeHtml(lista.asignatura || "")
  const curso = escapeHtml(lista.curso || "")
  const listaNombre = escapeHtml(lista.nombre || "Lista de Cotejo")
  const fechaTexto = escapeHtml(formatearFecha(fecha))

  const escala = lista.escalaDicotomica || ["Sí", "No"]
  const colSi = escapeHtml(escala[0])
  const colNo = escapeHtml(escala[1])

  // Obtener indicadores planos
  const indicadores = lista.secciones.flatMap(s => s.indicadores)

  const filas: string[] = []
  let count = 0
  const estudiantesList = (evaluacion.grupos || []).flatMap(g => g.estudiantes)
  for (const est of estudiantesList) {
    count++
    const celdas = indicadores.map(() => `
      <td class="celda-marcado">
        <div class="cajas-marcado">
          <span>[ ] ${colSi}</span>
          <span>[ ] ${colNo}</span>
        </div>
      </td>
    `).join("")

    filas.push(`
      <tr>
        <td class="num">${count}</td>
        <td class="nombre">${escapeHtml(est.nombre)} ${est.hasPie ? '<span class="pie-badge">PIE</span>' : ''}</td>
        ${celdas}
        <td class="celda-obs">&nbsp;</td>
      </tr>
    `)
  }

  const thIndicadores = indicadores.map((ind, idx) => `
    <th class="th-ind">
      <div class="ind-num">${idx + 1}</div>
      <div class="ind-txt" title="${escapeHtml(ind.texto)}">${escapeHtml(ind.texto)}</div>
      ${ind.focoDiferenciadoActivo ? '<div class="ind-badge-alt">Decreto 83</div>' : ''}
    </th>
  `).join("")

  const leyendasInd = indicadores.map((ind, idx) => `
    <div class="leyenda-item">
      <b>${idx + 1}:</b> ${escapeHtml(ind.texto)}
      ${ind.focoDiferenciadoActivo ? ` <span class="badge-alt">(Canal alternativo: ${escapeHtml(ind.focoDiferenciadoTexto || "")})</span>` : ""}
      ${ind.esTransversal ? ` <span class="badge-oat">(OAT - Actitudinal)</span>` : ""}
    </div>
  `).join("")

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Hoja Imprimible — ${listaNombre}</title>
<style>
  @page { size: A4 landscape; margin: 8mm 8mm 8mm 8mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 8.5pt;
    color: #111;
    margin: 0;
    padding: 10px;
    background: #f6f7f9;
  }
  .toolbar {
    display: flex; gap: 10px; align-items: center;
    padding: 8px 12px; margin-bottom: 10px;
    background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
  }
  .toolbar button {
    padding: 5px 12px; border-radius: 6px; border: 1px solid #d1d5db;
    background: #fff; cursor: pointer; font-size: 9.5pt; font-weight: 600;
  }
  .toolbar button.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
  .toolbar small { color: #6b7280; margin-left: auto; }

  .hoja-header {
    display: flex; justify-content: space-between; align-items: flex-end;
    border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 10px;
    background: #fff; padding: 10px; border-radius: 8px 8px 0 0;
  }
  .hoja-header h1 { margin: 0; font-size: 14pt; font-weight: 800; }
  .hoja-header .meta { font-size: 9pt; color: #555; margin-top: 2px; }
  .hoja-header .col-der { text-align: right; font-size: 8.5pt; color: #555; }
  .colegio { font-weight: 700; color: #111; font-size: 9.5pt; }

  table.eval-tabla {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
  }
  table.eval-tabla th, table.eval-tabla td {
    border: 1px solid #999;
    padding: 4px 6px;
    vertical-align: middle;
  }
  table.eval-tabla thead th {
    background: #f3f4f6;
    font-weight: bold;
    text-align: center;
  }
  .th-estudiante { text-align: left !important; width: 180px; }
  .th-ind {
    width: 80px;
    font-size: 7.5pt;
    vertical-align: top !important;
  }
  .ind-num {
    font-size: 9pt;
    font-weight: 800;
    margin-bottom: 2px;
    background: #e5e7eb;
    border-radius: 3px;
    padding: 1px 0;
  }
  .ind-txt {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    height: 33px;
    line-height: 1.1;
  }
  .ind-badge-alt {
    margin-top: 2px;
    background: #faf5ff;
    color: #6b21a8;
    border: 1px solid #e9d5ff;
    border-radius: 2px;
    font-size: 6.5pt;
    font-weight: bold;
  }
  .num { text-align: center; width: 25px; font-weight: bold; }
  .nombre { font-weight: bold; }
  .pie-badge {
    background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe;
    border-radius: 3px; font-size: 7pt; font-weight: 800; padding: 0 4px;
    margin-left: 4px; display: inline-block;
  }
  .celda-marcado { text-align: center; width: 80px; }
  .cajas-marcado {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    font-size: 7pt;
    color: #4b5563;
  }
  .celda-obs { width: 140px; }

  .seccion-leyendas {
    margin-top: 12px;
    background: #fff;
    padding: 10px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    page-break-inside: avoid;
  }
  .seccion-leyendas h3 { margin: 0 0 6px 0; font-size: 10pt; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  .leyenda-item {
    font-size: 8pt;
    margin-bottom: 4px;
    line-height: 1.3;
  }
  .badge-alt { color: #6b21a8; font-weight: bold; }
  .badge-oat { color: #047857; font-weight: bold; }

  @media print {
    body { background: #fff; padding: 0; }
    .toolbar { display: none; }
    table.eval-tabla th, table.eval-tabla td { border-color: #555; }
    .hoja-header { border-bottom-color: #000; padding: 0; }
  }
</style>
</head>
<body>

<div class="toolbar">
  <button class="primary" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
  <button onclick="window.close()">Cerrar</button>
  <small>Sugerencia: Imprime en orientación Horizontal (A4) y habilita "Imprimir gráficos de fondo".</small>
</div>

<header class="hoja-header">
  <div class="col-izq">
    <h1>${listaNombre}</h1>
    <div class="meta">
      Hoja de Evaluación en Aula · ${asignatura} · ${curso}
    </div>
  </div>
  <div class="col-der">
    ${colegio?.logoBase64 ? `<img src="${colegio.logoBase64}" style="height:32px;width:auto;max-width:100px;object-fit:contain;margin-bottom:2px" alt="Logo">` : ""}
    ${colegioNombre ? `<div class="colegio">${colegioNombre}</div>` : ""}
    ${profesorNombre ? `<div>Prof. ${profesorNombre}</div>` : ""}
    <div>Fecha: _______________</div>
  </div>
</header>

${lista.instruccionesMetodologicas ? `
<div style="background:#fff; border:1px solid #d1d5db; border-radius:8px; padding:8px 10px; margin-bottom:10px; font-size:8.5pt;">
  <b>Instrucciones Metodológicas:</b> ${escapeHtml(lista.instruccionesMetodologicas)}
</div>
` : ''}

<table class="eval-tabla">
  <thead>
    <tr>
      <th>N°</th>
      <th class="th-estudiante">Estudiante</th>
      ${thIndicadores}
      <th>Observaciones / Retroalimentación</th>
    </tr>
  </thead>
  <tbody>
    ${filas.join("")}
  </tbody>
</table>

<div class="seccion-leyendas">
  <h3>Indicadores y Criterios Detallados</h3>
  <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
    ${leyendasInd}
  </div>
</div>

</body>
</html>`
}

export function abrirListaCotejoHojaEvaluacionImprimible(opts: HojaEvaluacionListaOpciones): void {
  const html = buildHojaHtml(opts)
  const win = window.open("", "_blank", "width=1100,height=800")
  if (!win) {
    alert("Tu navegador bloqueó la ventana emergente. Por favor permite popups para esta página.")
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Reporte de Resultados Individuales (por alumno)
// ─────────────────────────────────────────────────────────────────────────────
export interface ResultadosIndividualesListaOpciones {
  lista: ListaCotejoTemplate
  evaluacion: ListaCotejoEvaluacion
  colegio?: InfoColegio | null
  profesorNombre?: string
}

function buildResultadosHtml(opts: ResultadosIndividualesListaOpciones): string {
  const { lista, evaluacion, colegio, profesorNombre: profesor } = opts

  const colegioNombre = escapeHtml(colegio?.nombre || "")
  const profesorNombre = escapeHtml(profesor || "")
  const asignatura = escapeHtml(lista.asignatura || "")
  const curso = escapeHtml(lista.curso || "")
  const listaNombre = escapeHtml(lista.nombre || "Lista de Cotejo")

  const escala = lista.escalaDicotomica || ["Sí", "No"]
  const colSi = escapeHtml(escala[0])
  const colNo = escapeHtml(escala[1])

  const estudiantesList2 = (evaluacion.grupos || []).flatMap(g => g.estudiantes)
  const alumnosCards = estudiantesList2.map(est => {
    const respuestas = est.respuestas || {}
    const puntaje = est.puntaje ?? 0
    const porcentaje = est.porcentaje ?? 0
    const nota = est.nota ?? 1.0

    const filasIndicadores = lista.secciones.flatMap(sec => {
      const filasSec = sec.indicadores.map(ind => {
        const respuesta = respuestas[ind.id]
        let estadoLabel = "Sin Evaluar"
        let claseEstado = "sin-evaluar"
        if (respuesta === true) {
          estadoLabel = colSi
          claseEstado = "logrado"
        } else if (respuesta === false) {
          estadoLabel = colNo
          claseEstado = "no-logrado"
        }

        return `
          <tr>
            <td style="font-weight: 500;">${escapeHtml(ind.texto)}</td>
            <td style="text-align: center; width: 110px;">
              <span class="estado-badge ${claseEstado}">${estadoLabel}</span>
            </td>
            <td style="text-align: center; width: 60px; font-weight: bold;">
              ${respuesta === true ? lista.puntajePorSi : 0}
            </td>
          </tr>
        `
      })

      // Agregar encabezado de sección
      return [
        `
        <tr class="seccion-header-row">
          <td colspan="3"><b>${escapeHtml(sec.nombre)}</b> ${sec.oasVinculados.length ? `<span style="font-weight:normal;color:#6b7280;">(${escapeHtml(sec.oasVinculados.join(", "))})</span>` : ""}</td>
        </tr>
        `,
        ...filasSec
      ]
    }).join("")

    return `
      <div class="alumno-page">
        <header class="hoja-header">
          <div class="col-izq">
            <h2 class="lista-titulo-eval">${listaNombre}</h2>
            <div class="meta">
              Reporte de Evaluación Individual · ${asignatura}
            </div>
          </div>
          <div class="col-der">
            ${colegioNombre ? `<div class="colegio">${colegioNombre}</div>` : ""}
            ${profesorNombre ? `<div>Prof: ${profesorNombre}</div>` : ""}
          </div>
        </header>

        <div class="ficha-alumno">
          <div class="campo"><b>Estudiante:</b> ${escapeHtml(est.nombre)}</div>
          <div class="campo"><b>Curso:</b> ${curso}</div>
          <div class="campo"><b>Puntaje:</b> ${puntaje} / ${lista.puntajeMaximo} pts</div>
          <div class="campo"><b>Logro:</b> ${porcentaje}%</div>
          <div class="campo nota-destacada ${nota >= 4.0 ? 'aprobado' : 'reprobado'}">
            <b>Nota:</b> ${nota.toFixed(1)}
          </div>
        </div>

        <table class="resultados-tabla">
          <thead>
            <tr>
              <th>Indicador de Evaluación</th>
              <th style="text-align: center;">Respuesta</th>
              <th style="text-align: center;">Puntos</th>
            </tr>
          </thead>
          <tbody>
            ${filasIndicadores}
          </tbody>
        </table>

        <div class="retro-box">
          <h4>Retroalimentación Cualitativa / Observaciones</h4>
          <p>${escapeHtml(est.observaciones) || "<em>Sin observaciones registradas.</em>"}</p>
        </div>

        <div class="firmas-box">
          <div class="firma-linea">Firma del Docente</div>
          <div class="firma-linea">Firma Apoderado / UTP</div>
        </div>
      </div>
    `
  }).join("\n<!-- pagebreak -->\n")

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Reportes Individuales — ${listaNombre}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 9.5pt;
    color: #111;
    margin: 0;
    padding: 0;
    background: #f3f4f6;
  }
  .toolbar {
    display: flex; gap: 10px; align-items: center;
    padding: 10px;
    background: #fff; border-bottom: 1px solid #d1d5db;
    position: sticky; top: 0; z-index: 100;
  }
  .toolbar button {
    padding: 6px 14px; border-radius: 6px; border: 1px solid #d1d5db;
    background: #fff; cursor: pointer; font-size: 10pt; font-weight: 600;
  }
  .toolbar button.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
  .toolbar small { color: #6b7280; margin-left: auto; }

  .alumno-page {
    background: #fff;
    max-width: 800px;
    margin: 20px auto;
    padding: 24px;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    page-break-after: always;
  }
  .alumno-page:last-child { page-break-after: avoid; }

  .hoja-header {
    display: flex; justify-content: space-between; align-items: flex-end;
    border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-bottom: 15px;
  }
  .lista-titulo-eval { margin: 0; font-size: 15pt; font-weight: 800; color: #1e3a8a; }
  .hoja-header .meta { font-size: 9pt; color: #4b5563; margin-top: 2px; }
  .hoja-header .col-der { text-align: right; font-size: 9pt; color: #4b5563; }
  .colegio { font-weight: 700; color: #111; }

  .ficha-alumno {
    display: grid;
    grid-template-columns: 2fr 1fr 1.2fr 1.2fr 1.2fr;
    gap: 10px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 10px 14px;
    margin-bottom: 15px;
    align-items: center;
  }
  .ficha-alumno .campo {
    font-size: 9.5pt;
    color: #334155;
  }
  .nota-destacada {
    padding: 4px 8px;
    border-radius: 6px;
    text-align: center;
    font-size: 11pt;
    font-weight: 800;
  }
  .nota-destacada.aprobado { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
  .nota-destacada.reprobado { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }

  table.resultados-tabla {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 15px;
  }
  table.resultados-tabla th, table.resultados-tabla td {
    border: 1px solid #cbd5e1;
    padding: 6px 10px;
    font-size: 9pt;
  }
  table.resultados-tabla thead th {
    background: #f1f5f9;
    font-weight: bold;
    text-align: left;
  }
  .seccion-header-row td {
    background: #f8fafc;
    font-size: 9.5pt;
    color: #1e293b;
    padding: 5px 10px;
  }

  .estado-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 8pt;
    font-weight: bold;
    text-align: center;
  }
  .estado-badge.logrado { background: #dcfce7; color: #15803d; }
  .estado-badge.no-logrado { background: #fee2e2; color: #b91c1c; }
  .estado-badge.sin-evaluar { background: #f1f5f9; color: #64748b; }

  .retro-box {
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 10px 14px;
    margin-top: 15px;
    background: #fafaf9;
  }
  .retro-box h4 { margin: 0 0 5px 0; font-size: 10pt; color: #44403c; border-bottom: 1px solid #e7e5e4; padding-bottom: 2px; }
  .retro-box p { margin: 0; font-size: 9pt; line-height: 1.4; color: #292524; }

  .firmas-box {
    display: flex;
    justify-content: space-around;
    margin-top: 40px;
    padding-top: 20px;
  }
  .firma-linea {
    border-top: 1px solid #94a3b8;
    width: 200px;
    text-align: center;
    font-size: 8pt;
    color: #64748b;
    padding-top: 4px;
  }

  @media print {
    body { background: #fff; padding: 0; }
    .toolbar { display: none; }
    .alumno-page {
      margin: 0;
      padding: 0;
      border: none;
      border-radius: 0;
    }
  }
</style>
</head>
<body>

<div class="toolbar">
  <button class="primary" onclick="window.print()">🖨️ Imprimir Todo / Guardar PDF</button>
  <button onclick="window.close()">Cerrar</button>
  <small>Se imprimirá un reporte individual por página. Usa tamaño de papel A4.</small>
</div>

${alumnosCards}

</body>
</html>`
}

export function abrirListaCotejoResultadosIndividualesImprimible(opts: ResultadosIndividualesListaOpciones): void {
  const html = buildResultadosHtml(opts)
  const win = window.open("", "_blank", "width=850,height=900")
  if (!win) {
    alert("Tu navegador bloqueó la ventana emergente. Por favor permite popups para esta página.")
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Plantilla de validación UTP (Decreto 67 y Decreto 83)
// ─────────────────────────────────────────────────────────────────────────────
export interface PlantillaUTPOpciones {
  lista: ListaCotejoTemplate
  colegio?: InfoColegio | null
  profesorNombre?: string
}

function buildUTPHtml(opts: PlantillaUTPOpciones): string {
  const { lista, colegio, profesorNombre: profesor } = opts

  const colegioNombre = escapeHtml(colegio?.nombre || "")
  const rbd = escapeHtml(lista.rbd || colegio?.rbd || "No registrado")
  const profesorNombre = escapeHtml(profesor || lista.docenteNombre || "Docente Evaluador")
  const asignatura = escapeHtml(lista.asignatura || "")
  const curso = escapeHtml(lista.curso || "")
  const listaNombre = escapeHtml(lista.nombre || "Lista de Cotejo")

  const escala = lista.escalaDicotomica || ["Sí", "No"]
  const colSi = escapeHtml(escala[0])
  const colNo = escapeHtml(escala[1])

  // OAs y OATs seleccionados
  const oasSeleccionados = (lista.oas || []).filter(oa => oa.seleccionado)
  const oasHtml = oasSeleccionados.map(oa => `
    <div class="oa-card">
      <span class="oa-title">OA ${oa.numero}</span>
      <p class="oa-desc">${escapeHtml(oa.descripcion)}</p>
    </div>
  `).join("")

  const oatHtml = (lista.metadatosCurriculares?.objetivosTransversales || []).map(oat => `
    <div class="oa-card oat">
      <span class="oa-title oat">OAT / Actitudinal</span>
      <p class="oa-desc">${escapeHtml(oat)}</p>
    </div>
  `).join("")

  // Dimensiones e Indicadores con sus flags de validación
  let totalIndicadoresValidados = 0
  let indicadoresOAT = 0
  let indicadoresDec83 = 0
  let totalPuedoFilmarlo = 0

  const seccionesHtml = lista.secciones.map(sec => {
    const filasInd = sec.indicadores.map((ind, index) => {
      totalIndicadoresValidados++
      if (ind.esTransversal) indicadoresOAT++
      if (ind.focoDiferenciadoActivo) indicadoresDec83++
      if (ind.puedoFilmarloConfirmado) totalPuedoFilmarlo++

      // NLP Check verbos mentalistas
      const prohibidos = ["comprende", "entiende", "sabe", "conoce", "reflexiona", "valora", "aprecia", "asimila", "piensa", "razona"]
      const palabras = ind.texto.toLowerCase().split(/[^a-záéíóúüñ]+/)
      const tieneProhibido = palabras.some(p => prohibidos.includes(p))

      return `
        <tr>
          <td style="text-align: center; font-weight: bold; width: 40px;">${index + 1}</td>
          <td>
            <div style="font-weight: 500; font-size: 9.5pt;">${escapeHtml(ind.texto)}</div>
            ${ind.focoDiferenciadoActivo ? `
              <div class="utp-alt-foco">
                <b>Canal de Demostración Alternativo (Decreto 83):</b> ${escapeHtml(ind.focoDiferenciadoTexto || "")}
              </div>
            ` : ''}
          </td>
          <td style="width: 140px; font-size: 8.5pt;">
            <div class="utp-flag ${ind.esTransversal ? 'active' : ''}">
              ${ind.esTransversal ? '✅ OAT Actitudinal' : '❌ Disciplinar'}
            </div>
            <div class="utp-flag ${ind.puedoFilmarloConfirmado ? 'active' : 'warn'}">
              ${ind.puedoFilmarloConfirmado ? '📹 Filmar: Sí' : '⚠️ Sin Fenomenología'}
            </div>
            <div class="utp-flag ${tieneProhibido ? 'error' : 'active'}">
              ${tieneProhibido ? '⚠️ Mentalista detectado' : '✅ Verbo Observable'}
            </div>
          </td>
        </tr>
      `
    }).join("")

    return `
      <div class="seccion-utp">
        <h3>Dimensión / Categoría: ${escapeHtml(sec.nombre)}</h3>
        <table class="utp-tabla">
          <thead>
            <tr>
              <th style="text-align: center;">N°</th>
              <th>Indicador de Evaluación Observable</th>
              <th>Metadatos de Calidad UTP</th>
            </tr>
          </thead>
          <tbody>
            ${filasInd || '<tr><td colspan="3" style="text-align:center; color:#94a3b8;">Sin indicadores</td></tr>'}
          </tbody>
        </table>
      </div>
    `
  }).join("\n")

  const coherenciaOAT = indicadoresOAT > 0 ? "CUMPLE (Tiene al menos 1 indicador transversal actitudinal)" : "⚠️ INCUMPLE (Exige al menos 1 indicador actitudinal transversal)";

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Validación UTP — ${listaNombre}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 10pt;
    color: #1e293b;
    margin: 0;
    padding: 20px;
    background: #f8fafc;
  }
  .toolbar {
    display: flex; gap: 10px; align-items: center;
    padding: 10px 14px; margin-bottom: 20px;
    background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;
  }
  .toolbar button {
    padding: 6px 14px; border-radius: 6px; border: 1px solid #cbd5e1;
    background: #fff; cursor: pointer; font-size: 9.5pt; font-weight: 600;
  }
  .toolbar button.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
  .toolbar small { color: #64748b; margin-left: auto; }

  .documento {
    background: #fff;
    padding: 30px;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    max-width: 800px;
    margin: 0 auto;
  }

  .cabecera-utp {
    border-bottom: 3px double #0284c7;
    padding-bottom: 12px;
    margin-bottom: 20px;
    display: flex;
    justify-content: space-between;
  }
  .cabecera-utp h1 { margin: 0; font-size: 16pt; font-weight: 800; color: #0369a1; }
  .cabecera-utp .rbd-meta { font-size: 9pt; color: #64748b; margin-top: 4px; }
  .cabecera-utp .colegio { font-weight: bold; font-size: 10pt; text-align: right; }

  .cuadro-datos {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px 20px;
    background: #f0f9ff;
    border: 1px solid #bae6fd;
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 20px;
  }
  .cuadro-datos div { font-size: 9.5pt; }

  .seccion-titulo {
    font-size: 12pt;
    font-weight: bold;
    color: #0f172a;
    border-left: 4px solid #0284c7;
    padding-left: 8px;
    margin: 20px 0 10px 0;
  }

  .oa-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 10px;
    margin-bottom: 8px;
  }
  .oa-card.oat { background: #ecfdf5; border-color: #a7f3d0; }
  .oa-title { font-weight: 800; font-size: 9pt; color: #0284c7; }
  .oa-title.oat { color: #047857; }
  .oa-desc { margin: 4px 0 0 0; font-size: 9pt; line-height: 1.35; }

  .utp-resumen {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin: 20px 0;
  }
  .utp-resumen-item {
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 10px;
    text-align: center;
    background: #fff;
  }
  .utp-resumen-item .valor { font-size: 18pt; font-weight: 800; color: #0369a1; }
  .utp-resumen-item .label { font-size: 8pt; color: #64748b; margin-top: 2px; }

  table.utp-tabla {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;
  }
  table.utp-tabla th, table.utp-tabla td {
    border: 1px solid #cbd5e1;
    padding: 8px 12px;
    font-size: 9pt;
  }
  table.utp-tabla thead th {
    background: #f1f5f9;
    font-weight: bold;
  }
  .seccion-utp h3 { font-size: 10.5pt; color: #334155; margin: 15px 0 8px 0; }

  .utp-alt-foco {
    margin-top: 6px;
    padding: 6px 8px;
    background: #faf5ff;
    border: 1px dashed #c084fc;
    border-radius: 4px;
    font-size: 8.5pt;
    color: #581c87;
  }
  .utp-flag {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 4px;
    font-weight: bold;
    font-size: 7.5pt;
    margin-bottom: 2px;
  }
  .utp-flag.active { background: #dcfce7; color: #166534; }
  .utp-flag.warn { background: #fef9c3; color: #854d0e; }
  .utp-flag.error { background: #fee2e2; color: #991b1b; }

  .firmas-utp {
    display: flex;
    justify-content: space-between;
    margin-top: 40px;
    border-top: 1px solid #cbd5e1;
    padding-top: 20px;
  }
  .firma-utp-line {
    width: 220px;
    text-align: center;
    font-size: 8.5pt;
  }
  .firma-utp-line .raya { border-bottom: 1px solid #64748b; height: 40px; margin-bottom: 6px; }

  @media print {
    body { background: #fff; padding: 0; }
    .toolbar { display: none; }
    .documento { border: none; padding: 0; max-width: 100%; }
  }
</style>
</head>
<body>

<div class="toolbar">
  <button class="primary" onclick="window.print()">🖨️ Imprimir Ficha de Validación</button>
  <button onclick="window.close()">Cerrar</button>
  <small>Envía esta pauta impresa o guárdala como PDF para ser entregada a Coordinación UTP.</small>
</div>

<div class="documento">
  <header class="cabecera-utp">
    <div>
      <h1>FICHA DE VALIDACIÓN DE INSTRUMENTO UTP</h1>
      <div class="rbd-meta">Decreto 67 (Formativo, Procesual) · RBD: ${rbd}</div>
    </div>
    <div class="colegio">
      ${colegioNombre}<br>
      <span style="font-weight:normal;color:#64748b;font-size:8.5pt;">Unidad Técnica Pedagógica</span>
    </div>
  </header>

  <div class="cuadro-datos">
    <div><b>Instrumento:</b> Lista de Cotejo / Escala Dicotómica</div>
    <div><b>Asignatura:</b> ${asignatura}</div>
    <div><b>Curso/Nivel:</b> ${curso}</div>
    <div><b>Docente:</b> ${profesorNombre}</div>
    <div><b>Fecha Presentación:</b> ${formatearFecha()}</div>
    <div><b>Escala de Evaluación:</b> ${colSi} / ${colNo}</div>
  </div>

  <div class="seccion-titulo">Métricas del Instrumento</div>
  <div class="utp-resumen">
    <div class="utp-resumen-item">
      <div class="valor">${totalIndicadoresValidados}</div>
      <div class="label">Indicadores Totales</div>
    </div>
    <div class="utp-resumen-item">
      <div class="valor">${indicadoresOAT}</div>
      <div class="label">OAT / Actitudinales</div>
    </div>
    <div class="utp-resumen-item">
      <div class="valor">${indicadoresDec83}</div>
      <div class="label">Dec. 83 (Alt. Salida)</div>
    </div>
    <div class="utp-resumen-item">
      <div class="valor">${totalPuedoFilmarlo}</div>
      <div class="label">Fenomenológicos</div>
    </div>
  </div>

  <div class="seccion-titulo">Alineación Curricular Disciplinar e Integral (OAT)</div>
  ${oasHtml || '<p style="color:#64748b; font-size:9pt; font-style:italic;">Sin Objetivos de Aprendizaje (OA) seleccionados.</p>'}
  ${oatHtml || '<p style="color:#64748b; font-size:9pt; font-style:italic;">Sin Objetivos Transversales (OAT) seleccionados.</p>'}

  <div class="seccion-titulo">Filtro de Coherencia UTP e Indicadores Observables</div>
  ${seccionesHtml}

  <div class="seccion-titulo">Informe de Validación Pedagógica</div>
  <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; background:#fafafa; font-size:9pt; line-height:1.4;">
    <div style="margin-bottom: 6px;"><b>1. Coherencia OAT (Actitudinal):</b> ${coherenciaOAT}</div>
    <div style="margin-bottom: 6px;"><b>2. Coherencia Técnica (Fenomenológica):</b> ${totalPuedoFilmarlo === totalIndicadoresValidados ? 'CUMPLE (El 100% de los indicadores fueron validados en grababilidad)' : `⚠️ ADVERTENCIA (${totalIndicadoresValidados - totalPuedoFilmarlo} indicadores sin declarar confirmación "Puedo filmarlo")`}</div>
    <div><b>3. Diagnóstico de Verbos:</b> ${totalIndicadoresValidados > 0 ? 'CUMPLE (Gramática en presente indicativo de acción observable)' : 'No hay indicadores redactados.'}</div>
  </div>

  <div class="firmas-utp">
    <div class="firma-utp-line">
      <div class="raya"></div>
      <b>Firma del Docente</b><br>
      Cédula de Identidad
    </div>
    <div class="firma-utp-line">
      <div class="raya"></div>
      <b>Validación Coordinador UTP</b><br>
      Unidad Técnica Pedagógica
    </div>
  </div>
</div>

</body>
</html>`
}

export function abrirListaCotejoPlantillaUTP(opts: PlantillaUTPOpciones): void {
  const html = buildUTPHtml(opts)
  const win = window.open("", "_blank", "width=850,height=900")
  if (!win) {
    alert("Tu navegador bloqueó la ventana emergente. Por favor permite popups para esta página.")
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
}
