import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, BarChart3, CheckCircle2, Globe, Shield, Users, Zap } from 'lucide-react';

export default function HomePage() {
  redirect('/dashboard');
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col font-sans selection:bg-primary/20 selection:text-primary">
      {/* Navigation Bar */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between max-w-7xl">
          <div className="flex items-center gap-2">
            <div className="bg-primary p-1.5 rounded-md">
              <Globe className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-800">NexusCRM</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <Link href="#features" className="hover:text-primary transition-colors">Software</Link>
            <Link href="#pricing" className="hover:text-primary transition-colors">Pricing</Link>
            <Link href="#resources" className="hover:text-primary transition-colors">Resources</Link>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium text-[#00A4BD] hover:text-[#00A4BD]/80 hidden sm:block">
              Log in
            </Link>
            <Link href="/login">
              <Button className="rounded-sm font-semibold shadow-sm hover:shadow-md transition-all active:scale-95">
                Get started free
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="relative pt-20 pb-32 overflow-hidden">
          <div className="container mx-auto px-4 max-w-7xl relative z-10">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="max-w-2xl animate-in slide-in-from-bottom-8 fade-in duration-700 ease-out">
                <h1 className="text-5xl lg:text-6xl font-extrabold text-slate-800 leading-[1.1] tracking-tight mb-6">
                  Grow your business with the ultimate CRM platform.
                </h1>
                <p className="text-lg text-slate-600 mb-8 leading-relaxed max-w-xl">
                  NexusCRM’s customer platform has all the tools and integrations you need for marketing, sales, content management, and customer service.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Link href="/login">
                    <Button size="lg" className="w-full sm:w-auto rounded-sm text-base font-semibold shadow-sm hover:shadow-md">
                      Get started free
                    </Button>
                  </Link>
                  <p className="text-xs text-slate-500 flex items-center justify-center sm:justify-start">
                    Get a demo of our premium software, or get started with free tools.
                  </p>
                </div>
              </div>

              {/* Abstract Hero Graphic */}
              <div className="relative hidden lg:block animate-in slide-in-from-right-12 fade-in duration-1000 ease-out">
                <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-[#00A4BD]/20 rounded-[2rem] transform rotate-3 scale-105 blur-3xl opacity-50"></div>
                <div className="relative bg-white border border-slate-200 shadow-xl rounded-2xl p-6 h-[400px] flex flex-col gap-4">
                  <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
                    <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                      <BarChart3 className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="h-4 w-32 bg-slate-200 rounded animate-pulse"></div>
                      <div className="h-3 w-24 bg-slate-100 rounded mt-2 animate-pulse"></div>
                    </div>
                  </div>
                  <div className="flex-1 flex items-end gap-2 pt-4">
                    {[40, 70, 45, 90, 65, 100].map((height, i) => (
                      <div key={i} className="flex-1 bg-gradient-to-t from-primary/80 to-primary/40 rounded-t-md opacity-80" style={{ height: `${height}%` }}></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Trust/Social Proof Section */}
        <section className="bg-slate-800 py-16 text-center">
          <div className="container mx-auto px-4 max-w-7xl">
            <h2 className="text-white text-2xl font-bold mb-8">Trusted by over 100,000 customers in more than 120 countries</h2>
            <div className="flex flex-wrap justify-center gap-8 md:gap-16 opacity-70">
              {/* Placeholder for logos */}
              <div className="text-2xl font-bold text-white tracking-widest uppercase">Acme Corp</div>
              <div className="text-2xl font-bold text-white tracking-widest uppercase">Globex</div>
              <div className="text-2xl font-bold text-white tracking-widest uppercase">Soylent</div>
              <div className="text-2xl font-bold text-white tracking-widest uppercase">Initech</div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-24 bg-slate-50">
          <div className="container mx-auto px-4 max-w-7xl">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl font-bold text-slate-800 mb-4">The platform that grows with you</h2>
              <p className="text-slate-600 text-lg">
                NexusCRM connects everything — your marketing, sales, and customer service. Built with AI and blockchain security at its core.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                { icon: Users, title: 'Sales Hub', desc: 'CRM software to help you close more deals, faster. Includes robust pipeline management.' },
                { icon: Zap, title: 'AI Copilot', desc: 'Contextual summaries and intelligent action suggestions on any record powered by GPT-4o.' },
                { icon: Shield, title: 'Blockchain Verification', desc: 'Immutable audit trails. Won deals are cryptographically registered on the Polygon network.' }
              ].map((feature, i) => (
                <div key={i} className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <feature.icon className="h-10 w-10 text-primary mb-6" />
                  <h3 className="text-xl font-bold text-slate-800 mb-3">{feature.title}</h3>
                  <p className="text-slate-600 mb-6">{feature.desc}</p>
                  <Link href="/login" className="inline-flex items-center text-[#00A4BD] font-medium hover:underline">
                    Learn more <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Minimal Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12 border-t border-slate-800">
        <div className="container mx-auto px-4 max-w-7xl text-center md:text-left flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center gap-2 mb-4 md:mb-0">
            <Globe className="h-6 w-6 text-white" />
            <span className="text-xl font-bold text-white tracking-tight">NexusCRM</span>
          </div>
          <div className="text-sm">
            &copy; {new Date().getFullYear()} NexusCRM, Inc. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
