import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Check, Clock, Briefcase, ArrowUpRight, FileText, RefreshCw, Copy, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

function CoverLetterPanel({ attempt, onRegenerate }) {
  const [letter, setLetter] = useState(attempt.cover_letter || null);
  const [status, setStatus] = useState(attempt.cover_letter_status || 'none');
  const [expanded, setExpanded] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [polling, setPolling] = useState(status === 'generating');

  useEffect(() => {
    if (status !== 'generating') return;
    const timer = setInterval(async () => {
      try {
        const res = await api.getCoverLetter(attempt.attempt_id);
        if (res.status === 'ready' && res.cover_letter) {
          setLetter(res.cover_letter);
          setStatus('ready');
          setPolling(false);
        } else if (res.status === 'failed') {
          setStatus('failed');
          setPolling(false);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(timer);
  }, [status, attempt.attempt_id]);

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const res = await api.generateCoverLetter(null, attempt.attempt_id);
      setLetter(res.cover_letter);
      setStatus('ready');
    } catch (e) { alert(e.message); }
    setRegenerating(false);
  };

  const copyToClipboard = async () => {
    if (!letter) return;
    await navigator.clipboard.writeText(letter);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (status === 'none' || (!letter && status !== 'generating')) {
    return null;
  }

  return (
    <div className="mt-3 border-t border-border/30 pt-3" data-testid={`cover-letter-panel-${attempt.attempt_id}`}>
      <button onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors w-full"
        data-testid={`toggle-cover-letter-${attempt.attempt_id}`}>
        <Sparkles className="w-4 h-4" />
        <span className="font-medium">AI Cover Letter</span>
        {status === 'generating' && <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
        {status === 'ready' && <span className="px-1.5 py-0.5 bg-emerald/10 text-emerald text-[10px] rounded-full">Ready</span>}
        {status === 'failed' && <span className="px-1.5 py-0.5 bg-destructive/10 text-destructive text-[10px] rounded-full">Failed</span>}
        <div className="ml-auto">{expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</div>
      </button>

      {expanded && (
        <div className="mt-3 animate-fade-in">
          {status === 'generating' && (
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 text-center">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">GPT-5.2 is crafting your cover letter...</p>
            </div>
          )}
          {status === 'ready' && letter && (
            <div>
              <div className="p-4 rounded-lg bg-secondary/30 border border-border/30 max-h-64 overflow-y-auto">
                <pre className="text-sm text-foreground whitespace-pre-wrap font-body leading-relaxed">{letter}</pre>
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={copyToClipboard} data-testid={`copy-cover-letter-${attempt.attempt_id}`}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    copied ? 'bg-emerald/10 text-emerald' : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}>
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button onClick={regenerate} disabled={regenerating} data-testid={`regen-cover-letter-${attempt.attempt_id}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary text-muted-foreground hover:text-foreground rounded-lg text-xs font-medium transition-all disabled:opacity-50">
                  <RefreshCw className={`w-3 h-3 ${regenerating ? 'animate-spin' : ''}`} />
                  {regenerating ? 'Regenerating...' : 'Regenerate'}
                </button>
              </div>
            </div>
          )}
          {status === 'failed' && (
            <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/10 text-center">
              <p className="text-sm text-muted-foreground mb-2">Cover letter generation failed</p>
              <button onClick={regenerate} disabled={regenerating}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium transition-all mx-auto">
                <RefreshCw className={`w-3 h-3 ${regenerating ? 'animate-spin' : ''}`} />
                Retry
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Applications() {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const d = await api.getApplications();
      setApps(d.applications || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const markApplied = async (attemptId) => {
    try {
      await api.markApplied(attemptId);
      load();
    } catch (e) { alert(e.message); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div data-testid="applications-page">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold">Applications</h1>
        <p className="text-muted-foreground mt-1">Track your approved matches and AI-generated cover letters</p>
      </div>

      {apps.length === 0 ? (
        <div className="p-12 rounded-xl bg-card border border-border/50 text-center">
          <Briefcase className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No applications yet. Approve some matches to get started!</p>
          <p className="text-xs text-muted-foreground mt-2">When you approve a match, GPT-5.2 will auto-generate a tailored cover letter</p>
        </div>
      ) : (
        <div className="space-y-3">
          {apps.map((a, i) => (
            <div key={a.attempt_id || i} data-testid={`application-card-${i}`}
              className="p-5 rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-lg">{a.job_title || 'Job Application'}</p>
                  <p className="text-sm text-muted-foreground">{a.company_name || ''}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Created {new Date(a.created_at).toLocaleDateString()}
                    {a.applied_at && ` · Applied ${new Date(a.applied_at).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                    a.status === 'applied' ? 'bg-emerald/10 text-emerald' :
                    a.status === 'ready' ? 'bg-primary/10 text-primary' :
                    'bg-amber/10 text-amber'
                  }`}>
                    {a.status === 'applied' ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                    {a.status}
                  </span>

                  {a.status === 'ready' && (
                    <div className="flex gap-2">
                      {a.job_url && (
                        <a href={a.job_url} target="_blank" rel="noopener noreferrer"
                          data-testid={`apply-link-${i}`}
                          className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-xs font-medium transition-all">
                          <ArrowUpRight className="w-3 h-3" /> Apply
                        </a>
                      )}
                      <button onClick={() => markApplied(a.attempt_id)}
                        data-testid={`mark-applied-${i}`}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald/10 text-emerald hover:bg-emerald/20 rounded-lg text-xs font-medium transition-all">
                        <Check className="w-3 h-3" /> Mark Applied
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <CoverLetterPanel attempt={a} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
