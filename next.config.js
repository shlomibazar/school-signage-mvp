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
}

module.exports = config