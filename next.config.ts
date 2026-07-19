import type { NextConfig } from 'next'

const securityHeaders = [
  // Allow same-origin iframes (used by the in-app tab system)
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Stop browsers from guessing MIME type from content
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Restrict referrer info sent to third parties
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Disable unused browser features
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), payment=(), usb=(), geolocation=(self)' },
  // Force HTTPS for 2 years; tell browser to include subdomains
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Basic XSS filter for older browsers
  { key: 'X-XSS-Protection', value: '1; mode=block' },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
