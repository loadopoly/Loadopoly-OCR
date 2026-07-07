/**
 * OperateHome — the capture-first front door of the app.
 *
 * Operability goals:
 *   • one tap from app-open to a live viewfinder ("Start Capture")
 *   • field sessions organized into supply-chain projects
 *   • a visible pipeline to the Supply Chain Brain (export / uplink status)
 *   • zero configuration required — everything works offline-first
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Camera,
  Plus,
  ChevronRight,
  FolderKanban,
  Brain,
  Link2,
  CheckCircle2,
  CircleDashed,
  Settings2,
  X,
  Loader2,
  Network,
  Image as ImageIcon,
  Zap,
  Cpu,
} from 'lucide-react';
import {
  CaptureProject,
  CaptureSession,
  CapturePresetId,
  COVERAGE_SECTORS,
} from '../../capture/types';
import { CAPTURE_PRESETS, PRESET_ORDER } from '../../capture/presets';
import {
  createProject,
  createSession,
  countPendingUplink,
  ensureDefaultProject,
  listProjects,
  listSessions,
} from '../../capture/sessionStore';
import { getIntakeUrl, setIntakeUrl, probeIntake } from '../../capture/scbUplink';
import PhotogrammetryCapture from './PhotogrammetryCapture';
import SessionDetail from './SessionDetail';
import { announce } from '../../lib/accessibility';

interface Props {
  onSwitchTab: (tab: string) => void;
  /** Existing OCR ingest entry point — lets capture photos feed the legacy pipeline */
  onIngestFile?: (file: File, source: string) => void;
  operatorEmail?: string;
}

const STATUS_META: Record<CaptureSession['status'], { label: string; cls: string }> = {
  ACTIVE: { label: 'In progress', cls: 'bg-primary-500/15 text-primary-300 border-primary-500/30' },
  COMPLETE: { label: 'Ready to send', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  EXPORTED: { label: 'Exported', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  UPLINKED: { label: 'In the Brain', cls: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
};

interface BrainStatus {
  available: boolean;
  reason?: string;
  mesh: {
    observer?: number;
    synchrony?: number;
    expansion_phase?: string;
    node_count?: number;
    ran_at?: string;
  };
  learning?: { count_24h: number; last?: { kind: string; title: string; signal_strength: number; logged_at: string } } | null;
  last_daily_dispatch?: string | null;
}

export default function OperateHome({ onSwitchTab, onIngestFile, operatorEmail = '' }: Props) {
  const [project, setProject] = useState<CaptureProject | null>(null);
  const [projects, setProjects] = useState<CaptureProject[]>([]);
  const [sessions, setSessions] = useState<CaptureSession[]>([]);
  const [pending, setPending] = useState({ sessions: 0, photos: 0 });
  const [intakeReachable, setIntakeReachable] = useState<boolean | null>(null);

  const [showPresets, setShowPresets] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [showIntakeConfig, setShowIntakeConfig] = useState(false);
  const [intakeDraft, setIntakeDraft] = useState('');
  const [newProjName, setNewProjName] = useState('');
  const [newProjSite, setNewProjSite] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  const [captureSession, setCaptureSession] = useState<CaptureSession | null>(null);
  const [detailSession, setDetailSession] = useState<CaptureSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [brainStatus, setBrainStatus] = useState<BrainStatus | null>(null);

  const refresh = useCallback(async (proj?: CaptureProject | null) => {
    const p = proj ?? (await ensureDefaultProject());
    const [projList, sessionList, pendingCounts] = await Promise.all([
      listProjects(),
      listSessions(p.id),
      countPendingUplink(),
    ]);
    setProject(p);
    setProjects(projList);
    setSessions(sessionList);
    setPending(pendingCounts);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    if (getIntakeUrl()) {
      probeIntake().then(ok => !cancelled && setIntakeReachable(ok));
    } else {
      setIntakeReachable(null);
    }
    return () => {
      cancelled = true;
    };
  }, [showIntakeConfig]);

  useEffect(() => {
    const url = getIntakeUrl();
    if (!url) return;
    const base = url.replace(/\/intake\/?$/, '').replace(/\/$/, '');
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`${base}/brain-status`, {
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok && !cancelled) setBrainStatus(await res.json());
      } catch { /* offline */ }
    };
    poll();
    const id = setInterval(poll, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [intakeReachable]);

  // ---------------------------------------------------------------- actions

  const startCapture = useCallback(
    async (presetId: CapturePresetId) => {
      if (!project) return;
      const preset = CAPTURE_PRESETS[presetId];
      const stamp = new Date().toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const session = await createSession(
        project.id,
        presetId,
        `${preset.label} — ${stamp}`,
        operatorEmail,
      );
      setShowPresets(false);
      setCaptureSession(session);
      announce(`${preset.label} capture started.`);
    },
    [operatorEmail, project],
  );

  const exitCapture = useCallback(
    async (finished: boolean) => {
      const justCaptured = captureSession;
      setCaptureSession(null);
      await refresh(project);
      if (finished && justCaptured) {
        const fresh = (await listSessions(justCaptured.projectId)).find(
          s => s.id === justCaptured.id,
        );
        if (fresh) setDetailSession(fresh);
      }
    },
    [captureSession, project, refresh],
  );

  const handleCreateProject = useCallback(async () => {
    if (!newProjName.trim()) return;
    setCreatingProject(true);
    const p = await createProject(newProjName, newProjSite, '', ['supply-chain-optimization']);
    setNewProjName('');
    setNewProjSite('');
    setCreatingProject(false);
    setShowProjects(false);
    await refresh(p);
  }, [newProjName, newProjSite, refresh]);

  const saveIntakeUrl = useCallback(() => {
    setIntakeUrl(intakeDraft);
    setShowIntakeConfig(false);
    setIntakeReachable(null);
    if (intakeDraft.trim()) probeIntake().then(setIntakeReachable);
  }, [intakeDraft]);

  const sendToOCR = useCallback(
    (files: File[]) => {
      if (!onIngestFile) return;
      files.forEach(f => onIngestFile(f, 'Operate Capture'));
    },
    [onIngestFile],
  );

  // ---------------------------------------------------------------- render

  if (captureSession && project) {
    return (
      <PhotogrammetryCapture
        session={captureSession}
        project={project}
        onExit={exitCapture}
      />
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-24 animate-fade-in">
      {/* Hero — Start Capture */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-primary-950/60 p-6 sm:p-8">
        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-primary-600/10 blur-3xl pointer-events-none" />
        <p className="text-primary-300 text-xs font-bold uppercase tracking-widest">Operate Console</p>
        <h1 className="text-white text-2xl sm:text-3xl font-bold mt-1">
          Capture the field.<br className="sm:hidden" /> Feed the Brain.
        </h1>
        <p className="text-slate-400 text-sm mt-2 max-w-md">
          Guided photogrammetry capture for stockpiles, equipment, pallets and paperwork —
          bundled with GPS + pose and delivered to the Supply Chain Brain.
        </p>
        <button
          onClick={() => setShowPresets(true)}
          className="mt-5 w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 active:scale-[0.98] text-white font-bold text-lg shadow-glow transition-all"
        >
          <Camera size={24} aria-hidden="true" />
          Start Capture
        </button>
      </section>

      {/* Project + Brain pipeline row */}
      <div className="grid sm:grid-cols-2 gap-3">
        <button
          onClick={() => setShowProjects(true)}
          className="text-left bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase">
              <FolderKanban size={14} aria-hidden="true" /> Project
            </span>
            <ChevronRight size={16} className="text-slate-600" aria-hidden="true" />
          </div>
          <p className="text-white font-semibold mt-1.5 truncate">{project?.name ?? '…'}</p>
          <p className="text-slate-500 text-xs mt-0.5">
            Site {project?.site ?? '—'} · {sessions.length} session{sessions.length === 1 ? '' : 's'}
          </p>
        </button>

        <button
          onClick={() => {
            setIntakeDraft(getIntakeUrl());
            setShowIntakeConfig(true);
          }}
          className="text-left bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase">
              <Brain size={14} aria-hidden="true" /> Supply Chain Brain
            </span>
            <Settings2 size={16} className="text-slate-600" aria-hidden="true" />
          </div>
          <p className="text-white font-semibold mt-1.5">
            {pending.sessions === 0 ? (
              <span className="flex items-center gap-1.5 text-emerald-400 text-sm font-semibold">
                <CheckCircle2 size={15} aria-hidden="true" /> All sessions delivered
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-amber-300 text-sm font-semibold">
                <CircleDashed size={15} aria-hidden="true" />
                {pending.sessions} session{pending.sessions === 1 ? '' : 's'} / {pending.photos} photos to send
              </span>
            )}
          </p>
          <p className="text-slate-500 text-xs mt-0.5 flex items-center gap-1">
            <Link2 size={11} aria-hidden="true" />
            {getIntakeUrl()
              ? intakeReachable === null
                ? 'Intake configured'
                : intakeReachable
                  ? 'Intake online'
                  : 'Intake unreachable — export ZIP instead'
              : 'No live intake — export ZIP to inbox'}
          </p>
        </button>
      </div>

      {/* SCB Daily Update — MESH status */}
      {brainStatus?.available && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Cpu size={14} className="text-violet-400" aria-hidden="true" />
            <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">SCB Daily Update</span>
            {brainStatus.mesh.expansion_phase && (
              <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                brainStatus.mesh.expansion_phase === 'broaden'
                  ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                  : 'bg-violet-500/15 text-violet-300 border-violet-500/30'
              }`}>
                {brainStatus.mesh.expansion_phase}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {brainStatus.mesh.observer != null && (
              <div className="bg-slate-950/60 rounded-xl p-2.5">
                <p className="text-slate-500 text-[10px] font-semibold uppercase">MESH Ω</p>
                <p className="text-white font-bold text-sm mt-0.5">
                  {(brainStatus.mesh.observer * 100).toFixed(0)}%
                </p>
              </div>
            )}
            {brainStatus.mesh.synchrony != null && (
              <div className="bg-slate-950/60 rounded-xl p-2.5">
                <p className="text-slate-500 text-[10px] font-semibold uppercase">Sync</p>
                <p className="text-white font-bold text-sm mt-0.5">
                  {(brainStatus.mesh.synchrony * 100).toFixed(0)}%
                </p>
              </div>
            )}
            {brainStatus.mesh.node_count != null && (
              <div className="bg-slate-950/60 rounded-xl p-2.5">
                <p className="text-slate-500 text-[10px] font-semibold uppercase">Nodes</p>
                <p className="text-white font-bold text-sm mt-0.5">{brainStatus.mesh.node_count}</p>
              </div>
            )}
            {brainStatus.learning != null && (
              <div className="bg-slate-950/60 rounded-xl p-2.5">
                <p className="text-slate-500 text-[10px] font-semibold uppercase">24h activity</p>
                <p className="text-white font-bold text-sm mt-0.5">{brainStatus.learning.count_24h}</p>
              </div>
            )}
          </div>
          {(brainStatus.last_daily_dispatch || brainStatus.mesh.ran_at) && (
            <p className="text-slate-600 text-[10px] mt-2.5">
              {brainStatus.last_daily_dispatch && (
                <>Dispatch sent {new Date(brainStatus.last_daily_dispatch).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</>
              )}
              {brainStatus.last_daily_dispatch && brainStatus.mesh.ran_at && ' · '}
              {brainStatus.mesh.ran_at && (
                <>MESH updated {new Date(brainStatus.mesh.ran_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</>
              )}
            </p>
          )}
        </div>
      )}

      {/* Sessions */}
      <section>
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="text-white font-bold text-sm uppercase tracking-wide">Capture sessions</h2>
          {sessions.length > 0 && (
            <span className="text-slate-500 text-xs">{sessions.length} in {project?.name}</span>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 size={22} className="animate-spin text-slate-600" aria-label="Loading" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="border border-dashed border-slate-800 rounded-2xl p-8 text-center">
            <Camera size={28} className="mx-auto text-slate-700" aria-hidden="true" />
            <p className="text-slate-400 text-sm mt-3 font-medium">No sessions yet</p>
            <p className="text-slate-600 text-xs mt-1 max-w-xs mx-auto">
              Tap <span className="text-primary-400 font-semibold">Start Capture</span>, pick what you're
              shooting, and walk the orbit — the HUD does the rest.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map(s => {
              const preset = CAPTURE_PRESETS[s.preset];
              const meta = STATUS_META[s.status];
              const coverage = preset.orbit
                ? Math.round((s.sectorsFilled.length / COVERAGE_SECTORS) * 100)
                : null;
              return (
                <button
                  key={s.id}
                  onClick={() => setDetailSession(s)}
                  className="w-full text-left bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-2xl p-4 flex items-center gap-4 transition-colors"
                >
                  <span className="text-2xl shrink-0" aria-hidden="true">{preset.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{s.name}</p>
                    <p className="text-slate-500 text-xs mt-0.5">
                      {s.photoCount} photos
                      {coverage !== null && ` · ${coverage}% orbit`}
                      {' · '}
                      {new Date(s.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full border text-[10px] font-bold shrink-0 ${meta.cls}`}>
                    {meta.label}
                  </span>
                  <ChevronRight size={16} className="text-slate-600 shrink-0" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Workspace shortcuts */}
      <section>
        <h2 className="text-white font-bold text-sm uppercase tracking-wide mb-2 px-1">Workspace</h2>
        <div className="grid grid-cols-3 gap-2">
          {[
            { tab: 'assets', label: 'Assets', icon: ImageIcon },
            { tab: 'graph', label: 'Knowledge Graph', icon: Network },
            { tab: 'batch', label: 'Processing', icon: Zap },
          ].map(({ tab, label, icon: Icon }) => (
            <button
              key={tab}
              onClick={() => onSwitchTab(tab)}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-3 flex flex-col items-center gap-1.5 text-slate-300 hover:text-white transition-colors"
            >
              <Icon size={18} aria-hidden="true" />
              <span className="text-[11px] font-semibold text-center leading-tight">{label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ---------- Preset picker sheet ---------- */}
      {showPresets && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Choose capture type">
          <div className="bg-slate-950 border border-slate-800 sm:rounded-3xl rounded-t-3xl w-full sm:max-w-lg max-h-[88vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-950/95 backdrop-blur flex items-center justify-between p-5 pb-3 border-b border-slate-800/60">
              <h2 className="text-white font-bold">What are you capturing?</h2>
              <button onClick={() => setShowPresets(false)} aria-label="Close" className="p-2 text-slate-400 hover:text-white rounded-full">
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="p-4 space-y-2">
              {PRESET_ORDER.map(id => {
                const p = CAPTURE_PRESETS[id];
                return (
                  <button
                    key={id}
                    onClick={() => startCapture(id)}
                    className="w-full text-left bg-slate-900 border border-slate-800 hover:border-primary-600/60 hover:bg-slate-900/60 rounded-2xl p-4 flex items-start gap-3 transition-colors"
                  >
                    <span className="text-2xl shrink-0" aria-hidden="true">{p.emoji}</span>
                    <div className="min-w-0">
                      <p className="text-white font-bold text-sm">{p.label}</p>
                      <p className="text-slate-400 text-xs mt-0.5">{p.tagline}</p>
                      <p className="text-primary-300/80 text-[11px] mt-1">→ {p.scbUse}</p>
                    </div>
                    <span className="ml-auto text-slate-600 text-[10px] font-bold shrink-0 mt-1">
                      ~{p.targetPhotos} shots
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ---------- Project switcher ---------- */}
      {showProjects && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Projects">
          <div className="bg-slate-950 border border-slate-800 sm:rounded-3xl rounded-t-3xl w-full sm:max-w-lg max-h-[88vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-950/95 backdrop-blur flex items-center justify-between p-5 pb-3 border-b border-slate-800/60">
              <h2 className="text-white font-bold">Supply chain projects</h2>
              <button onClick={() => setShowProjects(false)} aria-label="Close" className="p-2 text-slate-400 hover:text-white rounded-full">
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="p-4 space-y-2">
              {projects.map(p => (
                <button
                  key={p.id}
                  onClick={async () => {
                    setShowProjects(false);
                    setLoading(true);
                    await refresh(p);
                  }}
                  className={`w-full text-left rounded-2xl p-4 border transition-colors ${
                    p.id === project?.id
                      ? 'bg-primary-950/40 border-primary-600/50'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-600'
                  }`}
                >
                  <p className="text-white font-semibold text-sm">{p.name}</p>
                  <p className="text-slate-500 text-xs mt-0.5">Site {p.site} · created {new Date(p.createdAt).toLocaleDateString()}</p>
                </button>
              ))}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
                <p className="text-slate-300 text-xs font-bold uppercase flex items-center gap-1.5">
                  <Plus size={13} aria-hidden="true" /> New project
                </p>
                <input
                  value={newProjName}
                  onChange={e => setNewProjName(e.target.value)}
                  placeholder="Project name (e.g. CHA Yard Digitization)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-primary-500"
                />
                <input
                  value={newProjSite}
                  onChange={e => setNewProjSite(e.target.value)}
                  placeholder="Site code (e.g. CHA)"
                  maxLength={8}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-primary-500"
                />
                <button
                  onClick={handleCreateProject}
                  disabled={!newProjName.trim() || creatingProject}
                  className="w-full py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-40 text-white text-sm font-bold"
                >
                  {creatingProject ? 'Creating…' : 'Create project'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Intake config ---------- */}
      {showIntakeConfig && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-5" role="dialog" aria-modal="true" aria-label="Brain intake settings">
          <div className="bg-slate-950 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold flex items-center gap-2">
                <Brain size={18} aria-hidden="true" /> Brain intake
              </h2>
              <button onClick={() => setShowIntakeConfig(false)} aria-label="Close" className="p-2 text-slate-400 hover:text-white rounded-full">
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              Two ways into the Supply Chain Brain:
              <br />• <span className="text-slate-200 font-semibold">Export ZIP</span> (always works): drop the bundle into{' '}
              <code className="text-primary-300">pipeline/data/photogrammetry/inbox</code> and run{' '}
              <code className="text-primary-300">python -m src.photogrammetry</code>.
              <br />• <span className="text-slate-200 font-semibold">Live uplink</span>: POST bundles to an HTTP intake in front of the watcher.
            </p>
            <input
              value={intakeDraft}
              onChange={e => setIntakeDraft(e.target.value)}
              placeholder="https://brain-host:8787/intake (optional)"
              inputMode="url"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-primary-500"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowIntakeConfig(false)} className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold">
                Cancel
              </button>
              <button onClick={saveIntakeUrl} className="flex-1 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-bold">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Session detail ---------- */}
      {detailSession && project && (
        <SessionDetail
          session={detailSession}
          project={project}
          onClose={() => setDetailSession(null)}
          onResume={s => {
            setDetailSession(null);
            setCaptureSession(s);
          }}
          onChanged={() => refresh(project)}
          onSendToOCR={onIngestFile ? sendToOCR : undefined}
        />
      )}
    </div>
  );
}
