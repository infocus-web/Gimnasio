import { AppState } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config'

/**
 * La sesión se guarda en el Llavero de iOS (cifrado por el sistema): el socio entra una vez y queda adentro.
 * El Llavero de iOS acepta valores grandes; igual se parte en trozos por si algún día supera el límite de 2 KB.
 */
const CHUNK = 1800

const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await SecureStore.getItemAsync(`${key}.n`)
    if (!count) return SecureStore.getItemAsync(key)
    const parts: string[] = []
    for (let i = 0; i < Number(count); i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`)
      if (part == null) return null
      parts.push(part)
    }
    return parts.join('')
  },
  async setItem(key: string, value: string): Promise<void> {
    await secureStorage.removeItem(key)
    if (value.length <= CHUNK) {
      await SecureStore.setItemAsync(key, value)
      return
    }
    const n = Math.ceil(value.length / CHUNK)
    for (let i = 0; i < n; i++) await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK))
    await SecureStore.setItemAsync(`${key}.n`, String(n))
  },
  async removeItem(key: string): Promise<void> {
    const count = await SecureStore.getItemAsync(`${key}.n`)
    if (count) {
      for (let i = 0; i < Number(count); i++) await SecureStore.deleteItemAsync(`${key}.${i}`)
      await SecureStore.deleteItemAsync(`${key}.n`)
    }
    await SecureStore.deleteItemAsync(key)
  },
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
})

// Renovar la sesión solo con la app abierta (recomendación de Supabase para apps nativas)
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh()
  else supabase.auth.stopAutoRefresh()
})
