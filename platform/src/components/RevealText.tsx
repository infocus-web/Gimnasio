import { Children, Fragment, isValidElement } from 'react'

/**
 * Parte un texto en palabras para animarlas una por una (estilo "texto animado").
 * Cada palabra va dentro de una máscara (.rw) y sube desde abajo (.rw-i).
 * Los elementos que no son texto (por ejemplo <br />) se respetan tal cual.
 * La animación la definen las clases de globals.css (.hero-split o [data-reveal]).
 */
export function SplitWords({ children }: { children: React.ReactNode }) {
  let i = 0
  const walk = (node: React.ReactNode): React.ReactNode =>
    Children.map(node, (child) => {
      if (typeof child === 'string' || typeof child === 'number') {
        return String(child)
          .split(/(\s+)/)
          .map((part, k) =>
            !part ? null : /^\s+$/.test(part) ? (
              ' '
            ) : (
              <span key={k} className="rw">
                <span className="rw-i" style={{ '--i': i++ } as React.CSSProperties}>
                  {part}
                </span>
              </span>
            ),
          )
      }
      if (isValidElement<{ children?: React.ReactNode }>(child) && child.type === Fragment) return walk(child.props.children)
      return child
    })
  return <>{walk(children)}</>
}
