/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/api/:path*',
          // Docker: API_URL=http://api:3000  |  Local dev: falls back to localhost
          destination: `${process.env.API_URL ?? 'http://localhost:3000'}/:path*`,
        },
      ],
    };
  },
};

module.exports = nextConfig;
