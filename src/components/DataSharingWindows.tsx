/**
 * DataSharingWindows Component
 *
 * Power-user UI for defining time periods of data as shareable, locked,
 * or designated as active seed datasets.
 *
 * Features:
 *  - List existing sharing windows with status badges
 *  - Create / edit windows by selecting date ranges and sharing policy
 *  - "Create Seed Dataset" action for windows marked as 'seed'
 *  - Delete windows
 *
 * Design follows the existing slate dark-mode palette used throughout the app.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  Lock,
  Unlock,
  Sprout,
  Plus,
  Pencil,
  Trash2,
  Calendar,
  Globe,
  Users,
  Eye,
  EyeOff,
  Database,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { SharingWindow, SharingStatus, WindowVisibility } from '../types';
import {
  listWindows,
  createWindow,
  updateWindow,
  deleteWindow,
} from '../services/sharingWindowService';
import { createSeedFromWindow } from '../services/seedDatasetService';

// ============================================================
// Sub-components
// ============================================================

interface StatusBadgeProps {
  status: SharingStatus;
}

function StatusBadge({ status }: StatusBadgeProps) {
  const cfg: Record<SharingStatus, { label: string; icon: React.ReactNode; color: string }> = {
    shareable: { label: 'Shareable', icon: <Unlock size={11} />, color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    locked:    { label: 'Locked',    icon: <Lock size={11} />,   color: 'bg-red-500/20 text-red-400 border-red-500/30' },
    seed:      { label: 'Seed',      icon: <Sprout size={11} />, color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  };
  const { label, icon, color } = cfg[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full border ${color}`}>
      {icon}
      {label}
    </span>
  );
}

interface VisibilityBadgeProps {
  visibility: WindowVisibility;
}

function VisibilityBadge({ visibility }: VisibilityBadgeProps) {
  const cfg: Record<WindowVisibility, { icon: React.ReactNode; label: string; color: string }> = {
    private:   { icon: <EyeOff size={11} />, label: 'Private',   color: 'text-slate-400' },
    community: { icon: <Users size={11} />,  label: 'Community', color: 'text-blue-400' },
    public:    { icon: <Globe size={11} />,  label: 'Public',    color: 'text-amber-400' },
  };
  const { icon, label, color } = cfg[visibility];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] ${color}`}>
      {icon}
      {label}
    </span>
  );
}

// ============================================================
// Window Form (create / edit)
// ============================================================

interface WindowFormValues {
  label: string;
  startDate: string;
  endDate: string;
  sharingStatus: SharingStatus;
  visibility: WindowVisibility;
  licenseOverride: string;
}

const defaultFormValues = (): WindowFormValues => ({
  label: '',
  startDate: '',
  endDate: '',
  sharingStatus: 'locked',
  visibility: 'private',
  licenseOverride: '',
});

interface WindowFormProps {
  initial?: Partial<WindowFormValues>;
  onSave: (values: WindowFormValues) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}

function WindowForm({ initial, onSave, onCancel, isSaving }: WindowFormProps) {
  const [values, setValues] = useState<WindowFormValues>({
    ...defaultFormValues(),
    ...initial,
  });

  const set = (field: keyof WindowFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setValues(prev => ({ ...prev, [field]: e.target.value }));

  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
      {/* Label */}
      <div>
        <label className="block text-xs text-slate-400 mb-1">Label *</label>
        <input
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="e.g. Q1 2025 Historical Maps"
          value={values.label}
          onChange={set('label')}
        />
      </div>

      {/* Date range */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Start date</label>
          <input
            type="datetime-local"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            value={values.startDate}
            onChange={set('startDate')}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">End date</label>
          <input
            type="datetime-local"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            value={values.endDate}
            onChange={set('endDate')}
          />
        </div>
      </div>

      {/* Sharing status */}
      <div>
        <label className="block text-xs text-slate-400 mb-1">Sharing status *</label>
        <select
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          value={values.sharingStatus}
          onChange={set('sharingStatus')}
        >
          <option value="locked">🔒 Locked — stays local-only</option>
          <option value="shareable">🔓 Shareable — syncs to cloud</option>
          <option value="seed">🌱 Seed — used for onboarding</option>
        </select>
      </div>

      {/* Visibility */}
      <div>
        <label className="block text-xs text-slate-400 mb-1">Window visibility</label>
        <select
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          value={values.visibility}
          onChange={set('visibility')}
        >
          <option value="private">🔒 Private — only you see this window</option>
          <option value="community">👥 Community — community members can see</option>
          <option value="public">🌐 Public — anyone can see</option>
        </select>
      </div>

      {/* License override (shown only for shareable/seed) */}
      {(values.sharingStatus === 'shareable' || values.sharingStatus === 'seed') && (
        <div>
          <label className="block text-xs text-slate-400 mb-1">License override</label>
          <input
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="e.g. CC0 — leave blank to use per-document license"
            value={values.licenseOverride}
            onChange={set('licenseOverride')}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onSave(values)}
          disabled={isSaving || !values.label.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm rounded-lg font-medium transition-colors"
        >
          {isSaving && <RefreshCw size={14} className="animate-spin" />}
          Save window
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-slate-400 hover:text-white text-sm rounded-lg hover:bg-slate-700 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Window Card
// ============================================================

interface WindowCardProps {
  window: SharingWindow;
  onEdit: (w: SharingWindow) => void;
  onDelete: (id: string) => void;
  onCreateSeed: (windowId: string) => void;
  isCreatingSeed: boolean;
}

function WindowCard({ window: w, onEdit, onDelete, onCreateSeed, isCreatingSeed }: WindowCardProps) {
  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '∞';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 hover:border-slate-700 transition-colors">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{w.label}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <Calendar size={11} className="text-slate-500" />
            <span className="text-[11px] text-slate-500">
              {formatDate(w.startDate)} → {formatDate(w.endDate)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <StatusBadge status={w.sharingStatus} />
          <VisibilityBadge visibility={w.visibility} />
        </div>
      </div>

      {/* License override info */}
      {w.licenseOverride && (
        <p className="text-[11px] text-slate-500">
          License override: <span className="text-slate-300">{w.licenseOverride}</span>
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => onEdit(w)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
        >
          <Pencil size={12} />
          Edit
        </button>

        {w.sharingStatus === 'seed' && (
          <button
            onClick={() => onCreateSeed(w.id)}
            disabled={isCreatingSeed}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 rounded-lg transition-colors disabled:opacity-50"
          >
            {isCreatingSeed ? <RefreshCw size={12} className="animate-spin" /> : <Database size={12} />}
            Create seed dataset
          </button>
        )}

        <button
          onClick={() => onDelete(w.id)}
          className="ml-auto flex items-center gap-1 px-3 py-1.5 text-xs text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors"
        >
          <Trash2 size={12} />
          Delete
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Main component
// ============================================================

interface DataSharingWindowsProps {
  className?: string;
}

export default function DataSharingWindows({ className = '' }: DataSharingWindowsProps) {
  const [windows, setWindows] = useState<SharingWindow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  // Form state
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Seed creation state
  const [creatingSeedFor, setCreatingSeedFor] = useState<string | null>(null);
  const [seedMessage, setSeedMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listWindows();
      setWindows(data);
    } catch {
      setError('Failed to load sharing windows.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Save (create or update) ──────────────────────────────
  const handleSave = useCallback(async (values: WindowFormValues) => {
    setIsSaving(true);
    try {
      if (editingId) {
        const updated = await updateWindow(editingId, {
          label:            values.label,
          start_date:       values.startDate || null,
          end_date:         values.endDate   || null,
          sharing_status:   values.sharingStatus,
          visibility:       values.visibility,
          license_override: values.licenseOverride || null,
        });
        if (updated) {
          setWindows(prev => prev.map(w => w.id === editingId ? updated : w));
          setEditingId(null);
        }
      } else {
        const created = await createWindow({
          label:            values.label,
          start_date:       values.startDate || null,
          end_date:         values.endDate   || null,
          sharing_status:   values.sharingStatus,
          visibility:       values.visibility,
          license_override: values.licenseOverride || null,
        });
        if (created) {
          setWindows(prev => [created, ...prev]);
          setIsCreating(false);
        }
      }
    } finally {
      setIsSaving(false);
    }
  }, [editingId]);

  // ── Delete ──────────────────────────────────────────────
  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm('Delete this sharing window? Documents within it will default to locked.')) return;
    const ok = await deleteWindow(id);
    if (ok) setWindows(prev => prev.filter(w => w.id !== id));
  }, []);

  // ── Create seed dataset ─────────────────────────────────
  const handleCreateSeed = useCallback(async (windowId: string) => {
    setCreatingSeedFor(windowId);
    setSeedMessage(null);
    try {
      const seed = await createSeedFromWindow(windowId);
      if (seed) {
        setSeedMessage({ type: 'success', text: `Seed dataset "${seed.title}" created with ${seed.documentIds.length} documents.` });
      } else {
        setSeedMessage({ type: 'error', text: 'Failed to create seed dataset. Make sure the window contains shareable documents.' });
      }
    } catch (e: any) {
      setSeedMessage({ type: 'error', text: e?.message ?? 'Unexpected error.' });
    } finally {
      setCreatingSeedFor(null);
    }
  }, []);

  // ── Helpers ─────────────────────────────────────────────
  const getInitialForEdit = (w: SharingWindow): Partial<WindowFormValues> => ({
    label:          w.label,
    startDate:      w.startDate ? w.startDate.slice(0, 16) : '',
    endDate:        w.endDate   ? w.endDate.slice(0, 16)   : '',
    sharingStatus:  w.sharingStatus,
    visibility:     w.visibility,
    licenseOverride: w.licenseOverride ?? '',
  });

  const counts = {
    shareable: windows.filter(w => w.sharingStatus === 'shareable').length,
    locked:    windows.filter(w => w.sharingStatus === 'locked').length,
    seed:      windows.filter(w => w.sharingStatus === 'seed').length,
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Section header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(v => !v)}
          className="flex items-center gap-2 text-left"
          aria-expanded={isExpanded}
        >
          <Lock size={16} className="text-primary-400" />
          <span className="text-sm font-bold text-white">Data Sharing Windows</span>
          {isExpanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
        </button>

        <div className="flex items-center gap-3">
          {/* Summary badges */}
          <div className="hidden sm:flex items-center gap-2">
            {counts.shareable > 0 && (
              <span className="text-[10px] text-emerald-400">{counts.shareable} shareable</span>
            )}
            {counts.locked > 0 && (
              <span className="text-[10px] text-red-400">{counts.locked} locked</span>
            )}
            {counts.seed > 0 && (
              <span className="text-[10px] text-purple-400">{counts.seed} seed</span>
            )}
          </div>

          <button
            onClick={() => { setIsCreating(true); setEditingId(null); setIsExpanded(true); }}
            className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white text-xs rounded-lg font-medium transition-colors"
          >
            <Plus size={13} />
            New window
          </button>
        </div>
      </div>

      {!isExpanded ? null : (
        <div className="space-y-3">
          {/* Description */}
          <p className="text-xs text-slate-500">
            Define time ranges of your data and set whether they are{' '}
            <span className="text-red-400 font-medium">locked</span> (local-only),{' '}
            <span className="text-emerald-400 font-medium">shareable</span> (synced to cloud), or{' '}
            <span className="text-purple-400 font-medium">seed</span> (offered to new users during onboarding).
          </p>

          {/* Create form */}
          {isCreating && (
            <WindowForm
              onSave={handleSave}
              onCancel={() => setIsCreating(false)}
              isSaving={isSaving}
            />
          )}

          {/* Seed feedback */}
          {seedMessage && (
            <div className={`flex items-start gap-2 p-3 rounded-lg text-xs ${
              seedMessage.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border border-red-500/30 text-red-300'
            }`}>
              {seedMessage.type === 'success'
                ? <CheckCircle size={14} className="flex-shrink-0 mt-0.5" />
                : <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />}
              {seedMessage.text}
            </div>
          )}

          {/* Loading / error */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw size={16} className="animate-spin text-slate-500 mr-2" />
              <span className="text-xs text-slate-500">Loading windows…</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {/* Window list */}
          {!isLoading && !error && windows.length === 0 && !isCreating && (
            <div className="text-center py-8 text-slate-600">
              <Lock size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No sharing windows yet.</p>
              <p className="text-xs mt-1">Create one to start controlling data visibility.</p>
            </div>
          )}

          {windows.map(w => (
            editingId === w.id ? (
              <WindowForm
                key={w.id}
                initial={getInitialForEdit(w)}
                onSave={handleSave}
                onCancel={() => setEditingId(null)}
                isSaving={isSaving}
              />
            ) : (
              <WindowCard
                key={w.id}
                window={w}
                onEdit={win => { setEditingId(win.id); setIsCreating(false); }}
                onDelete={handleDelete}
                onCreateSeed={handleCreateSeed}
                isCreatingSeed={creatingSeedFor === w.id}
              />
            )
          ))}
        </div>
      )}
    </div>
  );
}
