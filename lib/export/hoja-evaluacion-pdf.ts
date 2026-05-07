// ═══════════════════════════════════════════════════════════════════════════
// Hoja de evaluación imprimible (PDF) — para uso en clase
//
// Genera una grilla con alumnos ordenados por grupo y columnas por cada parte
// de la rúbrica, con celdas vacías para que el profesor marque a mano con sus
// propias claves (ej: "C" para canto, "R" para ritmo, etc.) durante la
// presentación del grupo.
//
// Estrategia: abre nueva ventana con HTML print-friendly y dispara
// window.print() — el navegador permite "Guardar como PDF" o imprimir directo.
// Sin dependencias nuevas.
// ═══════════════════════════════════════════════════════════════════════════

import type { EvaluacionRubrica, RubricaTemplate } from "@/lib/rubricas"
import type { InfoColegio } from "@/lib/perfil"

export interface HojaEvaluacionOpciones {
  rubrica: RubricaTemplate
  evaluacion: EvaluacionRubrica
  colegio?: InfoColegio | null
  profesorNombre?: string
  fecha?: string
  /** Claves de marcado para mostrar como leyenda al pie. Ej: { C: "Canto", R: "Ritmo" } */
  clavesMarcado?: Record<string, string>
}

function escapeHtml(value: string): string {
  return value
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

function buildHtml(opts: HojaEvaluacionOpciones): string {
  const { rubrica, evaluacion, colegio, profesorNombre: profesor, fecha, clavesMarcado } = opts

  const partes = (rubrica.partes || []).slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
  const colegioNombre = escapeHtml(colegio?.nombre || "")
  const profesorNombre = escapeHtml(profesor || "")
  const asignatura = escapeHtml(rubrica.asignatura || "")
  const curso = escapeHtml(rubrica.curso || "")
  const rubricaNombre = escapeHtml(rubrica.nombre || "Evaluación")
  const fechaTexto = escapeHtml(formatearFecha(fecha))

  // Tabla — filas
  const filas: string[] = []
  let contadorAlumnos = 0
  for (const grupo of evaluacion.grupos) {
    if (!grupo.estudiantes.length) continue

    // Fila separadora del grupo
    filas.push(`
      <tr class="grupo-row">
        <td colspan="${partes.length + 3}" class="grupo-cell">
          <span class="grupo-tag">${escapeHtml(grupo.nombre || "Grupo")}</span>
          <span class="grupo-count">${grupo.estudiantes.length} alumno${grupo.estudiantes.length === 1 ? "" : "s"}</span>
        </td>
      </tr>
    `)

    // Filas de alumnos
    for (const est of grupo.estudiantes) {
      contadorAlumnos += 1
      const nombre = escapeHtml(est.nombre || "(sin nombre)")
      const pieBadge = est.hasPie ? `<span class="pie-badge">PIE</span>` : ""

      const celdasPartes = partes
        .map(() => `<td class="celda-marcado">&nbsp;</td>`)
        .join("")

      filas.push(`
        <tr>
          <td class="num">${contadorAlumnos}</td>
          <td class="nombre">${nombre} ${pieBadge}</td>
          ${celdasPartes}
          <td class="celda-notas">&nbsp;</td>
        </tr>
      `)
    }
  }

  if (filas.length === 0) {
    filas.push(`
      <tr><td colspan="${partes.length + 3}" class="empty-msg">
        No hay alumnos asignados a grupos. Agrégalos en la vista de evaluación.
      </td></tr>
    `)
  }

  // Cabecera de columnas con las partes
  const headerPartes = partes.map(p => {
    const oas = (p.oasVinculados || []).filter(Boolean)
    const oasText = oas.length ? `<small>${escapeHtml(oas.join(" · "))}</small>` : ""
    return `<th class="parte-th">${escapeHtml(p.nombre || "Parte")}${oasText}</th>`
  }).join("")

  // Leyenda con claves
  const clavesEntries = clavesMarcado ? Object.entries(clavesMarcado).filter(([k, v]) => k && v) : []
  const leyendaHtml = clavesEntries.length
    ? `
      <div class="leyenda">
        <strong>Claves de marcado:</strong>
        ${clavesEntries.map(([k, v]) => `<span class="clave-item"><b>${escapeHtml(k)}</b> = ${escapeHtml(v)}</span>`).join("")}
      </div>
    `
    : `
      <div class="leyenda">
        <strong>Claves de marcado:</strong>
        <span class="clave-item">Define tu sistema (ej. <b>C</b>=Canto, <b>R</b>=Ritmo, <b>A</b>=Afinación, <b>E</b>=Expresión)</span>
      </div>
    `

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Hoja de evaluación — ${rubricaNombre}</title>
<style>
  @page {
    size: A4 landscape;
    margin: 12mm 10mm 14mm 10mm;
  }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    font-family: 'Calibri', 'Segoe UI', sans-serif;
    color: #111;
    background: #fff;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }

  body { padding: 14mm 10mm; }

  @media print {
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    body { padding: 0; }
    .toolbar { display: none !important; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    tr.grupo-row td.grupo-cell { background: #111 !important; color: #fff !important; }
    thead th { background: #ececec !important; }
    .pie-badge { background: #f59e0b !important; color: #fff !important; }
    .oa-box { background: #f0f9ff !important; border-color: #bae6fd !important; }
    .print-footer { display: block; }
  }

  .toolbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    gap: 10px;
    align-items: center;
    background: #f5f5f5;
    border-bottom: 1px solid #ccc;
    padding: 10px 14px;
    font-size: 13px;
  }
  .toolbar button {
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 600;
    border: 1px solid #888;
    border-radius: 6px;
    background: #fff;
    cursor: pointer;
  }
  .toolbar button.primary {
    background: #ec4899;
    color: #fff;
    border-color: #ec4899;
  }
  .toolbar small { color: #666; }

  header.hoja-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 2px solid #111;
    padding-bottom: 8px;
    margin-bottom: 12px;
  }
  header .col-izq h1 {
    margin: 0 0 2px 0;
    font-size: 18pt;
    font-weight: 800;
    color: #111;
    letter-spacing: -0.3px;
  }
  header .col-izq .meta {
    font-size: 10pt;
    color: #444;
    line-height: 1.4;
  }
  header .col-der {
    text-align: right;
    font-size: 9.5pt;
    color: #444;
    line-height: 1.4;
  }
  header .col-der .colegio { font-weight: 700; color: #111; font-size: 11pt; }

  .info-bar {
    display: flex;
    gap: 24px;
    font-size: 9.5pt;
    margin-bottom: 10px;
    color: #333;
  }
  .info-bar span b { color: #111; }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10pt;
    table-layout: fixed;
  }
  thead {
    display: table-header-group;
  }
  tr {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  th, td {
    border: 1px solid #444;
    padding: 4px 6px;
    text-align: left;
    vertical-align: top;
  }
  thead th {
    background: #ececec;
    font-weight: 700;
    text-align: center;
    font-size: 10pt;
  }
  thead th small {
    display: block;
    font-weight: 400;
    font-size: 8pt;
    color: #555;
    margin-top: 1px;
  }
  th.num-th { width: 30px; text-align: center; }
  th.nombre-th { width: 200px; text-align: left; }
  th.parte-th { /* width auto */ }
  th.notas-th { width: 130px; text-align: left; }

  td.num { text-align: center; font-weight: 600; color: #555; }
  td.nombre { font-weight: 500; }
  td.celda-marcado { height: 38px; }
  td.celda-notas { height: 38px; font-size: 9pt; color: #666; }

  .oa-box {
    margin-bottom: 10px;
    padding: 6px 10px;
    background: #f0f9ff;
    border: 1px solid #bae6fd;
    border-radius: 5px;
    font-size: 9pt;
    color: #0c4a6e;
    line-height: 1.45;
  }
  .oa-box b { color: #075985; }
  .logo-colegio {
    height: 48px;
    width: auto;
    max-width: 120px;
    object-fit: contain;
    margin-bottom: 4px;
  }

  tr.grupo-row td.grupo-cell {
    background: #111;
    color: #fff;
    padding: 4px 8px;
    font-weight: 700;
    font-size: 10pt;
    letter-spacing: 0.3px;
  }
  .grupo-tag { text-transform: uppercase; }
  .grupo-count {
    float: right;
    font-weight: 400;
    opacity: 0.85;
    font-size: 9pt;
  }
  .pie-badge {
    display: inline-block;
    background: #f59e0b;
    color: #fff;
    font-size: 7.5pt;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    margin-left: 4px;
    vertical-align: middle;
  }
  .empty-msg {
    text-align: center;
    color: #888;
    font-style: italic;
    padding: 20px;
  }

  .leyenda {
    margin-top: 14px;
    padding: 8px 10px;
    border: 1px dashed #888;
    border-radius: 4px;
    font-size: 9.5pt;
    color: #333;
    line-height: 1.5;
  }
  .leyenda .clave-item {
    display: inline-block;
    margin-right: 14px;
  }
  .leyenda b { color: #111; }

  .firma-row {
    display: flex;
    justify-content: space-between;
    margin-top: 28px;
    font-size: 9.5pt;
    color: #555;
  }
  .firma-row .firma {
    width: 38%;
    text-align: center;
    border-top: 1px solid #444;
    padding-top: 4px;
  }
</style>
</head>
<body>

<div class="toolbar">
  <button class="primary" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
  <button onclick="window.close()">Cerrar</button>
  <small>Sugerencia: en el diálogo de impresión, elige "Guardar como PDF" si solo quieres el archivo.</small>
</div>

<header class="hoja-header">
  <div class="col-izq">
    <h1>${rubricaNombre}</h1>
    <div class="meta">
      Hoja de evaluación en clase · ${asignatura}${curso ? ` · ${curso}` : ""}
    </div>
  </div>
  <div class="col-der">
    ${colegio?.logoBase64 ? `<img src="${colegio.logoBase64}" class="logo-colegio" alt="Logo">` : ""}
    ${colegioNombre ? `<div class="colegio">${colegioNombre}</div>` : ""}
    ${profesorNombre ? `<div>Prof. ${profesorNombre}</div>` : ""}
    <div>Fecha: ${fechaTexto}</div>
  </div>
</header>

<div class="info-bar">
  <span><b>Total alumnos:</b> ${contadorAlumnos}</span>
  <span><b>Grupos:</b> ${evaluacion.grupos.filter(g => g.estudiantes.length).length}</span>
  <span><b>Partes evaluadas:</b> ${partes.length}</span>
  <span><b>Puntaje máximo:</b> ${rubrica.puntajeMaximo} pts</span>
</div>

${(() => {
  const todasLasOas = partes.flatMap(p => (p.oasVinculados || []).filter(Boolean))
  const oasUnicas = [...new Set(todasLasOas)]
  if (!oasUnicas.length) return ""
  return `<div class="oa-box"><b>Objetivos de Aprendizaje:</b> ${oasUnicas.map(oa => escapeHtml(oa)).join(" · ")}</div>`
})()}

<table>
  <thead>
    <tr>
      <th class="num-th">#</th>
      <th class="nombre-th">Alumno</th>
      ${headerPartes}
      <th class="notas-th">Observaciones</th>
    </tr>
  </thead>
  <tbody>
    ${filas.join("\n")}
  </tbody>
</table>

${leyendaHtml}

<div class="firma-row">
  <div class="firma">Firma del profesor</div>
  <div class="firma">Fecha de revisión</div>
</div>

<script>
  // Auto-disparar print después de cargar (con un pequeño delay para que el render termine).
  // Comentado por defecto — el usuario decide cuándo imprimir.
  // window.addEventListener('load', () => setTimeout(() => window.print(), 300))
</script>

</body>
</html>`
}

/**
 * Abre una nueva ventana con la hoja de evaluación imprimible.
 * El usuario puede revisar y luego imprimir / guardar como PDF.
 */
export function abrirHojaEvaluacionImprimible(opts: HojaEvaluacionOpciones): void {
  const html = buildHtml(opts)
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

// ═══════════════════════════════════════════════════════════════════════════
// Plantilla de rúbrica imprimible — vista de referencia, sin alumnos
//
// Genera una vista detallada de la rúbrica con todos sus criterios y los
// 4 niveles de desempeño con sus descriptores. Útil para:
//   • Compartir con apoderados/estudiantes antes de la evaluación
//   • Imprimir como guía para sí mismo durante la clase
//   • Verificar que la rúbrica esté bien armada (revisión rápida)
// ═══════════════════════════════════════════════════════════════════════════

export interface RubricaPlantillaOpciones {
  rubrica: RubricaTemplate
  colegio?: InfoColegio | null
  profesorNombre?: string
}

function buildRubricaPlantillaHtml(opts: RubricaPlantillaOpciones): string {
  const { rubrica, colegio, profesorNombre: profesor } = opts

  const partes = (rubrica.partes || []).slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
  const colegioNombre = escapeHtml(colegio?.nombre || "")
  const profesorNombre = escapeHtml(profesor || "")
  const asignatura = escapeHtml(rubrica.asignatura || "")
  const curso = escapeHtml(rubrica.curso || "")
  const rubricaNombre = escapeHtml(rubrica.nombre || "Rúbrica")
  const usaPond = !!rubrica.usaPonderaciones

  const partesHtml = partes.map(parte => {
    const criterios = (parte.criterios || []).slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    const oas = (parte.oasVinculados || []).filter(Boolean)
    const oasText = oas.length ? `<span class="oas">${escapeHtml(oas.join(" · "))}</span>` : ""

    const filas = criterios.map(c => {
      const pondTxt = usaPond && c.ponderacion && c.ponderacion !== 1
        ? `<small class="pond">×${c.ponderacion}</small>` : ""
      return `
        <tr>
          <td class="crit-nombre">${escapeHtml(c.nombre || "(sin nombre)")} ${pondTxt}</td>
          <td class="nivel-desc nivel-4">${escapeHtml(c.niveles?.logrado?.descripcion || "—")}</td>
          <td class="nivel-desc nivel-3">${escapeHtml(c.niveles?.casiLogrado?.descripcion || "—")}</td>
          <td class="nivel-desc nivel-2">${escapeHtml(c.niveles?.parcialmenteLogrado?.descripcion || "—")}</td>
          <td class="nivel-desc nivel-1">${escapeHtml(c.niveles?.porLograr?.descripcion || "—")}</td>
        </tr>
      `
    }).join("")

    return `
      <section class="parte">
        <h2 class="parte-titulo">${escapeHtml(parte.nombre || "Parte")} ${oasText}</h2>
        <table class="rubrica-tabla">
          <thead>
            <tr>
              <th class="th-criterio">Criterio</th>
              <th class="th-nivel nivel-4">Logrado <small>(4 pts)</small></th>
              <th class="th-nivel nivel-3">Casi Logrado <small>(3 pts)</small></th>
              <th class="th-nivel nivel-2">Parcialmente Logrado <small>(2 pts)</small></th>
              <th class="th-nivel nivel-1">Por Lograr <small>(1 pt)</small></th>
            </tr>
          </thead>
          <tbody>${filas || `<tr><td colspan="5" class="vacio">Sin criterios</td></tr>`}</tbody>
        </table>
      </section>
    `
  }).join("\n")

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Rúbrica — ${rubricaNombre}</title>
<style>
  @page { size: A4 landscape; margin: 12mm 10mm 14mm 10mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 10.5pt;
    color: #111;
    margin: 0;
    padding: 16px 18px;
    background: #f6f7f9;
  }
  .toolbar {
    display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
    padding: 10px 12px; margin-bottom: 14px;
    background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
  }
  .toolbar button {
    padding: 7px 14px; border-radius: 8px; border: 1px solid #d1d5db;
    background: #fff; cursor: pointer; font-size: 11pt; font-weight: 600;
  }
  .toolbar button.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
  .toolbar small { color: #6b7280; margin-left: auto; }

  .hoja-header {
    display: flex; justify-content: space-between; align-items: flex-end;
    border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 14px;
  }
  .hoja-header h1 { margin: 0; font-size: 18pt; font-weight: 800; }
  .hoja-header .meta { font-size: 10pt; color: #555; margin-top: 2px; }
  .hoja-header .col-der { text-align: right; font-size: 9.5pt; color: #555; }
  .colegio { font-weight: 700; color: #111; font-size: 11pt; margin-bottom: 2px; }

  .info-bar {
    display: flex; gap: 14px; flex-wrap: wrap;
    padding: 8px 10px; margin-bottom: 14px;
    background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
    font-size: 9.5pt;
  }
  .info-bar b { color: #111; }

  .parte {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 12px 14px;
    margin-bottom: 14px;
    page-break-inside: avoid;
  }
  .parte-titulo {
    margin: 0 0 10px 0;
    font-size: 12pt;
    font-weight: 700;
    color: #111;
    display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
  }
  .parte-titulo .oas {
    font-size: 9.5pt; font-weight: 500; color: #6b7280;
    background: #f3f4f6; padding: 2px 8px; border-radius: 4px;
  }

  table.rubrica-tabla {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .rubrica-tabla th, .rubrica-tabla td {
    border: 1px solid #d1d5db;
    padding: 7px 9px;
    vertical-align: top;
    text-align: left;
    font-size: 9.5pt;
    line-height: 1.35;
  }
  .rubrica-tabla thead th {
    background: #f9fafb;
    font-weight: 700;
    font-size: 9.5pt;
  }
  .rubrica-tabla thead th small { display: block; font-weight: 500; color: #6b7280; font-size: 8.5pt; margin-top: 1px; }
  .th-criterio { width: 18%; background: #eff6ff !important; }
  .th-nivel { width: 20.5%; }
  .crit-nombre {
    background: #f9fafb; font-weight: 600;
  }
  .crit-nombre .pond {
    margin-left: 6px; padding: 1px 5px;
    background: #fef3c7; color: #92400e;
    border-radius: 3px; font-size: 8.5pt;
  }
  .nivel-4 { background: #f0fdf4 !important; }
  .nivel-3 { background: #f0f9ff !important; }
  .nivel-2 { background: #fefce8 !important; }
  .nivel-1 { background: #fef2f2 !important; }
  .vacio { text-align: center; color: #9ca3af; font-style: italic; padding: 14px !important; }

  @media print {
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    body { background: #fff; padding: 0; }
    .toolbar { display: none; }
    .parte { border-color: #999; }
    .nivel-4 { background: #f0fdf4 !important; }
    .nivel-3 { background: #f0f9ff !important; }
    .nivel-2 { background: #fefce8 !important; }
    .nivel-1 { background: #fef2f2 !important; }
    .th-criterio { background: #eff6ff !important; }
    .crit-nombre { background: #f9fafb !important; }
  }
</style>
</head>
<body>

<div class="toolbar">
  <button class="primary" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
  <button onclick="window.close()">Cerrar</button>
  <small>Sugerencia: en el diálogo de impresión, elige "Guardar como PDF" si solo quieres el archivo.</small>
</div>

<header class="hoja-header">
  <div class="col-izq">
    <h1>${rubricaNombre}</h1>
    <div class="meta">
      Plantilla de rúbrica · ${asignatura}${curso ? ` · ${curso}` : ""}
    </div>
  </div>
  <div class="col-der">
    ${colegio?.logoBase64 ? `<img src="${colegio.logoBase64}" style="height:48px;width:auto;max-width:120px;object-fit:contain;margin-bottom:4px;display:block;margin-left:auto" alt="Logo">` : ""}
    ${colegioNombre ? `<div class="colegio">${colegioNombre}</div>` : ""}
    ${profesorNombre ? `<div>Prof. ${profesorNombre}</div>` : ""}
  </div>
</header>

<div class="info-bar">
  <span><b>Partes:</b> ${partes.length}</span>
  <span><b>Criterios totales:</b> ${partes.reduce((a, p) => a + (p.criterios?.length || 0), 0)}</span>
  <span><b>Puntaje máximo:</b> ${rubrica.puntajeMaximo} pts</span>
  ${usaPond ? `<span><b>Usa ponderaciones:</b> sí</span>` : ""}
</div>

${partesHtml || `<div class="parte"><p style="color:#9ca3af;text-align:center;">Esta rúbrica no tiene partes definidas.</p></div>`}

</body>
</html>`
}

/**
 * Abre una nueva ventana con la plantilla de la rúbrica imprimible.
 * Muestra todos los criterios y descriptores de los 4 niveles.
 * No incluye alumnos ni puntajes — es una vista de referencia de la rúbrica.
 */
export function abrirRubricaPlantillaImprimible(opts: RubricaPlantillaOpciones): void {
  const html = buildRubricaPlantillaHtml(opts)
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
