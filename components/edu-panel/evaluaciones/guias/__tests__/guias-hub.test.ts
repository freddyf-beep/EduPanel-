import { describe, it, expect } from "vitest"

/**
 * Función auxiliar para normalizar texto (lowercase + sin tildes)
 * Debe coincidir con la implementación en guias-hub.tsx
 */
function normalizar(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

describe("GuiasHub - Filtros y búsqueda (Tarea 4.3)", () => {
  describe("Normalización de query", () => {
    it("debe convertir a minúsculas", () => {
      expect(normalizar("PRUEBA")).toBe("prueba")
    })

    it("debe remover acentos", () => {
      expect(normalizar("Evaluación")).toBe("evaluacion")
      expect(normalizar("Guía")).toBe("guia")
      expect(normalizar("Matemática")).toBe("matematica")
    })

    it("debe combinar lowercase y sin tildes", () => {
      expect(normalizar("EVALUACIÓN")).toBe("evaluacion")
      expect(normalizar("Guía de Aprendizaje")).toBe("guia de aprendizaje")
    })

    it("debe manejar caracteres especiales", () => {
      expect(normalizar("Café")).toBe("cafe")
      expect(normalizar("Niño")).toBe("nino")
    })
  })

  describe("Lógica de filtros en cascada", () => {
    // Mock de GuiaTemplate simplificado
    interface MockGuia {
      id: string
      nombre: string
      objetivo: string
      unidadNombre: string
      tipoGuia: string
      estado: string
      unidadId: string
      secciones: Array<{
        actividades: Array<{
          metadatosCurriculares?: {
            objetivos?: string[]
          }
        }>
      }>
    }

    const mockGuias: MockGuia[] = [
      {
        id: "1",
        nombre: "Guía de Aprendizaje",
        objetivo: "Comprender conceptos básicos",
        unidadNombre: "Unidad 1",
        tipoGuia: "aprendizaje",
        estado: "lista",
        unidadId: "u1",
        secciones: [
          {
            actividades: [
              {
                metadatosCurriculares: {
                  objetivos: ["OA 1", "OA 2"],
                },
              },
            ],
          },
        ],
      },
      {
        id: "2",
        nombre: "Guía de Refuerzo",
        objetivo: "Reforzar conocimientos",
        unidadNombre: "Unidad 1",
        tipoGuia: "refuerzo",
        estado: "borrador",
        unidadId: "u1",
        secciones: [
          {
            actividades: [
              {
                metadatosCurriculares: {
                  objetivos: ["OA 2"],
                },
              },
            ],
          },
        ],
      },
      {
        id: "3",
        nombre: "Evaluación Formativa",
        objetivo: "Evaluar progreso",
        unidadNombre: "Unidad 2",
        tipoGuia: "evaluacion_formativa",
        estado: "lista",
        unidadId: "u2",
        secciones: [
          {
            actividades: [
              {
                metadatosCurriculares: {
                  objetivos: ["OA 3"],
                },
              },
            ],
          },
        ],
      },
    ]

    function filtrarGuias(
      guias: MockGuia[],
      busqueda: string,
      filtroTipo: string,
      filtroEstado: string,
      filtroOA: string | null,
      unidadId: string
    ): MockGuia[] {
      let r = guias

      // 1. Filtrar por búsqueda normalizada
      if (busqueda.trim()) {
        const q = normalizar(busqueda.trim())
        r = r.filter(g =>
          normalizar(g.nombre || "").includes(q) ||
          normalizar(g.objetivo || "").includes(q) ||
          normalizar(g.unidadNombre || "").includes(q)
        )
      }

      // 2. Filtrar por tipo
      if (filtroTipo !== "todas") {
        r = r.filter(g => (g.tipoGuia || "aprendizaje") === filtroTipo)
      }

      // 3. Filtrar por estado
      if (filtroEstado !== "todas") {
        r = r.filter(g => (g.estado || "borrador") === filtroEstado)
      }

      // 4. Filtrar por OA vinculado
      if (filtroOA) {
        r = r.filter(g => {
          return g.secciones.some(s =>
            s.actividades.some(a =>
              a.metadatosCurriculares?.objetivos?.includes(filtroOA)
            )
          )
        })
      }

      // 5. Filtrar por unidadId
      if (unidadId) {
        r = r.filter(g => g.unidadId === unidadId)
      }

      return r
    }

    it("debe filtrar por búsqueda normalizada", () => {
      const resultado = filtrarGuias(mockGuias, "aprendizaje", "todas", "todas", null, "")
      expect(resultado).toHaveLength(1)
      expect(resultado[0].id).toBe("1")
    })

    it("debe filtrar por búsqueda con acentos", () => {
      const resultado = filtrarGuias(mockGuias, "Evaluación", "todas", "todas", null, "")
      expect(resultado).toHaveLength(1)
      expect(resultado[0].id).toBe("3")
    })

    it("debe filtrar por tipo", () => {
      const resultado = filtrarGuias(mockGuias, "", "refuerzo", "todas", null, "")
      expect(resultado).toHaveLength(1)
      expect(resultado[0].id).toBe("2")
    })

    it("debe filtrar por estado", () => {
      const resultado = filtrarGuias(mockGuias, "", "todas", "lista", null, "")
      expect(resultado).toHaveLength(2)
      expect(resultado.map(g => g.id)).toEqual(["1", "3"])
    })

    it("debe filtrar por OA vinculado", () => {
      const resultado = filtrarGuias(mockGuias, "", "todas", "todas", "OA 2", "")
      expect(resultado).toHaveLength(2)
      expect(resultado.map(g => g.id)).toEqual(["1", "2"])
    })

    it("debe filtrar por unidadId", () => {
      const resultado = filtrarGuias(mockGuias, "", "todas", "todas", null, "u1")
      expect(resultado).toHaveLength(2)
      expect(resultado.map(g => g.id)).toEqual(["1", "2"])
    })

    it("debe aplicar filtros en cascada correctamente", () => {
      // Buscar guías de tipo "aprendizaje" en estado "lista" de la unidad "u1"
      const resultado = filtrarGuias(mockGuias, "", "aprendizaje", "lista", null, "u1")
      expect(resultado).toHaveLength(1)
      expect(resultado[0].id).toBe("1")
    })

    it("debe aplicar todos los filtros juntos", () => {
      // Buscar guías con "refuerzo" en el nombre, tipo refuerzo, estado borrador, OA 2, unidad u1
      const resultado = filtrarGuias(mockGuias, "refuerzo", "refuerzo", "borrador", "OA 2", "u1")
      expect(resultado).toHaveLength(1)
      expect(resultado[0].id).toBe("2")
    })

    it("debe devolver lista vacía cuando no hay coincidencias", () => {
      const resultado = filtrarGuias(mockGuias, "", "ejercitacion", "todas", null, "")
      expect(resultado).toHaveLength(0)
    })

    it("debe devolver todas las guías cuando no hay filtros activos", () => {
      const resultado = filtrarGuias(mockGuias, "", "todas", "todas", null, "")
      expect(resultado).toHaveLength(3)
    })
  })
})
