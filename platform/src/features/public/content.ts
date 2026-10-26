/**
 * Propuestas que el gimnasio publica en su Instagram (@gym.evolutionfitnesspilar)
 * y que no son clases de la grilla. Revisado el 26/10/2026.
 */
export interface Extra {
  name: string
  text: string
  detail?: string
}

export const EXTRAS: Record<string, Extra[]> = {
  evolution: [
    {
      name: 'Entrenamiento híbrido',
      text: 'Para quienes buscan fuerza y resistencia, con las coaches Julieta Choc y Camila Ledesma.',
      detail: 'Lunes, miércoles y viernes 10 h · Martes y jueves 16 h',
    },
    { name: 'Calistenia', text: 'Fuerza con el peso del cuerpo: dominadas, paralelas y progresiones guiadas.' },
    { name: 'K-Pop', text: 'Clases de baile con coreografías de K-Pop.' },
    { name: 'Arteterapia', text: 'Un espacio creativo para bajar el ritmo y conectar.' },
    { name: 'Gong', text: 'Sesiones de baño de gong y terapias de sonido.' },
  ],
}
