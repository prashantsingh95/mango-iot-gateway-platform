/**
 * When deploying to Cloudflare Pages (via @cloudflare/next-on-pages) the default
 * output must be used — `standalone` is only for the Docker/Node deployment.
 * Set DEPLOY_TARGET=cloudflare to switch modes.
 */
const isCloudflarePages = process.env.DEPLOY_TARGET === 'cloudflare';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(isCloudflarePages ? {} : { output: 'standalone' }),
  allowedDevOrigins: ['localhost', '127.0.0.1', '10.33.77.232'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'api.dicebear.com' },
      { protocol: 'https', hostname: '**' },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://backend:3001'}/api/v1/:path*`,
      },
    ];
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', '@radix-ui/react-icons'],
  },
};

module.exports = nextConfig;
