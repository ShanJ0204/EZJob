import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Save, Plus, X, MapPin, Briefcase, DollarSign, Bell } from 'lucide-react';

export default function Preferences() {
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newLocation, setNewLocation] = useState('');

  useEffect(() => {
    api.getPreferences().then(p => { setPrefs(p); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.updatePreferences(prefs);
      setPrefs(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  const addTitle = () => {
    if (!newTitle.trim()) return;
    setPrefs(p => ({ ...p, desired_titles: [...(p.desired_titles || []), newTitle.trim()] }));
    setNewTitle('');
  };

  const removeTitle = (idx) => {
    setPrefs(p => ({ ...p, desired_titles: p.desired_titles.filter((_, i) => i !== idx) }));
  };

  const addLocation = () => {
    if (!newLocation.trim()) return;
    setPrefs(p => ({ ...p, preferred_locations: [...(p.preferred_locations || []), newLocation.trim()] }));
    setNewLocation('');
  };

  const removeLocation = (idx) => {
    setPrefs(p => ({ ...p, preferred_locations: p.preferred_locations.filter((_, i) => i !== idx) }));
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div data-testid="preferences-page">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading text-3xl font-bold">Preferences</h1>
          <p className="text-muted-foreground mt-1">Configure your job matching criteria</p>
        </div>
        <button onClick={save} disabled={saving} data-testid="save-preferences-btn"
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all active:scale-95 ${
            saved ? 'bg-emerald text-white' : 'bg-primary hover:bg-primary/90 text-white'
          }`}>
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-xl bg-card border border-border/50 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Briefcase className="w-5 h-5 text-primary" />
            <h3 className="font-heading text-lg font-semibold">Desired Job Titles</h3>
          </div>
          <div className="flex gap-2 mb-3">
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTitle()}
              placeholder="e.g. Frontend Engineer"
              data-testid="input-desired-title"
              className="flex-1 px-3 py-2 rounded-lg bg-secondary/50 border border-transparent focus:border-primary focus:ring-1 focus:ring-primary/50 text-sm transition-all outline-none" />
            <button onClick={addTitle} data-testid="add-title-btn"
              className="px-3 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-all">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(prefs?.desired_titles || []).map((t, i) => (
              <span key={i} className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm" data-testid={`title-tag-${i}`}>
                {t}
                <button onClick={() => removeTitle(i)} className="hover:text-destructive transition-colors"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-card border border-border/50 p-6">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-5 h-5 text-primary" />
            <h3 className="font-heading text-lg font-semibold">Preferred Locations</h3>
          </div>
          <div className="flex gap-2 mb-3">
            <input value={newLocation} onChange={e => setNewLocation(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addLocation()}
              placeholder="e.g. San Francisco"
              data-testid="input-location"
              className="flex-1 px-3 py-2 rounded-lg bg-secondary/50 border border-transparent focus:border-primary focus:ring-1 focus:ring-primary/50 text-sm transition-all outline-none" />
            <button onClick={addLocation} data-testid="add-location-btn"
              className="px-3 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-all">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(prefs?.preferred_locations || []).map((l, i) => (
              <span key={i} className="flex items-center gap-1 px-3 py-1.5 bg-violet/10 text-violet rounded-full text-sm" data-testid={`location-tag-${i}`}>
                {l}
                <button onClick={() => removeLocation(i)} className="hover:text-destructive transition-colors"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-card border border-border/50 p-6">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-5 h-5 text-primary" />
            <h3 className="font-heading text-lg font-semibold">Salary Range</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Minimum</label>
              <input type="number" value={prefs?.min_salary || ''} data-testid="input-min-salary"
                onChange={e => setPrefs(p => ({ ...p, min_salary: e.target.value ? parseInt(e.target.value) : null }))}
                placeholder="50000"
                className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-transparent focus:border-primary focus:ring-1 focus:ring-primary/50 text-sm transition-all outline-none" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Maximum</label>
              <input type="number" value={prefs?.max_salary || ''} data-testid="input-max-salary"
                onChange={e => setPrefs(p => ({ ...p, max_salary: e.target.value ? parseInt(e.target.value) : null }))}
                placeholder="150000"
                className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-transparent focus:border-primary focus:ring-1 focus:ring-primary/50 text-sm transition-all outline-none" />
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-card border border-border/50 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-5 h-5 text-primary" />
            <h3 className="font-heading text-lg font-semibold">Settings</h3>
          </div>
          <div className="space-y-4">
            <label className="flex items-center justify-between cursor-pointer" data-testid="toggle-remote">
              <span className="text-sm">Remote jobs only</span>
              <div className={`relative w-10 h-6 rounded-full transition-colors ${prefs?.remote_only ? 'bg-primary' : 'bg-secondary'}`}
                onClick={() => setPrefs(p => ({ ...p, remote_only: !p.remote_only }))}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${prefs?.remote_only ? 'left-5' : 'left-1'}`} />
              </div>
            </label>
            <label className="flex items-center justify-between cursor-pointer" data-testid="toggle-notifications">
              <span className="text-sm">Enable notifications</span>
              <div className={`relative w-10 h-6 rounded-full transition-colors ${prefs?.notifications_enabled !== false ? 'bg-primary' : 'bg-secondary'}`}
                onClick={() => setPrefs(p => ({ ...p, notifications_enabled: p.notifications_enabled === false ? true : false }))}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${prefs?.notifications_enabled !== false ? 'left-5' : 'left-1'}`} />
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
