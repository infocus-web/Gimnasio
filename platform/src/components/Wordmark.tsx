/** Logotipo de texto de la marca: "EVOLUTION" en blanco + resto del nombre en amarillo. */
export function Wordmark({ name, size = 'md', sub }: { name: string; size?: 'sm' | 'md'; sub?: string }) {
  const [first, ...rest] = name.split(' ')
  return (
    <span className="flex min-w-0 flex-col">
      <span className="flex min-w-0 items-baseline gap-1.5 font-display uppercase leading-none">
        <span className={`font-black tracking-tight text-white ${size === 'md' ? 'text-2xl' : 'text-xl'}`}>{first}</span>
        {rest.length > 0 && (
          <span className={`truncate font-bold text-brand ${size === 'md' ? 'text-base' : 'text-sm'}`}>{rest.join(' ')}</span>
        )}
      </span>
      {sub && <span className="mt-1 text-xs text-zinc-500">{sub}</span>}
    </span>
  )
}
