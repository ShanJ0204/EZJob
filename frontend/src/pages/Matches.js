import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { ThumbsUp, ThumbsDown, ExternalLink, Filter, RefreshCw, Zap } from 'lucide-react';

function ScoreRing({ score, size = 44 }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 75 ? '#10B981' : score >= 50 ? '#3B82F6' : '#F59E0B';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#27272A" strokeWidth="3" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

export default function Matches() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [matching, setMatching] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const load = async () => {
    try {
      const d = await api.getMatches(filter || undefined);
      setMatches(d.matches || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const handleAction = async (matchId, action) => {
    try {
      const result = await api.matchAction(matchId, action);
      if (action === 'approve' && result.application?.job_url) {
        window.open(result.application.job_url, '_blank');
      }
      load();
    } catch (e) { alert(e.message); }
  };

  const runMatch = async () => {
    setMatching(true);
    try {
      const result = await api.runMatching();
      alert(`Created ${result.matches_created} new matches!`);
      load();
    } catch (e) { alert(e.message); }
    setMatching(false);
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div data-testid="matches-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-3xl font-bold">Matches</h1>
          <p className="text-muted-foreground mt-1">{matches.length} job matches found</p>
        </div>
        <button onClick={runMatch} disabled={matching} data-testid="run-matching-btn"
          className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50">
          {matching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          {matching ? 'Matching...' : 'Find New Matches'}
        </button>
      </div>

      <div className="flex gap-2 mb-6" data-testid="match-filters">
        {['', 'pending', 'approved', 'rejected'].map((f) => (
          <button key={f} onClick={() => setFilter(f)} data-testid={`filter-${f || 'all'}`}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === f ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}>
            {f || 'All'}
          </button>
        ))}
      </div>

      {matches.length === 0 ? (
        <div className="p-12 rounded-xl bg-card border border-border/50 text-center">
          <Filter className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No matches found. Try running "Find New Matches" or adjust your filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {matches.map((m, i) => (
            <div key={m.match_id || i} data-testid={`match-card-${i}`}
              className="rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-all overflow-hidden">
              <div className="p-4 flex items-center gap-4 cursor-pointer" onClick={() => setExpandedId(expandedId === m.match_id ? null : m.match_id)}>
                <ScoreRing score={m.score || 0} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{m.job?.title || 'Unknown'}</p>
                  <p className="text-sm text-muted-foreground">{m.job?.company_name || ''} · {m.job?.location_text || ''}</p>
                  {m.reason_summary && <p className="text-xs text-muted-foreground mt-1 truncate">{m.reason_summary}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {m.job?.is_remote && <span className="px-2 py-0.5 bg-emerald/10 text-emerald text-xs rounded-full">Remote</span>}
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    m.status === 'approved' ? 'bg-emerald/10 text-emerald' :
                    m.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                    'bg-amber/10 text-amber'
                  }`}>{m.status || 'pending'}</span>
                </div>
              </div>

              {expandedId === m.match_id && (
                <div className="px-4 pb-4 border-t border-border/50 pt-3 animate-fade-in">
                  {m.reasons?.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Match Reasons</p>
                      <div className="space-y-1">
                        {m.reasons.map((r, j) => (
                          <p key={j} className="text-sm"><span className="text-primary font-medium">{r.label}:</span> {r.detail}</p>
                        ))}
                      </div>
                    </div>
                  )}
                  {m.status === 'pending' && (
                    <div className="flex gap-2 mt-3">
                      <button onClick={(e) => { e.stopPropagation(); handleAction(m.match_id, 'approve'); }}
                        data-testid={`approve-${m.match_id}`}
                        className="flex items-center gap-1.5 px-4 py-2 bg-emerald/10 text-emerald hover:bg-emerald/20 rounded-lg text-sm font-medium transition-all">
                        <ThumbsUp className="w-3.5 h-3.5" /> Approve & Apply
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleAction(m.match_id, 'reject'); }}
                        data-testid={`reject-${m.match_id}`}
                        className="flex items-center gap-1.5 px-4 py-2 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-lg text-sm font-medium transition-all">
                        <ThumbsDown className="w-3.5 h-3.5" /> Reject
                      </button>
                      {m.job?.source_url && (
                        <a href={m.job.source_url} target="_blank" rel="noopener noreferrer"
                          data-testid={`view-job-${m.match_id}`}
                          className="flex items-center gap-1.5 px-4 py-2 bg-secondary text-foreground hover:bg-secondary/80 rounded-lg text-sm font-medium transition-all ml-auto"
                          onClick={(e) => e.stopPropagation()}>
                          <ExternalLink className="w-3.5 h-3.5" /> View Job
                        </a>
                      )}
                    </div>
                  )}
                  {m.status === 'approved' && m.job?.source_url && (
                    <a href={m.job.source_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-sm font-medium transition-all mt-2">
                      <ExternalLink className="w-3.5 h-3.5" /> Apply Now
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
