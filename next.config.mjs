/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Keep mongoose/bcryptjs out of the bundler's dependency graph — they are
    // CommonJS with optional native deps and must run as plain Node requires.
    serverComponentsExternalPackages: ['mongoose', 'bcryptjs'],
  },
};

export default nextConfig;
