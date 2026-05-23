import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Entropi — Financial Event Store",
  description: "Event sourcing + double-entry ledger system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 antialiased">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <a href="/" className="text-lg font-bold text-gray-900">
              Entropi
            </a>
            <span className="text-xs text-gray-400">Financial Event Store</span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
