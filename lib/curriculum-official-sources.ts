import { normalizeKeyPart } from "./shared"

export interface FuenteOficialCurriculum {
  id: string
  label: string
  url: string
  tipo?: "programa" | "electivo" | "base" | "otro"
  principal?: boolean
  nota?: string
}

interface FuenteOficialSugerida extends FuenteOficialCurriculum {
  asignaturaKey: string
  nivelKeys: string[]
  docIds: string[]
}

const MUSICA_FUENTES_OFICIALES: FuenteOficialSugerida[] = [
  {
    id: "musica_1ro_basico_programa_2024",
    label: "Programa de Estudio Musica 1ro Basico (2024)",
    url: "https://www.curriculumnacional.cl/sites/default/files/adjuntos/recursos/2024-12/M%C3%BAsica%201.pdf",
    tipo: "programa",
    principal: true,
    asignaturaKey: "musica",
    nivelKeys: ["1ro_basico"],
    docIds: ["musica_1ro_basico"],
  },
  {
    id: "musica_2do_basico_programa",
    label: "Programa de Estudio Musica 2do Basico",
    url: "https://www.curriculumnacional.cl/sites/default/files/newtenberg/614/articles-20705_programa.pdf",
    tipo: "programa",
    principal: true,
    asignaturaKey: "musica",
    nivelKeys: ["2do_basico"],
    docIds: ["musica_2do_basico"],
  },
  {
    id: "musica_3ro_basico_programa_2024",
    label: "Programa de Estudio Musica 3ro Basico (2024)",
    url: "https://www.curriculumnacional.cl/sites/default/files/adjuntos/recursos/2024-12/M%C3%BAsica%203.pdf",
    tipo: "programa",
    principal: true,
    asignaturaKey: "musica",
    nivelKeys: ["3ro_basico"],
    docIds: ["musica_3ro_basico"],
  },
  {
    id: "musica_4to_basico_programa_2024",
    label: "Programa de Estudio Musica 4to Basico (2024)",
    url: "https://www.curriculumnacional.cl/sites/default/files/adjuntos/recursos/2024-12/M%C3%BAsica%204.pdf",
    tipo: "programa",
    principal: true,
    asignaturaKey: "musica",
    nivelKeys: ["4to_basico"],
    docIds: ["musica_4to_basico"],
  },
  {
    id: "musica_5to_basico_programa",
    label: "Programa de Estudio Musica 5to Basico",
    url: "https://www.curriculumnacional.cl/sites/default/files/newtenberg/614/articles-20710_programa.pdf",
    tipo: "programa",
    principal: true,
    asignaturaKey: "musica",
    nivelKeys: ["5to_basico"],
    docIds: ["musica_5to_basico"],
  },
  {
    id: "musica_6to_basico_programa_2024",
    label: "Programa de Estudio Musica 6to Basico (2024)",
    url: "https://www.curriculumnacional.cl/sites/default/files/adjuntos/recursos/2024-12/M%C3%BAsica%206.pdf",
    tipo: "programa",
    principal: true,
    asignaturaKey: "musica",
    nivelKeys: ["6to_basico"],
    docIds: ["musica_6to_basico"],
  },
  {
    id: "musica_7mo_basico_programa",
    label: "Programa de Estudio Musica 7mo Basico",
    url: "https://www.curriculumnacional.cl/sites/default/files/newtenberg/614/articles-20712_programa.pdf",
    tipo: "programa",
    principal: true,
    asignaturaKey: "musica",
    nivelKeys: ["7mo_basico"],
    docIds: ["musica_7mo_basico"],
  },
  {
    id: "musica_8vo_basico_programa_2024",
    label: "Programa de Estudio Musica 8vo Basico (2024)",
    url: "https://www.curriculumnacional.cl/sites/default/files/adjuntos/recursos/2024-12/M%C3%BAsica%208.pdf",
    tipo: "programa",
    principal: true,
    asignaturaKey: "musica",
    nivelKeys: ["8vo_basico"],
    docIds: ["musica_8vo_basico"],
  },
  {
    id: "musica_1ro_medio_programa",
    label: "Programa de Estudio Artes Musicales 1ro Medio",
    url: "https://www.curriculumnacional.cl/sites/default/files/newtenberg/614/articles-34426_programa.pdf",
    tipo: "programa",
    principal: true,
    asignaturaKey: "musica",
    nivelKeys: ["1ro_medio", "1_medio"],
    docIds: ["musica_1ro_medio", "musica_1medio"],
  },
  {
    id: "musica_2do_medio_programa",
    label: "Programa de Estudio Artes Musicales 2do Medio",
    url: "https://www.curriculumnacional.cl/sites/default/files/newtenberg/614/articles-34433_programa.pdf",
    tipo: "programa",
    principal: true,
    asignaturaKey: "musica",
    nivelKeys: ["2do_medio", "2_medio"],
    docIds: ["musica_2do_medio", "musica_2medio"],
  },
  {
    id: "musica_3ro_4to_medio_formacion_general",
    label: "Programa Formacion General Musica 3ro y 4to Medio",
    url: "https://www.curriculumnacional.cl/614/articles-140151_programa_feb_2021_final_s_disegno.pdf",
    tipo: "programa",
    principal: true,
    asignaturaKey: "musica",
    nivelKeys: ["3ro_medio", "4to_medio", "3_medio", "4_medio"],
    docIds: ["musica_3ro_medio", "musica_4to_medio", "musica_3medio", "musica_4medio"],
  },
  {
    id: "musica_3ro_4to_medio_creacion_composicion",
    label: "Electivo Creacion y Composicion Musical",
    url: "https://www.curriculumnacional.cl/614/articles-140150_programa_feb_2021_final_s_disegno.pdf",
    tipo: "electivo",
    asignaturaKey: "musica",
    nivelKeys: ["3ro_medio", "4to_medio", "3_medio", "4_medio"],
    docIds: ["musica_3ro_medio", "musica_4to_medio", "musica_3medio", "musica_4medio"],
  },
  {
    id: "musica_3ro_4to_medio_interpretacion",
    label: "Electivo Interpretacion Musical",
    url: "https://www.curriculumnacional.cl/614/articles-140158_programa_feb_2021_final_s_disegno.pdf",
    tipo: "electivo",
    asignaturaKey: "musica",
    nivelKeys: ["3ro_medio", "4to_medio", "3_medio", "4_medio"],
    docIds: ["musica_3ro_medio", "musica_4to_medio", "musica_3medio", "musica_4medio"],
  },
]

export function obtenerFuentesOficialesSugeridas(input: {
  id?: string | null
  asignatura?: string | null
  nivel?: string | null
}): FuenteOficialCurriculum[] {
  const docId = normalizeKeyPart(input.id || "")
  const asignaturaKey = normalizeKeyPart(input.asignatura || "")
  const nivelKey = normalizeKeyPart(input.nivel || "")

  return MUSICA_FUENTES_OFICIALES
    .filter((source) => {
      const matchesDoc = docId ? source.docIds.includes(docId) : false
      const matchesAsignatura = asignaturaKey ? source.asignaturaKey === asignaturaKey : docId.startsWith("musica")
      const matchesNivel = nivelKey ? source.nivelKeys.includes(nivelKey) : false
      return matchesDoc || (matchesAsignatura && matchesNivel)
    })
    .map(({ asignaturaKey: _asignaturaKey, nivelKeys: _nivelKeys, docIds: _docIds, ...source }) => source)
}

