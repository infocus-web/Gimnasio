import { useState } from 'react'
import { KeyboardAvoidingView, Platform } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { ORG_SLUG, SITE_URL } from '@/lib/config'
import { Button, Field, LinkText, Notice, Screen, Title, Txt, Card } from '@/components/ui'
import { colors } from '@/lib/theme'

/** Mismo alta que la web: email + contraseña, un único email de validación y después ingresa. */
export default function CrearCuenta() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const submit = async () => {
    const mail = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return setMessage('Escribí un email válido.')
    if (password.length < 8) return setMessage('La contraseña tiene que tener al menos 8 caracteres.')
    if (password.length > 72) return setMessage('La contraseña es demasiado larga (máximo 72 caracteres).')
    if (password !== password2) return setMessage('Las dos contraseñas no coinciden.')
    setMessage(null)
    setBusy(true)
    const { data, error } = await supabase.auth.signUp({
      email: mail,
      password,
      // El botón del email abre la web, confirma la cuenta y después el socio vuelve a la app a ingresar
      options: { emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(`/${ORG_SLUG}/app`)}` },
    })
    setBusy(false)
    if (error) {
      setMessage(
        error.status === 429 || (error.code ?? '').includes('rate_limit')
          ? 'Ya te mandamos el email hace un momento. Revisá tu correo (también Spam) o probá en un minuto.'
          : error.code === 'signup_disabled'
            ? 'Por ahora no se pueden crear cuentas nuevas desde acá. Acercate a recepción o escribinos por WhatsApp.'
            : /weak|pwned|leaked/i.test(error.message)
              ? 'Esa contraseña es muy fácil o apareció en filtraciones. Elegí otra.'
              : /already|registered|exists/i.test(error.message)
                ? 'Ese email ya tiene cuenta. Ingresá, o tocá "Olvidé mi contraseña" para elegir una.'
                : 'No pudimos crear la cuenta. Revisá tu internet y probá de nuevo.',
      )
      return
    }
    // Si el email ya existía, Supabase no avisa (por seguridad): igual se muestra "revisá tu correo"
    if (data.session) return // confirmación de email desactivada: ya quedó adentro
    setSent(true)
  }

  if (sent) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Title>Revisá tu correo</Title>
        <Card>
          <Txt>
            Te mandamos un email a <Txt bold>{email.trim().toLowerCase()}</Txt>. Tocá el botón del correo para confirmar tu cuenta (si no lo ves,
            buscá en Spam).
          </Txt>
          <Txt muted>Después volvé a esta app e ingresá con tu email y contraseña.</Txt>
        </Card>
        <Button label="Ya confirmé: ingresar" onPress={() => router.replace('/ingresar')} />
      </Screen>
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['top', 'bottom']}>
        <LinkText label="‹ Volver" onPress={() => router.back()} />
        <Title sub="Con tu cuenta ves tu QR de acceso, tu cuota y reservás clases.">Crear mi cuenta</Title>
        {message ? <Notice text={message} /> : null}
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          autoComplete="email"
          placeholder="tu@email.com"
        />
        <Field
          label="Contraseña (mínimo 8 caracteres)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          placeholder="Elegí una contraseña"
        />
        <Field
          label="Repetí la contraseña"
          value={password2}
          onChangeText={setPassword2}
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          placeholder="La misma contraseña"
          onSubmitEditing={() => void submit()}
        />
        <Button label="Crear cuenta" onPress={() => void submit()} busy={busy} />
        <Txt muted size={13} center>
          Al crear la cuenta aceptás los términos y la política de privacidad de Evolution Fitness.
        </Txt>
      </Screen>
    </KeyboardAvoidingView>
  )
}
