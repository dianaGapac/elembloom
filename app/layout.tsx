import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ElemBloom | Classroom support, made clearer',
  description: 'A focused workspace for Philippine elementary school teachers to monitor academic risk and manage interventions.',
  generator: 'v0.app',
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
}

export const viewport: Viewport = { colorScheme: 'light', themeColor: '#2E8B57', userScalable: false }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body className="antialiased" suppressHydrationWarning>{children}{process.env.NODE_ENV === 'production' && <Analytics />}</body></html>
}
