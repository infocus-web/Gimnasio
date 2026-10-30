/**
 * Colores de las tarjetas de métricas (fondo pastel + texto negro, estilo W3Admin).
 * Va en un archivo aparte (sin 'use client') para poder usarlo desde páginas del servidor.
 */
export const STAT_TONES = {
  brand: 'bg-brand',
  salmon: 'bg-pastel-salmon',
  lavender: 'bg-pastel-lavender',
  mint: 'bg-pastel-mint',
  lemon: 'bg-pastel-lemon',
} as const

export type StatTone = keyof typeof STAT_TONES
