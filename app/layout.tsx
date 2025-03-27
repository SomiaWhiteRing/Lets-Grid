import type { Metadata } from 'next'
import './globals.css'
import { Inter } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import RootLayoutClient from '@/components/RootLayoutClient'

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: '万能填表器',
  description: '一键填写做好的表格！',
  generator: '苍旻白轮',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <RootLayoutClient>
            {children}
          </RootLayoutClient>
        </ThemeProvider>
      </body>
    </html>
  )
}
