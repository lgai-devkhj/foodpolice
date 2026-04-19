/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    /** tesseract.js: WASM·worker — App Router 서버 번들에서 제외 */
    serverComponentsExternalPackages: ['tesseract.js'],
  },
};

module.exports = nextConfig;
