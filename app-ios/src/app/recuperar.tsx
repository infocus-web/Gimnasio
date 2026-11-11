import { useState } from 'react'
import { KeyboardAvoidingView, Platform } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { Button, Field, LinkText, Notice, Screen, Title, Txt } from '@/components/ui'
import { colors } from '@/lib/theme'

/**
 * Olvidé mi contraseña, sin salir de la app: llega un código de 6 números por email,
 * se escribe acá junto con la contraseña nueva y queda adentro (mismo circuito que la web).
 */
export default function Recuperar() {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const mail = email.trim().toLowerCase()

  const sendCode = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return setMessage('Escribí tu email.')
    setMessage(null)
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(mail)
    setBusy(false)
    if (error && (error.status === 429 || (error.code ?? '').includes('rate_limit'))) {
      setMessage('Ya te mandamos un código hace un momento. Revisá tu correo (también Spam) o probá de nuevo en un minuto.')
      return
    }
    // Por seguridad no se dice si el email tiene cuenta o no
    setInfo('Si ese email tiene cuenta, te llegó un código de 6 números. Revisá también Spam.')
    setStep('code')
  }

  const confirm = async () => {
    const token = code.replace(/\D/g, '')
    if (token.length < 6) return setMessage('El código tiene 6 números.')
    if (password.length < 8) return setMessage('La contraseña tiene que tener al menos 8 caracteres.')
    if (password.length > 72) return setMessage('La contraseña es demasiado larga (máximo 72 caracteres).')
    setMessage(null)
    setBusy(true)
    const { error } = await supabase.auth.verifyOtp({ email: mail, token, type: 'recovery' })
    if (error) {
      setBusy(false)
      setMessage(error.status === 429 ? 'Demasiados intentos. Esperá un minuto y probá de nuevo.' : 'El código no es correcto o ya venció. Revisalo o pedí uno nuevo.')
      return
    }
    // Con el código correcto ya quedó la sesión abierta: se guarda la contraseña nueva
    const { error: e2 } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (e2 && e2.code !== 'same_password') {
      setMessage(
        e2.code === 'weak_password'
          ? 'Ya entraste, pero esa contraseña es muy fácil y no se guardó. Podés cambiarla después desde la web.'
          : 'Ya entraste, pero no pudimos guardar la contraseña nueva. Podés cambiarla después desde la web.',
      )
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['top', 'bottom']}>
        <LinkText label="‹ Volver" onPress={() => router.back()} />
        <Title sub="Te mandamos un código por email para elegir una contraseña nueva.">Olvidé mi contraseña</Title>
        {message ? <Notice text={message} /> : null}
        {info && step === 'code' ? <Notice tone="info" text={info} /> : null}

        {step === 'email' ? (
          <>
            <Field
              label="Email de tu cuenta"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              placeholder="tu@email.com"
              onSubmitEditing={() => void sendCode()}
            />
            <Button label="Mandarme el código" onPress={() => void sendCode()} busy={busy} />
          </>
        ) : (
          <>
            <Field
              label="Código de 6 números"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={8}
              placeholder="123456"
            />
            <Field
              label="Contraseña nueva (mínimo 8 caracteres)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="newPassword"
              autoComplete="new-password"
              placeholder="Elegí una contraseña"
              onSubmitEditing={() => void confirm()}
            />
            <Button label="Guardar e ingresar" onPress={() => void confirm()} busy={busy} />
            <LinkText label="No me llegó: mandar otro código" onPress={() => void sendCode()} />
            <Txt muted size={13} center>
              Si en el email ves un botón en vez de un código, tocalo: se abre la web y elegís la contraseña ahí. Después volvé a la app.
            </Txt>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  )
}
