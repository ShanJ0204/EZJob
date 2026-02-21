import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { ExternalLink, Check, Clock, Briefcase, ArrowUpRight } from 'lucide-react';

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
        <p className="text-muted-foreground mt-1">Track your approved matches and applications</p>
      </div>

      {apps.length === 0 ? (
        <div className="p-12 rounded-xl bg-card border border-border/50 text-center">
          <Briefcase className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No applications yet. Approve some matches to get started!</p>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
