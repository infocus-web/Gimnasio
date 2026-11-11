import { Redirect } from 'expo-router'

/** evolutiongym://auth es la vuelta del ingreso con Google; si iOS abre la app por este link, se sigue al inicio. */
export default function AuthReturn() {
  return <Redirect href="/" />
}
