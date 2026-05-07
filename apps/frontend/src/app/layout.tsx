import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kalshi Agents',
  description: 'AI-powered Kalshi market recommendations',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen">
          <nav className="w-52 shrink-0 border-r border-slate-800 p-6 flex flex-col gap-2">
            <span className="text-lg font-bold text-emerald-400 mb-6">Kalshi Agents</span>
            <a href="/" className="nav-link">Dashboard</a>
            <a href="/recommendations" className="nav-link">Recommendations</a>
            <a href="/history" className="nav-link">History</a>
          </nav>
          <main className="flex-1 p-8 overflow-auto">{children}</main>
        </div>
        <style>{`
          .nav-link {
            display: block;
            padding: 0.5rem 0.75rem;
            border-radius: 0.375rem;
            color: rgb(148 163 184);
            font-size: 0.875rem;
            transition: background-color 0.15s, color 0.15s;
          }
          .nav-link:hover {
            background-color: rgb(30 41 59);
            color: white;
          }
        `}</style>
      </body>
    </html>
  );
}
