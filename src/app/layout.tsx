import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Plan vs Actual Tracker',
  description:
    'Set monthly spending targets per category, log actual spend, and review variance with locked accounting periods.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
