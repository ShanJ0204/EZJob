import React from 'react';
import { Zap, ArrowRight } from 'lucide-react';

export default function Login() {
  const handleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + '/dashboard';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden" data-testid="login-page">
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(circle at 50% 30%, rgba(59, 130, 246, 0.12) 0%, rgba(10, 10, 10, 0) 60%)'
      }} />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4">
        <div className="animate-fade-in text-center max-w-lg">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center pulse-glow">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <h1 className="font-heading text-4xl font-bold tracking-tight">EZJob</h1>
          </div>

          <h2 className="font-heading text-2xl md:text-3xl font-semibold mb-4 text-foreground">
            AI-Powered Job Matching
          </h2>
          <p className="text-muted-foreground text-lg mb-10 leading-relaxed">
            Get matched with the best remote jobs using AI scoring. Set your preferences, and let EZJob find opportunities tailored to your skills.
          </p>

          <button
            onClick={handleLogin}
            data-testid="google-login-btn"
            className="inline-flex items-center gap-3 px-8 py-4 bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold text-lg transition-all duration-200 active:scale-95 hover:shadow-lg hover:shadow-primary/25"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
            <ArrowRight className="w-5 h-5" />
          </button>

          <div className="mt-12 grid grid-cols-3 gap-6 text-center">
            {[
              { val: '500+', label: 'Remote Jobs' },
              { val: 'GPT-5.2', label: 'AI Scoring' },
              { val: 'Real-time', label: 'Matching' },
            ].map((s) => (
              <div key={s.label} className="p-4 rounded-xl bg-card/50 border border-border/50">
                <p className="font-heading text-xl font-bold text-primary">{s.val}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
