import type { ReactNode } from "react"
import "./globals.css"

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased font-sans">
        <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between">
          <a href="/" className="text-base font-semibold tracking-tight text-gray-900">
            Entropi
          </a>
          <div className="flex items-center gap-3">
            <a href="/orders" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Orders</a>
            <a href="/settlement" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Settlement</a>
            <a href="/new-order" className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors">New order</a>
          </div>
        </nav>
        <main className="max-w-4xl mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  )
}
