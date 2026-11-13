import type { PromoSlideData } from './promo'

/**
 * Publicidad estilo redes: la imagen con zoom lento y los textos animados encima.
 * El tamaño de los textos se adapta a la caja (sirve igual para la tablet, la TV y la vista previa del panel).
 * Para repetir la animación, cambiar la "key" del componente.
 */
export function PromoSlide({ slide, className = '' }: { slide: PromoSlideData; className?: string }) {
  const style = slide.style ?? 'impacto'
  const position = slide.position ?? 'bottom'
  const hasText = !!(slide.badge || slide.title || slide.subtitle)
  const anim = (name: string, delayMs: number, durMs = 900) =>
    ({ animation: `${name} ${durMs}ms cubic-bezier(.2,.8,.2,1) ${delayMs}ms both` }) as const
  const enter = style === 'impacto' ? 'ps-impact' : style === 'deslizar' ? 'ps-left' : 'ps-up'

  return (
    <div className={`absolute inset-0 overflow-hidden bg-black [container-type:size] ${className}`}>
      <style>{KEYFRAMES}</style>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={slide.url}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={{ animation: `${style === 'deslizar' ? 'ps-pan' : 'ps-zoom'} 9s ease-out both` }}
      />
      {hasText && (
        <>
          <div
            className={`absolute inset-0 ${
              position === 'top'
                ? 'bg-gradient-to-b from-black/85 via-black/30 to-transparent'
                : position === 'center'
                  ? 'bg-black/45'
                  : 'bg-gradient-to-t from-black/90 via-black/35 to-transparent'
            }`}
          />
          <div
            className={`absolute inset-0 flex flex-col gap-[2.2cqmin] p-[7cqmin] ${
              position === 'top' ? 'justify-start' : position === 'center' ? 'items-center justify-center text-center' : 'justify-end'
            }`}
          >
            {slide.badge && (
              <span
                className="w-fit rounded-full bg-[#edcc36] px-[3cqmin] py-[1cqmin] text-[4cqmin] font-black uppercase tracking-wider text-black"
                style={anim('ps-pop', 150, 700)}
              >
                {slide.badge}
              </span>
            )}
            {slide.title && (
              <p
                className="max-w-full text-[11cqmin] font-black uppercase leading-[0.95] tracking-tight text-white [overflow-wrap:anywhere] drop-shadow-[0_0.6cqmin_2cqmin_rgba(0,0,0,0.6)]"
                style={anim(enter, 400, style === 'impacto' ? 700 : 900)}
              >
                {highlight(slide.title)}
              </p>
            )}
            {slide.subtitle && (
              <p
                className="max-w-[90%] text-[4.6cqmin] font-semibold leading-snug text-white/90 drop-shadow-[0_0.4cqmin_1.5cqmin_rgba(0,0,0,0.7)]"
                style={anim(style === 'impacto' ? 'ps-up' : enter, 1000)}
              >
                {slide.subtitle}
              </p>
            )}
            <span
              className={`block h-[0.9cqmin] w-[18cqmin] rounded-full bg-[#edcc36] ${position === 'center' ? 'mx-auto' : ''}`}
              style={{ ...anim('ps-bar', 1300, 800), transformOrigin: position === 'center' ? 'center' : 'left' }}
              aria-hidden="true"
            />
          </div>
        </>
      )}
    </div>
  )
}

/** Las palabras entre *asteriscos* van en amarillo: "2x1 en *marzo*" */
function highlight(text: string) {
  return text.split(/(\*[^*]+\*)/g).map((part, i) =>
    part.startsWith('*') && part.endsWith('*') && part.length > 2 ? (
      <span key={i} className="text-[#edcc36]">
        {part.slice(1, -1)}
      </span>
    ) : (
      part
    ),
  )
}

const KEYFRAMES = `
@keyframes ps-zoom { from { transform: scale(1.14) } to { transform: scale(1) } }
@keyframes ps-pan { from { transform: scale(1.12) translateX(-3%) } to { transform: scale(1.12) translateX(3%) } }
@keyframes ps-impact { 0% { opacity: 0; transform: scale(1.7); filter: blur(14px) } 70% { opacity: 1; transform: scale(.97); filter: blur(0) } 100% { opacity: 1; transform: none; filter: none } }
@keyframes ps-left { from { opacity: 0; transform: translateX(-14%) } to { opacity: 1; transform: none } }
@keyframes ps-up { from { opacity: 0; transform: translateY(35%) } to { opacity: 1; transform: none } }
@keyframes ps-pop { 0% { opacity: 0; transform: scale(.5) } 70% { opacity: 1; transform: scale(1.1) } 100% { opacity: 1; transform: none } }
@keyframes ps-bar { from { transform: scaleX(0) } to { transform: scaleX(1) } }
@media (prefers-reduced-motion: reduce) { [style*="ps-"] { animation: none !important } }
`
