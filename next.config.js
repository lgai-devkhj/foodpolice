/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    /**
     * tesseract.js: 번들에서 제외 + 아래 tracing으로 WASM이 람다에 복사되게 함.
     * (미포함 시 Vercel에서 ENOENT tesseract-core-simd.wasm)
     */
    serverComponentsExternalPackages: ['tesseract.js', 'tesseract.js-core'],
    /**
     * App Router Route Handler가 쓰는 파일만 기본 추적 — WASM은 명시 포함 필요.
     * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/output
     */
    outputFileTracingIncludes: {
      '/api/analyze': [
        './node_modules/tesseract.js/**/*',
        './node_modules/tesseract.js-core/**/*',
      ],
      /** App Router 소스 경로 기준으로 추적되는 배포도 있음 */
      '/app/api/analyze/route': [
        './node_modules/tesseract.js/**/*',
        './node_modules/tesseract.js-core/**/*',
      ],
    },
  },
};

module.exports = nextConfig;
