/**
 * Puente HTTP → HTTPS para lectores ZKTeco que solo hablan HTTP.
 * (Vercel solo acepta HTTPS.) Se publica gratis como Cloudflare Worker.
 *
 * Variables del Worker (Settings → Variables):
 *   TARGET        = https://evolution-fitness-gym-liart.vercel.app   (texto)
 *   RELAY_SECRET  = una clave larga inventada por vos                 (secreto)
 * En Vercel, la MISMA clave va en ADMS_RELAY_SECRET.
 *
 * En el lector: Servidor en la nube → dirección = <tu-worker>.workers.dev, puerto 80, HTTPS: No.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!url.pathname.toLowerCase().startsWith('/iclock/')) return new Response('OK')
    const target = new URL(url.pathname + url.search, env.TARGET)
    const headers = new Headers()
    headers.set('Content-Type', request.headers.get('Content-Type') || 'text/plain')
    headers.set('x-adms-relay-secret', env.RELAY_SECRET)
    headers.set('x-adms-device-ip', request.headers.get('CF-Connecting-IP') || '')
    const res = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === 'POST' ? await request.arrayBuffer() : undefined,
      redirect: 'manual',
    })
    return new Response(await res.arrayBuffer(), {
      status: res.status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  },
}
