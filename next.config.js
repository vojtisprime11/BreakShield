/** @type {import('next').NextConfig} */
const nextConfig = {
  // ts-morph and swagger-parser use Node.js APIs — must not be bundled for browser
  serverExternalPackages: ['ts-morph', 'typescript', '@apidevtools/swagger-parser'],

  // Suppress ts-morph's use of dynamic require
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false, path: false, os: false,
      }
    }
    return config
  },
}

module.exports = nextConfig
