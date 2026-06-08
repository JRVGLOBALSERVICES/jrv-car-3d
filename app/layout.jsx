import './globals.css';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';

const display = Space_Grotesk({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-display', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap' });

export const metadata = {
  metadataBase: new URL('https://jrv-car-3d.vercel.app'),
  title: 'JRV · 911 GT3 RS — real-time showroom',
  description:
    'A real-time React Three Fiber Porsche 911 GT3 RS. Scroll-driven cinematic camera, spinning wheels, AgX tone mapping, Reflector wet floor, iridescent clearcoat. Built by JRV.',
  openGraph: {
    title: 'JRV · 911 GT3 RS — real-time showroom',
    description: 'Scroll the camera through the cut. Real-time WebGL, two night moods.',
    type: 'website',
    url: 'https://jrv-car-3d.vercel.app',
  },
  twitter: { card: 'summary_large_image', title: 'JRV · 911 GT3 RS', description: 'Real-time WebGL showroom. Drag to orbit.' },
};

export const viewport = { themeColor: '#05060c', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
