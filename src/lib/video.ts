/** Devuelve cómo mostrar un video: embed de YouTube/Vimeo o archivo directo. */
export function videoSource(url: string | null | undefined):
  | { kind: 'youtube' | 'vimeo'; embed: string; thumb: string | null }
  | { kind: 'file'; src: string }
  | null {
  if (!url) return null
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/)
  if (yt) {
    return {
      kind: 'youtube',
      embed: `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0&modestbranding=1`,
      thumb: `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg`,
    }
  }
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vm) return { kind: 'vimeo', embed: `https://player.vimeo.com/video/${vm[1]}`, thumb: null }
  return { kind: 'file', src: url }
}
