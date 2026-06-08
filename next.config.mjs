/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // R3F + StrictMode double-mounts the WebGL context
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing'],
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      {
        // Three.js GLB texture decoders (Draco/KTX2/Basis) need wasm-unsafe-eval
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://www.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://www.gstatic.com data: blob:; worker-src 'self' blob:;",
          },
        ],
      },
    ];
  },
};
export default nextConfig;
