/** @type {import('next').NextConfig} */
const config = {
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    }
    return config
  },
  images: {
    remotePatterns: [],
  },
  // Clickjacking protection: the admin area and the sign-in pages may not be shown inside a frame,
  // by any site (frame-ancestors 'none'; X-Frame-Options for older browsers). Nothing in the app
  // frames them. This also stops an "אתר חיצוני" region from redirecting its sandboxed frame back to
  // an admin page of ours. Public TV pages (/screen, /s) and the public APIs are not affected.
  async headers() {
    const noFraming = [
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
      { key: 'X-Frame-Options', value: 'DENY' },
    ]
    return [
      { source: '/admin', headers: noFraming },
      { source: '/admin/:path*', headers: noFraming },
      { source: '/auth/:path*', headers: noFraming },
    ]
  },
}

module.exports = config