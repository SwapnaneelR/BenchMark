import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BenchMark // MATCHING ENGINE PLATFORM',
  description: 'High-performance matching engine benchmarking platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen" style={{ background: '#0a0a0a', color: '#33ff00' }}>
        {/* Header */}
        <header style={{ borderBottom: '1px solid #1f521f' }} className="px-4 py-2">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-3">
              <span className="glow text-xs font-bold tracking-widest">
                [BENCHMARK]
              </span>
              <span style={{ color: '#1f521f' }}>|</span>
              <span style={{ color: '#1f521f' }} className="text-xs">
                MATCHING ENGINE BENCHMARK PLATFORM v1.0
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs" style={{ color: '#1f521f' }}>
              <span>API:3000</span>
              <span>OBS:3002</span>
              <span className="glow" style={{ color: '#33ff00' }}>
                STATUS:[ON]
              </span>
            </div>
          </div>
        </header>

        {/* ASCII banner */}
        <div className="px-4 py-3 max-w-7xl mx-auto" style={{ borderBottom: '1px solid #1f521f' }}>
          <pre className="text-xs leading-tight" style={{ color: '#1f521f', textShadow: 'none' }}>
{`  ██████╗ ███████╗███╗   ██╗ ██████╗██╗  ██╗███╗   ███╗ █████╗ ██████╗ ██╗  ██╗
  ██╔══██╗██╔════╝████╗  ██║██╔════╝██║  ██║████╗ ████║██╔══██╗██╔══██╗██║ ██╔╝   > submit engine
  ██████╔╝█████╗  ██╔██╗ ██║██║     ███████║██╔████╔██║███████║██████╔╝█████╔╝    > run stress test
  ██╔══██╗██╔══╝  ██║╚██╗██║██║     ██╔══██║██║╚██╔╝██║██╔══██║██╔══██╗██╔═██╗   > score + rank
  ██████╔╝███████╗██║ ╚████║╚██████╗██║  ██║██║ ╚═╝ ██║██║  ██║██║  ██║██║  ██╗
  ╚═════╝ ╚══════╝╚═╝  ╚═══╝ ╚═════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝`}
          </pre>
        </div>

        <main className="px-4 py-4 max-w-7xl mx-auto">{children}</main>

        {/* Footer */}
        <footer className="px-4 py-2 text-xs mt-8" style={{ borderTop: '1px solid #1f521f', color: '#1f521f' }}>
          BenchMark Platform
        </footer>
      </body>
    </html>
  );
}
