import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '은우의 루미큐브',
  description: '친구들과 함께하는 온라인 루미큐브',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
