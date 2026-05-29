"use client"

import { FichaLecturaMusical, type FichaLecturaMusicaData } from "./ficha-lectura-musical"

/**
 * Ejemplo de uso con "Canción de Navidad" de 31 Minutos.
 * Reemplaza los imagenSrc con las rutas reales de las partituras.
 */
const fichaCancionNavidad: FichaLecturaMusicaData = {
  cancion: "Canción de Navidad",
  artista: "31 Minutos",
  secciones: [
    {
      nombre: "Intro",
      bloques: [
        { tipo: "partitura", imagenSrc: "/materiales/cancion-navidad/partitura-intro.png", alt: "Compases 1-4" },
        { tipo: "letra", lineas: [
          "Una bicicleta le pedí a Papa Noel",
          "Pero el me trajo una peineta y un mantel",
        ]},
      ],
    },
    {
      nombre: "Estrofa 1",
      bloques: [
        { tipo: "partitura", imagenSrc: "/materiales/cancion-navidad/partitura-estrofa.png", alt: "Compases 5-8" },
        { tipo: "letra", lineas: [
          "Como cada año le escribí a Santa Claus",
          "Una bella carta y la metí en un buzón",
        ]},
        { tipo: "partitura", imagenSrc: "/materiales/cancion-navidad/partitura-estrofa-2.png", alt: "Compases 9-12" },
        { tipo: "letra", lineas: [
          "Pero descubrí que esa carta no leyó",
          "Porque el me trajo lo primero que encontró",
        ]},
      ],
    },
  ],
}

export function EjemploCancionNavidad() {
  return (
    <FichaLecturaMusical
      ficha={fichaCancionNavidad}
      onVolver={() => window.history.back()}
    />
  )
}
