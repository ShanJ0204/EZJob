import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Target, Briefcase, ThumbsUp, ThumbsDown, Clock, Zap, RefreshCw, ArrowRight } from 'lucide-react';

function ScoreRing({ score, size = 48 }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 75 ? '#10B981' : score >= 50 ? '#3B82F6' : '#F59E0B';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#27272A" strokeWidth="3" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-700" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const d = await api.getDashboard();
      setData(d);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runMatch = async () => {
    setMatching(true);
    try {
      const result = await api.runMatching();
      alert(`Created ${result.matches_created} new matches!`);
      load();
    } catch (e) {
      alert(e.message);
    }
    setMatching(false);
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  const f = data?.funnel || {};

  return (
    <div data-testid="dashboard-page">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Your job matching overview</p>
        </div>
        <button onClick={runMatch} disabled={matching} data-testid="run-matching-btn"
          className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50">
          {matching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          {matching ? 'Matching...' : 'Find Matches'}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Matches', val: f.total_matches || 0, icon: Target, color: 'text-primary' },
          { label: 'Pending Review', val: f.pending || 0, icon: Clock, color: 'text-amber' },
          { label: 'Approved', val: f.approved || 0, icon: ThumbsUp, color: 'text-emerald' },
          { label: 'Applied', val: f.applied || 0, icon: Briefcase, color: 'text-violet' },
        ].map(({ label, val, icon: Icon, color }) => (
          <div key={label} className="p-5 rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-colors" data-testid={`stat-${label.toLowerCase().replace(/\s/g, '-')}`}>
            <div className="flex items-center justify-between mb-3">
              <Icon className={`w-5 h-5 ${color}`} />
              <span className="font-heading text-2xl font-bold">{val}</span>
            </div>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <div className="p-5 rounded-xl bg-card border border-border/50">
          <p className="text-sm text-muted-foreground mb-1">Jobs Indexed</p>
          <p className="font-heading text-2xl font-bold text-primary">{data?.total_jobs_indexed || 0}</p>
        </div>
        <div className="p-5 rounded-xl bg-card border border-border/50">
          <p className="text-sm text-muted-foreground mb-1">Ready to Apply</p>
          <p className="font-heading text-2xl font-bold text-emerald">{f.ready || 0}</p>
        </div>
        <div className="p-5 rounded-xl bg-card border border-border/50">
          <p className="text-sm text-muted-foreground mb-1">Rejected</p>
          <p className="font-heading text-2xl font-bold text-destructive">{f.rejected || 0}</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-xl font-semibold">Recent Matches</h2>
          <button onClick={() => navigate('/matches')} data-testid="view-all-matches-btn"
            className="text-sm text-primary hover:text-primary/80 flex items-center gap-1 transition-colors">
            View all <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        {(!data?.recent_matches || data.recent_matches.length === 0) ? (
          <div className="p-8 rounded-xl bg-card border border-border/50 text-center">
            <Target className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No matches yet. Set your preferences and click "Find Matches"!</p>
            <button onClick={() => navigate('/preferences')} data-testid="go-preferences-btn"
              className="mt-4 px-4 py-2 bg-primary/10 text-primary rounded-lg text-sm hover:bg-primary/20 transition-colors">
              Set Preferences
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {data.recent_matches.map((m, i) => (
              <div key={m.match_id || i} className="p-4 rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-all flex items-center gap-4 cursor-pointer"
                onClick={() => navigate('/matches')} data-testid={`recent-match-${i}`}>
                <ScoreRing score={m.score || 0} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{m.job?.title || 'Unknown Position'}</p>
                  <p className="text-sm text-muted-foreground truncate">{m.job?.company_name || ''} · {m.job?.location_text || ''}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                  m.status === 'approved' ? 'bg-emerald/10 text-emerald' :
                  m.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                  'bg-amber/10 text-amber'
                }`}>
                  {m.status || 'pending'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
