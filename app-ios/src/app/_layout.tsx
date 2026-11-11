import { useEffect } from 'react'
import { View } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans'
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider'
import { Loading } from '@/components/ui'
import { colors } from '@/lib/theme'

void SplashScreen.preventAutoHideAsync()

function RootNavigator() {
  const { ready, session, memberState } = useAuth()
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold })
  const booting = !ready || !fontsLoaded

  useEffect(() => {
    if (!booting) void SplashScreen.hideAsync()
  }, [booting])

  if (booting) return null

  // Con sesión, mientras se busca la ficha del socio
  if (session && (memberState === 'idle' || memberState === 'loading')) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <Loading />
      </View>
    )
  }

  const isMember = !!session && memberState === 'ok'
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade' }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="ingresar" />
        <Stack.Screen name="crear-cuenta" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="recuperar" options={{ animation: 'slide_from_right' }} />
      </Stack.Protected>
      <Stack.Protected guard={isMember}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !isMember}>
        <Stack.Screen name="sin-plan" />
      </Stack.Protected>
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  )
}
