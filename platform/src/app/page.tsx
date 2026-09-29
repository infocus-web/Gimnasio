import { redirect } from 'next/navigation'

// Por ahora hay un solo gimnasio. Cuando haya más, acá va la landing del SaaS.
export default function Home() {
  redirect('/evolution')
}
