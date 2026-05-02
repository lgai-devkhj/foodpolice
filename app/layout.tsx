import type { Metadata, Viewport } from 'next';
import './globals.css';
import { APP_DISPLAY_NAME, APP_METADATA_DESCRIPTION } from '@/lib/app-config';
import { PUBLIC_IMAGE_PRELOAD_HREFS } from '@/lib/constants';

export const metadata: Metadata = {
  title: APP_DISPLAY_NAME,
  description: APP_METADATA_DESCRIPTION,
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
