import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Save, User, Link, FileText } from 'lucide-react';

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getProfile().then(p => { setProfile(p); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.updateProfile(profile);
      setProfile(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div data-testid="profile-page">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading text-3xl font-bold">Profile</h1>
          <p className="text-muted-foreground mt-1">Manage your candidate information</p>
        </div>
        <button onClick={save} disabled={saving} data-testid="save-profile-btn"
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all active:scale-95 ${
            saved ? 'bg-emerald text-white' : 'bg-primary hover:bg-primary/90 text-white'
          }`}>
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Profile'}
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-xl bg-card border border-border/50 p-6">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-5 h-5 text-primary" />
            <h3 className="font-heading text-lg font-semibold">Personal Info</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Full Name</label>
              <input value={profile?.full_name || ''} data-testid="input-full-name"
                onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-transparent focus:border-primary focus:ring-1 focus:ring-primary/50 text-sm transition-all outline-none" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Phone</label>
              <input value={profile?.phone || ''} data-testid="input-phone"
                onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-transparent focus:border-primary focus:ring-1 focus:ring-primary/50 text-sm transition-all outline-none" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Years of Experience</label>
              <input type="number" value={profile?.years_experience || ''} data-testid="input-experience"
                onChange={e => setProfile(p => ({ ...p, years_experience: e.target.value ? parseFloat(e.target.value) : null }))}
                className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-transparent focus:border-primary focus:ring-1 focus:ring-primary/50 text-sm transition-all outline-none" />
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-card border border-border/50 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Link className="w-5 h-5 text-primary" />
            <h3 className="font-heading text-lg font-semibold">Links</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">LinkedIn URL</label>
              <input value={profile?.linkedin_url || ''} data-testid="input-linkedin"
                onChange={e => setProfile(p => ({ ...p, linkedin_url: e.target.value }))}
                placeholder="https://linkedin.com/in/..."
                className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-transparent focus:border-primary focus:ring-1 focus:ring-primary/50 text-sm transition-all outline-none" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">GitHub URL</label>
              <input value={profile?.github_url || ''} data-testid="input-github"
                onChange={e => setProfile(p => ({ ...p, github_url: e.target.value }))}
                placeholder="https://github.com/..."
                className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-transparent focus:border-primary focus:ring-1 focus:ring-primary/50 text-sm transition-all outline-none" />
            </div>
          </div>
        </div>

        <div className="md:col-span-2 rounded-xl bg-card border border-border/50 p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-primary" />
            <h3 className="font-heading text-lg font-semibold">Professional Summary</h3>
          </div>
          <textarea value={profile?.summary || ''} data-testid="input-summary"
            onChange={e => setProfile(p => ({ ...p, summary: e.target.value }))}
            rows={5} placeholder="Describe your experience, skills, and what you're looking for..."
            className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-transparent focus:border-primary focus:ring-1 focus:ring-primary/50 text-sm transition-all outline-none resize-none" />
        </div>
      </div>
    </div>
  );
}
