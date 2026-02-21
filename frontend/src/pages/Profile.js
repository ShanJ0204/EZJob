import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Save, User, Link, FileText, Upload, Trash2, CheckCircle } from 'lucide-react';

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const fileInputRef = useRef(null);

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

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const result = await api.uploadResume(file);
      setUploadResult(result);
      setProfile(p => ({ ...p, resume_filename: result.filename, resume_text: result.text_preview }));
    } catch (e) { alert(e.message); }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteResume = async () => {
    try {
      await api.deleteResume();
      setProfile(p => ({ ...p, resume_filename: null, resume_text: null }));
      setUploadResult(null);
    } catch (e) { alert(e.message); }
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
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all active:scale-95 ${saved ? 'bg-emerald text-white' : 'bg-primary hover:bg-primary/90 text-white'}`}>
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

        <div className="rounded-xl bg-card border border-border/50 p-6" data-testid="resume-section">
          <div className="flex items-center gap-2 mb-4">
            <Upload className="w-5 h-5 text-primary" />
            <h3 className="font-heading text-lg font-semibold">Resume (PDF)</h3>
          </div>
          {profile?.resume_filename ? (
            <div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald/10 border border-emerald/20 mb-3">
                <CheckCircle className="w-5 h-5 text-emerald flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-emerald">{profile.resume_filename}</p>
                  <p className="text-xs text-muted-foreground">Resume uploaded and parsed for AI matching</p>
                </div>
                <button onClick={handleDeleteResume} data-testid="delete-resume-btn"
                  className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {profile.resume_text && (
                <div className="p-3 rounded-lg bg-secondary/30 max-h-32 overflow-y-auto">
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{profile.resume_text.slice(0, 500)}...</p>
                </div>
              )}
            </div>
          ) : (
            <div>
              <input type="file" accept=".pdf" ref={fileInputRef} onChange={handleFileUpload} className="hidden" data-testid="resume-file-input" />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading} data-testid="upload-resume-btn"
                className="w-full p-6 border-2 border-dashed border-border/50 rounded-lg hover:border-primary/50 transition-all text-center cursor-pointer">
                {uploading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-muted-foreground">Parsing PDF...</span>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Click to upload your resume (PDF, max 10MB)</p>
                    <p className="text-xs text-muted-foreground mt-1">Text will be extracted for richer AI matching</p>
                  </>
                )}
              </button>
            </div>
          )}
          {uploadResult && !profile?.resume_filename && (
            <div className="mt-3 p-3 rounded-lg bg-emerald/10 text-sm text-emerald">
              Uploaded! {uploadResult.word_count} words extracted.
            </div>
          )}
        </div>

        <div className="rounded-xl bg-card border border-border/50 p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-primary" />
            <h3 className="font-heading text-lg font-semibold">Professional Summary</h3>
          </div>
          <textarea value={profile?.summary || ''} data-testid="input-summary"
            onChange={e => setProfile(p => ({ ...p, summary: e.target.value }))}
            rows={8} placeholder="Describe your experience, skills, and what you're looking for..."
            className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-transparent focus:border-primary focus:ring-1 focus:ring-primary/50 text-sm transition-all outline-none resize-none" />
        </div>
      </div>
    </div>
  );
}
