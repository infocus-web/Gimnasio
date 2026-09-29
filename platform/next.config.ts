import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  typedRoutes: true,
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'fdncorjgytskdjnlwqpe.supabase.co' }],
  },
}

export default nextConfig
