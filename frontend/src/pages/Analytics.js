import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { BarChart3, TrendingUp, Target, PieChart, Award, Bell } from 'lucide-react';

function Bar({ label, value, max, color }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-16 text-right font-mono">{label}</span>
      <div className="flex-1 h-7 bg-secondary/50 rounded-lg overflow-hidden relative">
        <div className="h-full rounded-lg transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">{value}</span>
      </div>
    </div>
  );
}

function MiniCard({ icon: Icon, label, value, color }) {
  return (
    <div className="p-4 rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="font-heading text-2xl font-bold">{value}</p>
    </div>
  );
}

function ScoreRing({ score, size = 80 }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 80 ? '#10B981' : score >= 60 ? '#3B82F6' : '#F59E0B';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#27272A" strokeWidth="4" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-lg font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAnalytics().then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!data) return <div className="text-center py-20 text-muted-foreground">Failed to load analytics</div>;

  const maxBucket = Math.max(...Object.values(data.score_distribution || {}), 1);
  const bucketColors = { "0-20": "#F43F5E", "21-40": "#F59E0B", "41-60": "#3B82F6", "61-80": "#8B5CF6", "81-100": "#10B981" };

  return (
    <div data-testid="analytics-page">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground mt-1">Match trends, scores, and pipeline insights</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MiniCard icon={Target} label="Total Matches" value={data.total_matches || 0} color="text-primary" />
        <MiniCard icon={Award} label="Avg Score" value={data.average_score || 0} color="text-emerald" />
        <MiniCard icon={Bell} label="Notifications Sent" value={data.notifications?.sent || 0} color="text-violet" />
        <MiniCard icon={TrendingUp} label="Sources" value={Object.keys(data.source_breakdown || {}).length} color="text-amber" />
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <div className="rounded-xl bg-card border border-border/50 p-6" data-testid="score-distribution">
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h3 className="font-heading text-lg font-semibold">Score Distribution</h3>
          </div>
          <div className="space-y-3">
            {Object.entries(data.score_distribution || {}).map(([bucket, count]) => (
              <Bar key={bucket} label={bucket} value={count} max={maxBucket} color={bucketColors[bucket] || '#3B82F6'} />
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-card border border-border/50 p-6" data-testid="status-breakdown">
          <div className="flex items-center gap-2 mb-5">
            <PieChart className="w-5 h-5 text-primary" />
            <h3 className="font-heading text-lg font-semibold">Status Breakdown</h3>
          </div>
          <div className="space-y-3">
            {Object.entries(data.status_breakdown || {}).map(([status, count]) => {
              const colors = { pending: '#F59E0B', approved: '#10B981', rejected: '#F43F5E' };
              return <Bar key={status} label={status} value={count} max={data.total_matches || 1} color={colors[status] || '#3B82F6'} />;
            })}
          </div>
          {Object.keys(data.application_funnel || {}).length > 0 && (
            <div className="mt-6 pt-4 border-t border-border/50">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Application Funnel</p>
              {Object.entries(data.application_funnel).map(([st, cnt]) => (
                <div key={st} className="flex justify-between text-sm py-1">
                  <span className="text-muted-foreground capitalize">{st}</span>
                  <span className="font-bold">{cnt}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <div className="rounded-xl bg-card border border-border/50 p-6" data-testid="source-breakdown">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h3 className="font-heading text-lg font-semibold">Jobs by Source</h3>
          </div>
          {Object.keys(data.source_breakdown || {}).length === 0 ? (
            <p className="text-muted-foreground text-sm">No source data yet</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(data.source_breakdown).map(([src, count]) => (
                <div key={src} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <span className="text-sm font-medium capitalize">{src}</span>
                  <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-bold">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl bg-card border border-border/50 p-6" data-testid="match-trend">
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h3 className="font-heading text-lg font-semibold">Match Trend (30 days)</h3>
          </div>
          {(!data.match_trend || data.match_trend.length === 0) ? (
            <p className="text-muted-foreground text-sm">No trend data yet</p>
          ) : (
            <div className="flex items-end gap-1 h-32">
              {data.match_trend.map((d, i) => {
                const maxCount = Math.max(...data.match_trend.map(x => x.count), 1);
                const h = (d.count / maxCount) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${d.count} matches`}>
                    <span className="text-[10px] text-muted-foreground">{d.count}</span>
                    <div className="w-full rounded-t-sm bg-primary/80 transition-all duration-500" style={{ height: `${h}%`, minHeight: '4px' }} />
                    <span className="text-[8px] text-muted-foreground truncate w-full text-center">{d.date.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {data.top_matches?.length > 0 && (
        <div className="rounded-xl bg-card border border-border/50 p-6" data-testid="top-matches">
          <h3 className="font-heading text-lg font-semibold mb-4">Top Scoring Matches</h3>
          <div className="grid md:grid-cols-5 gap-4">
            {data.top_matches.map((m, i) => (
              <div key={i} className="flex flex-col items-center text-center p-4 rounded-lg bg-secondary/30">
                <ScoreRing score={m.score || 0} />
                <p className="text-sm font-medium mt-2 truncate w-full">{m.job?.title || 'Unknown'}</p>
                <p className="text-xs text-muted-foreground truncate w-full">{m.job?.company_name || ''}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
