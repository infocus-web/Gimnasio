import { useState } from 'react'
import { Image, KeyboardAvoidingView, Platform, View } from 'react-native'
import { router } from 'expo-router'
import * as AppleAuthentication from 'expo-apple-authentication'
import { supabase } from '@/lib/supabase'
import { signInWithApple, signInWithGoogle } from '@/features/auth/social'
import { Button, Field, LinkText, Notice, Screen, Txt } from '@/components/ui'
import { colors, radius } from '@/lib/theme'

export default function Ingresar() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<'email' | 'google' | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const loginWithEmail = async () => {
    const mail = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return setMessage('Escribí tu email.')
    if (!password) return setMessage('Escribí tu contraseña.')
    setMessage(null)
    setBusy('email')
    const { error } = await supabase.auth.signInWithPassword({ email: mail, password })
    setBusy(null)
    if (error) {
      setMessage(
        error.code === 'email_not_confirmed'
          ? 'Todavía no confirmaste tu email. Buscá el correo de Evolution (también en Spam) y tocá el botón.'
          : error.status === 429
            ? 'Demasiados intentos. Esperá un minuto y probá de nuevo.'
            : error.code === 'invalid_credentials'
              ? 'Email o contraseña incorrectos.'
              : 'No pudimos conectarnos. Revisá tu internet y probá de nuevo.',
      )
    }
    // Si salió bien, el cambio de sesión lleva solo a la pantalla del QR
  }

  const google = async () => {
    setMessage(null)
    setBusy('google')
    const err = await signInWithGoogle()
    setBusy(null)
    if (err) setMessage(err)
  }

  const apple = async () => {
    setMessage(null)
    const err = await signInWithApple()
    if (err) setMessage(err)
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['top', 'bottom']}>
        <View style={{ alignItems: 'center', paddingTop: 24, paddingBottom: 8, gap: 12 }}>
          <Image source={require('../../assets/logo.png')} style={{ width: 180, height: 90 }} resizeMode="contain" accessibilityLabel="Evolution Fitness" />
          <Txt muted center>
            Ingresá para ver tu QR de acceso y reservar clases.
          </Txt>
        </View>

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
          returnKeyType="next"
        />
        <Field
          label="Contraseña"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          autoComplete="current-password"
          placeholder="Tu contraseña"
          returnKeyType="go"
          onSubmitEditing={() => void loginWithEmail()}
        />
        <Button label="Ingresar" onPress={() => void loginWithEmail()} busy={busy === 'email'} disabled={busy !== null} />
        <LinkText label="Olvidé mi contraseña" onPress={() => router.push('/recuperar')} />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          <Txt muted size={13}>
            o
          </Txt>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        </View>

        {Platform.OS === 'ios' ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={radius.md}
            style={{ height: 52, width: '100%' }}
            onPress={() => void apple()}
          />
        ) : null}
        <Button label="Continuar con Google" variant="ghost" onPress={() => void google()} busy={busy === 'google'} disabled={busy !== null} />

        <View style={{ marginTop: 12, gap: 8, alignItems: 'center' }}>
          <Txt muted size={14}>
            ¿Primera vez?
          </Txt>
          <LinkText label="Crear mi cuenta" onPress={() => router.push('/crear-cuenta')} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  )
}
