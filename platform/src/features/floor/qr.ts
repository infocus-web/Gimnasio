import 'server-only'
import QRCode from 'qrcode'
import { siteUrl } from '@/lib/site-url'

/** Link que va impreso en el cartel de cada máquina: https://evolutiongym.fitness/<gym>/maquina/<code> */
export async function machineUrl(slug: string, code: string) {
  return `${await siteUrl()}/${slug}/maquina/${code}`
}

/** QR como SVG (nítido al imprimir en cualquier tamaño). */
export function qrSvg(text: string) {
  return QRCode.toString(text, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
}
