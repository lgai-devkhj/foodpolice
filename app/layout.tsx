import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PUBLIC_IMAGE_PRELOAD_HREFS } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'FoodPolice',
  description: '포장만 찍으면 가공 정도를 기준으로 원재료랑 맞춤 안내를 알려 드려요',
};

export const viewport: Viewport = {
  themeColor: '#2E7D32',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        {PUBLIC_IMAGE_PRELOAD_HREFS.map((href) => (
          <link key={href} rel="preload" href={href} as="image" />
        ))}
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
