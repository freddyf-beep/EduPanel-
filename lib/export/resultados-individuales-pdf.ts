import {
  calcularNota,
  calcularPuntajeEstudiante,
  type EvaluacionRubrica,
  type RubricaTemplate,
} from "@/lib/rubricas"
import type { InfoColegio } from "@/lib/perfil"

export interface ResultadosIndividualesOpciones {
  rubrica: RubricaTemplate
  evaluacion: EvaluacionRubrica
  colegio?: InfoColegio | null
  profesorNombre?: string
  fecha?: string
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

function exigenciaResultado(hasPie: boolean): number {
  return hasPie ? 0.5 : 0.6
}

function notaClass(nota: number, completado: boolean): string {
  if (!completado) return "nota-pendiente"
  return nota >= 4 ? "nota-ok" : "nota-baja"
}

function textoCorto(value: string, max = 72): string {
  const limpio = value.trim()
  if (limpio.length <= max) return limpio
  return `${limpio.slice(0, max - 1).trim()}...`
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

function buildResultadosIndividualesHtml(opts: ResultadosIndividualesOpciones): string {
  const { rubrica, evaluacion, colegio, profesorNombre: profesor, fecha } = opts
  const partes = (rubrica.partes || []).slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
  const totalCriterios = partes.reduce((acc, parte) => acc + (parte.criterios?.length || 0), 0)
  const colegioNombre = escapeHtml(colegio?.nombre || "")
  const profesorNombre = escapeHtml(profesor || "")
  const asignatura = escapeHtml(rubrica.asignatura || "")
  const curso = escapeHtml(rubrica.curso || "")
  const rubricaNombre = escapeHtml(rubrica.nombre || "Rubrica")
  const fechaTexto = escapeHtml(formatearFecha(fecha))
  const logoBase64 = colegio?.logoBase64 || ""

  // Collect unique OAs across all parts
  const todasLasOas = partes.flatMap(p => (p.oasVinculados || []).filter(Boolean))
  const oasUnicas = [...new Set(todasLasOas)]
  const oasTexto = oasUnicas.map(oa => escapeHtml(oa)).join(" · ")

  // Only use OAs explicitly selected in the rubric editor (green/yellow circle)
  // Exclude: teacher's own OAs (esPropio) and transversal objectives (tipo=oat)
  const oasSeleccionados = (rubrica.oas || []).filter(oa =>
    oa.seleccionado && !oa.esPropio && oa.tipo !== "oat"
  )
  // Build label + selected indicators for each selected OA
  const todosObjetivos: { label: string; indicadores: string[] }[] = oasSeleccionados.map(oa => {
    const label = `OA ${oa.numero ?? oa.id.replace(/^oa_?/i, "")}`
    const texto = `${label}: ${oa.descripcion || ""}`.trim()
    const inds = (oa.indicadores || [])
      .filter(ind => ind.seleccionado)
      .map(ind => escapeHtml(textoCorto(ind.texto || "", 80)))
      .filter(Boolean)
    return { label: escapeHtml(texto), indicadores: inds }
  }).filter(obj => obj.label)


  // Build a global numbered index of all criteria (1-based)
  const criteriosNumerados: { id: string; nombre: string; numero: number }[] = []
  let numGlobal = 0
  for (const parte of partes) {
    for (const criterio of parte.criterios) {
      numGlobal++
      criteriosNumerados.push({
        id: criterio.id,
        nombre: criterio.nombre || "Criterio sin nombre",
        numero: numGlobal,
      })
    }
  }

  const estudiantes = evaluacion.grupos.flatMap(grupo =>
    grupo.estudiantes.map(estudiante => ({
      grupoNombre: grupo.nombre || "Grupo",
      estudiante,
    }))
  )

  const cards = estudiantes.map(({ estudiante, grupoNombre }) => {
    const puntaje = calcularPuntajeEstudiante(estudiante.puntajes || {}, partes)
    const nota = calcularNota(puntaje, rubrica.puntajeMaximo, exigenciaResultado(!!estudiante.hasPie))
    const completado = totalCriterios > 0 && partes.reduce(
      (acc, parte) => acc + parte.criterios.filter(criterio => estudiante.puntajes?.[criterio.id] !== undefined).length,
      0
    ) === totalCriterios
    const porcentaje = rubrica.puntajeMaximo > 0 ? Math.round((puntaje / rubrica.puntajeMaximo) * 100) : 0

    // Build per-student criteria résumé with global number
    const criterioResumen = criteriosNumerados.map(item => ({
      numero: item.numero,
      nombre: item.nombre,
      valor: estudiante.puntajes?.[item.id],
    })).filter(item => item.valor !== undefined)

    const fortalezas = criterioResumen
      .filter(item => (item.valor ?? 0) >= 3)
      .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0))
      .slice(0, 3)

    const reforzarBase = criterioResumen
      .filter(item => (item.valor ?? 0) > 0 && (item.valor ?? 0) <= 2)
      .sort((a, b) => (a.valor ?? 0) - (b.valor ?? 0))
      .slice(0, 3)

    // Si no hay criterios descendidos (1-2 pts), mostrar los "casi logrado" (3 pts) como "a mejorar"
    const reforzar = reforzarBase.length > 0 ? reforzarBase : criterioResumen
      .filter(item => (item.valor ?? 0) === 3)
      .sort((a, b) => a.numero - b.numero)
      .slice(0, 3)

    const reforzarEsFallback = reforzarBase.length === 0 && reforzar.length > 0

    const partesHtml = partes.map(parte => {
      const criterios = parte.criterios || []
      const obtenido = criterios.reduce((acc, criterio) => {
        const pond = criterio.ponderacion ?? 1
        return acc + (estudiante.puntajes?.[criterio.id] ?? 0) * pond
      }, 0)
      const maximo = criterios.reduce((acc, criterio) => acc + 4 * (criterio.ponderacion ?? 1), 0)
      const width = maximo > 0 ? Math.round((obtenido / maximo) * 100) : 0

      return `
        <div class="parte-row">
          <span>${escapeHtml(textoCorto(parte.nombre || "Parte", 34))}</span>
          <div class="parte-bar"><i style="width:${width}%"></i></div>
          <b>${obtenido}/${maximo}</b>
        </div>
      `
    }).join("")

    const nivelLabel = (v: number) => v === 4 ? "L" : v === 3 ? "CL" : v === 2 ? "PL" : "PL*"

    const fortalezasHtml = fortalezas.length
      ? fortalezas.map(item => `<li><b class="crit-num">${item.numero}.</b> ${escapeHtml(textoCorto(item.nombre, 32))} <span class="crit-pts crit-pts-ok">${item.valor}pts (${nivelLabel(item.valor!)})</span></li>`).join("")
      : `<li class="crit-empty">Sin criterios destacados.</li>`

    const reforzarHtml = reforzar.length
      ? reforzar.map(item => `<li><b class="crit-num">${item.numero}.</b> ${escapeHtml(textoCorto(item.nombre, 32))} <span class="crit-pts crit-pts-bad">${item.valor}pts (${nivelLabel(item.valor!)})</span></li>`).join("")
      : `<li class="crit-empty">Sin criterios por reforzar.</li>`

    const reforzarTitulo = reforzarEsFallback ? "A mejorar (CL)" : "Por reforzar"

    return `
      <article class="student-card">
        <div class="student-top">
          ${logoBase64 ? `<img src="${logoBase64}" class="card-logo" alt="Logo">` : ""}
          <div class="student-title">
            <span>Resultado individual</span>
            <h2>${escapeHtml(estudiante.nombre || "(sin nombre)")}</h2>
            <p>${escapeHtml(grupoNombre)}${curso ? ` · ${curso}` : ""}</p>
          </div>
          <div class="nota-box ${notaClass(nota, completado)}">
            <span>Nota</span>
            <strong>${nota.toFixed(1)}</strong>
          </div>
        </div>

        <div class="rubrica-mini">
          <b>${rubricaNombre}</b>
          <span>${partes.length} partes · ${totalCriterios} criterios · ${rubrica.puntajeMaximo} pts</span>
          ${oasTexto ? `<span class="oa-strip">${oasTexto}</span>` : ""}
        </div>

        ${todosObjetivos.length ? `
        <div class="oa-list">
          ${todosObjetivos.map(obj => `
            <div class="oa-item">
              <p class="oa-desc">${obj.label}</p>
              ${obj.indicadores.length ? `<p class="oa-inds-inline">${obj.indicadores.slice(0, 2).join(" · ")}</p>` : ""}
            </div>
          `).join("")}
        </div>` : ""}

        <div class="score-grid">
          <div><span>Puntaje</span><b>${puntaje}/${rubrica.puntajeMaximo}</b></div>
          <div><span>Logro</span><b>${porcentaje}%</b></div>
        </div>

        <div class="partes-box">
          ${partesHtml || `<p class="empty-mini">Rubrica sin partes definidas.</p>`}
        </div>

        <div class="feedback-grid">
          <div>
            <h3>Mejor logrado</h3>
            <ul>${fortalezasHtml}</ul>
          </div>
          <div>
            <h3 class="${reforzarEsFallback ? 'h3-mejorar' : ''}">${reforzarTitulo}</h3>
            <ul>${reforzarHtml}</ul>
          </div>
        </div>

        ${estudiante.observaciones?.trim()
          ? `<p class="observacion"><b>Observacion:</b> ${escapeHtml(textoCorto(estudiante.observaciones, 118))}</p>`
          : ""}
      </article>
    `
  })

  const pageHeaderHtml = `
    <div class="page-top">
      ${logoBase64 ? `<img src="${logoBase64}" class="page-logo" alt="Logo">` : ""}
      <div class="page-top-center">
        <span class="page-top-colegio">${colegioNombre || ""}</span>
        ${profesorNombre ? `<span class="page-top-prof">Prof. ${profesorNombre}</span>` : ""}
      </div>
      <div class="page-top-right">
        <span class="page-top-rubrica">${rubricaNombre}</span>
        ${oasTexto ? `<span class="page-top-oas">${oasTexto}</span>` : ""}
      </div>
    </div>
  `

  const paginas = chunkArray(cards, 4).map((pageCards, index, all) => `
    <section class="print-page">
      ${pageHeaderHtml}
      <div class="cards-grid">
        ${pageCards.join("\n")}
        ${Array.from({ length: 4 - pageCards.length }, () => `<div class="student-card empty-card"></div>`).join("")}
      </div>
      <div class="page-footer">Resultados individuales · ${rubricaNombre} · Página ${index + 1} de ${all.length} · ${fechaTexto}</div>
    </section>
  `).join("\n")

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Resultados individuales - ${rubricaNombre}</title>
<style>
  @page { size: Letter portrait; margin: 8mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #f3f4f6;
    color: #111827;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }
  .toolbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    padding: 10px 12px;
    background: #fff;
    border-bottom: 1px solid #d1d5db;
  }
  .toolbar button {
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: #fff;
    cursor: pointer;
    font-size: 11pt;
    font-weight: 700;
    padding: 7px 14px;
  }
  .toolbar button.primary {
    background: #ec4899;
    border-color: #ec4899;
    color: #fff;
  }
  .toolbar small {
    color: #64748b;
    margin-left: auto;
  }
  .print-page {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 8.5in;
    height: 11in;
    max-height: 11in;
    overflow: hidden;
    margin: 0 auto 14px auto;
    padding: 6mm 8mm 8mm 8mm;
    background: #fff;
    break-after: page;
    page-break-after: always;
    gap: 3mm;
  }
  .print-page:last-child {
    break-after: auto;
    page-break-after: auto;
  }
  .page-top {
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 2px solid #ec4899;
    padding-bottom: 4px;
    flex-shrink: 0;
  }
  .page-logo {
    height: 40px;
    width: auto;
    max-width: 80px;
    object-fit: contain;
    flex-shrink: 0;
  }
  .page-top-center {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .page-top-colegio {
    font-size: 9pt;
    font-weight: 800;
    color: #111827;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .page-top-prof {
    font-size: 7.5pt;
    color: #64748b;
  }
  .page-top-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    min-width: 0;
    max-width: 50%;
  }
  .page-top-rubrica {
    font-size: 8pt;
    font-weight: 700;
    color: #111827;
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .page-top-oas {
    font-size: 6.8pt;
    color: #0c4a6e;
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .cards-grid {
    position: relative;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    grid-template-rows: repeat(2, 1fr);
    gap: 4mm;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  /* Guías de corte horizontal */
  .cards-grid::before {
    content: "";
    position: absolute;
    top: calc(50% - 0.5px);
    left: -8mm;
    right: -8mm;
    height: 0;
    border-top: 1px dashed #cbd5e1;
    z-index: 0;
    pointer-events: none;
  }
  /* Guías de corte vertical */
  .cards-grid::after {
    content: "";
    position: absolute;
    left: calc(50% - 0.5px);
    top: 0;
    bottom: 0;
    width: 0;
    border-left: 1px dashed #cbd5e1;
    z-index: 0;
    pointer-events: none;
  }
  .student-card {
    position: relative;
    min-height: 0;
    overflow: hidden;
    border: 1px solid #111827;
    border-radius: 8px;
    padding: 10px;
    background: #fff;
  }
  .empty-card { border: 1px dashed #e5e7eb; }
  .student-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 6px;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 5px;
    margin-bottom: 6px;
  }
  .card-logo {
    height: 36px;
    width: auto;
    max-width: 44px;
    object-fit: contain;
    flex-shrink: 0;
    margin-top: 2px;
  }
  .student-title { min-width: 0; }
  .student-title span {
    display: block;
    color: #ec4899;
    font-size: 8pt;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .student-title h2 {
    margin: 1px 0 0 0;
    font-size: 13.5pt;
    line-height: 1.05;
    font-weight: 800;
  }
  .student-title p {
    margin: 2px 0 0 0;
    color: #64748b;
    font-size: 7.8pt;
    line-height: 1.15;
  }
  .nota-box {
    flex: 0 0 56px;
    align-self: stretch;
    display: grid;
    place-items: center;
    border-radius: 7px;
    color: #fff;
    text-align: center;
  }
  .nota-box span {
    display: block;
    font-size: 7pt;
    font-weight: 700;
    line-height: 1;
    margin-top: 2px;
    text-transform: uppercase;
  }
  .nota-box strong {
    display: block;
    font-size: 18pt;
    line-height: 1;
    margin-bottom: 2px;
  }
  .nota-ok { background: #16a34a !important; }
  .nota-baja { background: #dc2626 !important; }
  .nota-pendiente { background: #f59e0b !important; }
  .rubrica-mini {
    border-radius: 5px;
    background: #f8fafc;
    border: 1px solid #e5e7eb;
    padding: 3px 6px;
    margin-bottom: 4px;
  }
  .rubrica-mini b {
    display: block;
    font-size: 8.8pt;
    line-height: 1.15;
  }
  .oa-strip {
    display: block;
    color: #0c4a6e;
    font-size: 7pt;
    margin-top: 2px;
    font-weight: 600;
  }
  .rubrica-mini span {
    display: block;
    color: #64748b;
    font-size: 7.4pt;
    margin-top: 1px;
  }
  .oa-list {
    margin-bottom: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .oa-item {
    background: #f0f9ff;
    border-left: 2px solid #38bdf8;
    border-radius: 0 3px 3px 0;
    padding: 1px 4px;
  }
  .oa-desc {
    margin: 0;
    font-size: 6.8pt;
    color: #0c4a6e;
    line-height: 1.2;
    font-weight: 600;
  }
  .oa-inds-inline {
    margin: 0;
    font-size: 6.2pt;
    color: #1e40af;
    line-height: 1.15;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .h3-mejorar { color: #d97706 !important; }

  .score-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3px;
    margin-bottom: 4px;
  }
  .score-grid div {
    border: 1px solid #e5e7eb;
    border-radius: 5px;
    padding: 2px 4px;
    text-align: center;
  }
  .score-grid span {
    display: block;
    color: #64748b;
    font-size: 7pt;
    font-weight: 700;
    text-transform: uppercase;
  }
  .score-grid b {
    display: block;
    font-size: 9pt;
    line-height: 1.1;
  }
  .partes-box {
    display: grid;
    gap: 2px;
    margin-bottom: 4px;
  }
  .parte-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 58px 34px;
    align-items: center;
    gap: 5px;
    font-size: 7.5pt;
  }
  .parte-row span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .parte-row b {
    text-align: right;
    font-size: 7.4pt;
  }
  .parte-bar {
    height: 6px;
    overflow: hidden;
    border-radius: 999px;
    background: #e5e7eb !important;
  }
  .parte-bar i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: #ec4899 !important;
  }
  .feedback-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 5px;
    margin-top: 2px;
  }
  .feedback-grid div {
    min-width: 0;
    border-top: 1px solid #e5e7eb;
    padding-top: 4px;
  }
  .feedback-grid h3 {
    margin: 0 0 2px 0;
    color: #334155;
    font-size: 7.8pt;
    font-weight: 800;
    text-transform: uppercase;
  }
  .feedback-grid ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .feedback-grid li {
    color: #111827;
    font-size: 7.2pt;
    line-height: 1.15;
    margin-bottom: 1px;
    display: flex;
    align-items: baseline;
    gap: 3px;
    flex-wrap: wrap;
  }
  .feedback-grid li .crit-num {
    color: #ec4899;
    font-weight: 800;
    font-size: 8pt;
    flex-shrink: 0;
  }
  .crit-pts {
    font-size: 6.5pt;
    font-weight: 700;
    padding: 0px 3px;
    border-radius: 3px;
    flex-shrink: 0;
    margin-left: auto;
  }
  .crit-pts-ok { background: #dcfce7; color: #166534; }
  .crit-pts-bad { background: #fee2e2; color: #991b1b; }
  .crit-empty { color: #94a3b8 !important; font-style: italic; }
  .observacion {
    position: absolute;
    left: 8px;
    right: 8px;
    bottom: 6px;
    margin: 0;
    border-top: 1px solid #e5e7eb;
    padding-top: 3px;
    color: #334155;
    font-size: 7.1pt;
    line-height: 1.15;
  }
  .empty-mini {
    color: #94a3b8;
    font-size: 7.5pt;
    margin: 0;
  }
  .page-footer {
    position: absolute;
    right: 8mm;
    bottom: 2.5mm;
    color: #94a3b8;
    font-size: 6.5pt;
  }
  .empty-state {
    width: 8.5in;
    margin: 24px auto;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background: #fff;
    padding: 28px;
    text-align: center;
    color: #64748b;
  }
  @media print {
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    body { background: #fff; margin: 0; padding: 0; }
    .toolbar { display: none !important; }
    .print-page {
      width: auto;
      height: calc(11in - 16mm);
      min-height: 0;
      max-height: calc(11in - 16mm);
      margin: 0;
      padding: 4mm 6mm 6mm 6mm;
      box-shadow: none;
      overflow: hidden;
    }
    .cards-grid {
      grid-template-rows: repeat(2, 1fr);
    }
    .student-card {
      overflow: hidden;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .empty-card { border-color: transparent !important; }
    .nota-ok { background: #16a34a !important; color: #fff !important; }
    .nota-baja { background: #dc2626 !important; color: #fff !important; }
    .nota-pendiente { background: #f59e0b !important; color: #fff !important; }
    .parte-bar { background: #e5e7eb !important; }
    .parte-bar i { background: #ec4899 !important; }
    .rubrica-mini { background: #f8fafc !important; }
    .score-grid div { border-color: #d1d5db !important; }
    .student-card { border-color: #111827 !important; }
    .page-footer { bottom: 1mm; right: 0; }
    .empty-state { display: none; }
  }
</style>
</head>
<body>

<div class="toolbar">
  <button class="primary" onclick="window.print()">Imprimir / Guardar PDF</button>
  <button onclick="window.close()">Cerrar</button>
  <small>Carta vertical: 4 resultados por hoja. ${colegioNombre ? `${colegioNombre} · ` : ""}${profesorNombre ? `Prof. ${profesorNombre} · ` : ""}${asignatura}${curso ? ` · ${curso}` : ""} · ${fechaTexto}</small>
</div>

${estudiantes.length ? paginas : `<div class="empty-state">No hay estudiantes evaluados para generar resultados individuales.</div>`}

</body>
</html>`
}

export function abrirResultadosIndividualesImprimible(opts: ResultadosIndividualesOpciones): void {
  const html = buildResultadosIndividualesHtml(opts)
  const win = window.open("", "_blank", "width=1100,height=800")
  if (!win) {
    alert("Tu navegador bloqueo la ventana emergente. Por favor permite popups para esta pagina.")
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
}
