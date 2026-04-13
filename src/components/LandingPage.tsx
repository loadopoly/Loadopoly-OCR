import React, { useState } from 'react';
import { Camera, Network, Database, Scan, MapPin, ArrowRight, Shield, Key, Zap, CheckCircle, Users, BookOpen, Microscope, Archive, Copy, Check } from 'lucide-react';

interface LandingPageProps {
  onGetStarted: () => void;
  onSignIn: () => void;
}

/**
 * Landing page for new visitors.
 * Single CTA: "Try Free — 5 scans, no sign-up required"
 * Targeted at digital humanities researchers and archivists.
 */
export default function LandingPage({ onGetStarted, onSignIn }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-y-auto">
      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-600/20 via-transparent to-emerald-600/10"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.15),transparent_50%)]"></div>
        
        <nav className="relative z-10 flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
          <div className="flex items-center gap-2">
            <Database size={28} className="text-primary-500" />
            <span className="text-xl font-bold tracking-tight">GeoGraph<span className="text-slate-500">OCR</span></span>
            <span className="ml-1 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-xs font-medium">Free Beta</span>
          </div>
          <button 
            onClick={onSignIn}
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            Sign In
          </button>
        </nav>

        <div className="relative z-10 max-w-4xl mx-auto px-6 pt-16 pb-24 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary-500/10 border border-primary-500/20 rounded-full text-primary-400 text-xs font-medium mb-6">
            <BookOpen size={14} />
            Built for Researchers &amp; Archivists
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-6">
            Turn documents into
            <br />
            <span className="bg-gradient-to-r from-primary-400 to-emerald-400 bg-clip-text text-transparent">
              queryable knowledge
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto mb-8 leading-relaxed">
            Upload a historical document, photo, or artifact. Get a structured database record
            with extracted entities, dates, locations, and a knowledge graph — in seconds.
            <strong className="text-slate-300"> You own the data.</strong>
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
              onClick={onGetStarted}
              className="group flex items-center gap-2 px-8 py-4 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-xl text-lg transition-all shadow-lg shadow-primary-600/20 hover:shadow-primary-500/30"
            >
              Try Free — 5 Scans
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </button>
            <span className="text-sm text-slate-500">No sign-up required</span>
          </div>
        </div>
      </header>

      {/* What it does — 3 columns */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-2xl font-bold text-center mb-12">
          From photo to structured knowledge in <span className="text-primary-400">one step</span>
        </h2>
        
        <div className="grid md:grid-cols-3 gap-8">
          <FeatureCard
            icon={Camera}
            title="Capture"
            description="Photograph any document, artifact, sign, or scenery. Works offline with your phone camera or Bluetooth-connected AR glasses."
            color="text-blue-400"
            bgColor="bg-blue-500/10"
          />
          <FeatureCard
            icon={Zap}
            title="Extract"
            description="AI extracts text, entities (people, places, dates), temporal classification, GPS coordinates, and accessibility metadata — automatically."
            color="text-amber-400"
            bgColor="bg-amber-500/10"
          />
          <FeatureCard
            icon={Network}
            title="Connect"
            description="Cross-document knowledge graph reveals relationships across your entire collection. Ask: 'who built it?' and 'what else did they design?'"
            color="text-emerald-400"
            bgColor="bg-emerald-500/10"
          />
        </div>
      </section>

      {/* Comparison: Before/After */}
      <section className="bg-slate-900/50 border-y border-slate-800">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-bold text-center mb-4">The problem with digitized archives</h2>
          <p className="text-slate-400 text-center max-w-2xl mx-auto mb-12">
            The Smithsonian digitized 11 million artifacts over 20 years. 
            Researchers still can't query "who built this building?" or "what else did they design?"
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-6 rounded-xl border border-red-500/20 bg-red-500/5">
              <h3 className="font-semibold text-red-400 mb-4">Without GeoGraph</h3>
              <ul className="space-y-3 text-sm text-slate-400">
                <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">✕</span> Flat JSON catalogs — no relationships</li>
                <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">✕</span> Manual entity extraction — 40+ hours per collection</li>
                <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">✕</span> Inconsistent schemas across institutions</li>
                <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">✕</span> No GPS coordinates, no temporal classification</li>
                <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">✕</span> Data locked in vendor systems</li>
              </ul>
            </div>
            <div className="p-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
              <h3 className="font-semibold text-emerald-400 mb-4">With GeoGraph</h3>
              <ul className="space-y-3 text-sm text-slate-400">
                <li className="flex items-start gap-2"><CheckCircle size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" /> Knowledge graph with cross-document entity linking</li>
                <li className="flex items-start gap-2"><CheckCircle size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" /> AI entity extraction — 5 minutes per collection</li>
                <li className="flex items-start gap-2"><CheckCircle size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" /> Standardized structured metadata across all sources</li>
                <li className="flex items-start gap-2"><CheckCircle size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" /> GPS + temporal + zone classification included</li>
                <li className="flex items-start gap-2"><CheckCircle size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" /> Your data in your own database (Supabase RLS)</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* For whom */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-2xl font-bold text-center mb-12">Built for</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <AudienceCard icon={Microscope} title="Digital Humanities Researchers" description="Process archival collections in minutes instead of weeks" />
          <AudienceCard icon={Archive} title="Archivists & Librarians" description="Structure digitized collections with standardized entity metadata" />
          <AudienceCard icon={Users} title="Genealogists" description="Extract names, dates, and relationships from family documents" />
          <AudienceCard icon={MapPin} title="Local Historians" description="Document local landmarks, signs, and ephemera with GPS tagging" />
        </div>
      </section>

      {/* AR Scanner callout */}
      <section className="bg-slate-900/50 border-y border-slate-800">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-xs font-medium mb-4">
                <Scan size={14} />
                AR Field Scanner
              </div>
              <h2 className="text-2xl font-bold mb-4">Scan in the field with AR glasses or your phone</h2>
              <p className="text-slate-400 mb-4 leading-relaxed">
                Connect Bluetooth-enabled AR glasses (Xreal, RayNeo, Vuzix) or use your phone camera 
                in the AR Scanner. Walk through an archive, museum, or historical site — capturing 
                and processing documents hands-free as you go.
              </p>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-center gap-2"><CheckCircle size={14} className="text-emerald-400" /> Web Bluetooth connection — no app install required</li>
                <li className="flex items-center gap-2"><CheckCircle size={14} className="text-emerald-400" /> Offline capture — process when you're back online</li>
                <li className="flex items-center gap-2"><CheckCircle size={14} className="text-emerald-400" /> GPS auto-tagging for every capture</li>
                <li className="flex items-center gap-2"><CheckCircle size={14} className="text-emerald-400" /> Batch process entire sessions at once</li>
              </ul>
            </div>
            <div className="flex-shrink-0 w-64 h-48 bg-slate-800 rounded-xl border border-slate-700 flex items-center justify-center">
              <div className="relative">
                <Scan size={64} className="text-emerald-500/30" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 border-2 border-emerald-400 rounded animate-ping"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <h2 className="text-2xl font-bold text-center mb-4">Simple pricing</h2>
        <p className="text-slate-400 text-center max-w-xl mx-auto mb-12">
          Start free with 5 scans. Bring your own API key for unlimited processing, or buy credit packs.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          <PricingCard
            title="Free"
            price="$0"
            features={['5 OCR scans', 'Knowledge graph', 'GPS tagging', 'Local storage', 'JSON/CSV export']}
            cta="Get Started"
            onCta={onGetStarted}
          />
          <PricingCard
            title="BYOK"
            price="$0"
            subtitle="Bring Your Own Key"
            features={['Unlimited scans', 'Your Gemini API key', 'All free features', 'Batch processing', 'Cloud sync']}
            cta="Configure Key"
            onCta={onGetStarted}
          />
          <PricingCard
            title="Credit Packs"
            price="From $9"
            features={['50-1000 credits', 'No API key needed', 'All features included', 'Credits never expire', 'Priority processing']}
            cta="View Plans"
            onCta={onGetStarted}
            highlighted
          />
        </div>
      </section>

      {/* Data ownership callout */}
      <section className="max-w-4xl mx-auto px-6 pb-20 text-center">
        <div className="p-8 rounded-2xl border border-slate-700 bg-slate-900/50">
          <Shield size={32} className="text-primary-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-3">Your data. Your database. Your rules.</h2>
          <p className="text-slate-400 max-w-xl mx-auto mb-6">
            Every structured record is stored in your own Supabase account, protected by Row-Level Security.
            Export anytime as JSON, CSV, or GraphML. No vendor lock-in.
          </p>
          <button 
            onClick={onGetStarted}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 rounded-xl font-semibold transition-colors"
          >
            Start Processing <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* Share section */}
      <ShareSection />

      {/* Footer */}
      <footer className="border-t border-slate-800 px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Database size={16} />
            <span>GeoGraph OCR by Loadopoly</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-slate-500">
            <a href="/privacy-policy.html" className="hover:text-slate-300 transition-colors">Privacy</a>
            <a href="https://github.com/loadopoly/Loadopoly-OCR" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors">GitHub</a>
            <a href="https://x.com/GeoGraphOCR" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors">Twitter / X</a>
            <a href="https://reddit.com/r/digitalhumanities" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors">Reddit</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description, color, bgColor }: { icon: any; title: string; description: string; color: string; bgColor: string }) {
  return (
    <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/30 hover:border-slate-700 transition-colors">
      <div className={`inline-flex p-3 rounded-lg ${bgColor} mb-4`}>
        <Icon size={24} className={color} />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
    </div>
  );
}

function AudienceCard({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/30 text-center">
      <Icon size={28} className="text-primary-400 mx-auto mb-3" />
      <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
      <p className="text-xs text-slate-400">{description}</p>
    </div>
  );
}

function PricingCard({ title, price, subtitle, features, cta, onCta, highlighted }: { title: string; price: string; subtitle?: string; features: string[]; cta: string; onCta: () => void; highlighted?: boolean }) {
  return (
    <div className={`p-6 rounded-xl border ${highlighted ? 'border-primary-500/50 bg-primary-500/5 ring-1 ring-primary-500/20' : 'border-slate-800 bg-slate-900/30'}`}>
      <h3 className="text-lg font-bold text-white">{title}</h3>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      <p className="text-3xl font-bold text-white mt-3 mb-1">{price}</p>
      <ul className="space-y-2 mt-4 mb-6">
        {features.map((f, i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-slate-400">
            <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
            {f}
          </li>
        ))}
      </ul>
      <button
        onClick={onCta}
        className={`w-full py-2.5 rounded-lg font-medium text-sm transition-colors ${
          highlighted
            ? 'bg-primary-600 hover:bg-primary-500 text-white'
            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
        }`}
      >
        {cta}
      </button>
    </div>
  );
}

function ShareSection() {
  const [copied, setCopied] = useState(false);

  const APP_URL = 'https://geographocr.vercel.app';
  const TWEET_TEXT = encodeURIComponent(
    'Turn any historical document into a queryable knowledge graph with @GeoGraphOCR — AI entity extraction, GPS tagging, cross-doc relationships. Free beta, no sign-up.\n\n' + APP_URL + '\n\n#DigitalHumanities #AI #OpenData'
  );
  const REDDIT_TITLE = encodeURIComponent('GeoGraph OCR — turn historical documents into knowledge graphs (free beta)');

  const twitterUrl = `https://x.com/intent/tweet?text=${TWEET_TEXT}`;
  const redditUrl = `https://reddit.com/submit?type=self&title=${REDDIT_TITLE}&url=${encodeURIComponent(APP_URL)}`;

  function handleCopy() {
    navigator.clipboard.writeText(APP_URL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <section className="max-w-4xl mx-auto px-6 pb-16 text-center">
      <div className="p-8 rounded-2xl border border-slate-800 bg-slate-900/30">
        <h2 className="text-lg font-semibold text-white mb-2">Help spread the word</h2>
        <p className="text-sm text-slate-400 mb-6">
          If GeoGraph saved you time, share it with your community.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          {/* X / Twitter */}
          <a
            href={twitterUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-sm font-medium text-slate-300 hover:text-white transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            Share on X
          </a>
          {/* Reddit */}
          <a
            href={redditUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-sm font-medium text-slate-300 hover:text-white transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
            </svg>
            Share on Reddit
          </a>
          {/* Copy link */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-sm font-medium text-slate-300 hover:text-white transition-colors"
          >
            {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      </div>
    </section>
  );
}
