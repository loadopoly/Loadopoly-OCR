/**
 * SessionDetail — review a capture session, export the SCB bundle,
 * uplink it to the Brain, resume capture, or delete.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X,
  Download,
  Send,
  Trash2,
  Camera,
  MapPin,
  AlertTriangle,
  CheckCircle,
  Loader2,
  FileJson,
} from 'lucide-react';
import {
  CapturePhoto,
  CaptureProject,
  CaptureSession,
  COVERAGE_SECTORS,
} from '../../capture/types';
import { CAPTURE_PRESETS } from '../../capture/presets';
import { listPhotos, deleteSession, setSessionStatus } from '../../capture/sessionStore';
import { buildBundle, downloadBlob } from '../../capture/manifest';
import { uplinkBundle, getIntakeUrl } from '../../capture/scbUplink';
import { announce } from '../../lib/accessibility';

interface Props {
  session: CaptureSession;
  project: CaptureProject;
  onClose: () => void;
  onResume: (session: CaptureSession) => void;
  onChanged: () => void;
  /** Optional hand-off of photos into the legacy OCR → knowledge-graph pipeline */
  onSendToOCR?: (files: File[]) => void;
}

export default function SessionDetail({
  session,
  project,
  onClose,
  onResume,
  onChanged,
  onSendToOCR,
}: Props) {
  const preset = CAPTURE_PRESETS[session.preset];
  const [photos, setPhotos] = useState<CapturePhoto[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState<'export' | 'uplink' | 'ocr' | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listPhotos(session.id).then(rows => {
      if (cancelled) return;
      setPhotos(rows);
      const urls = new Map<string, string>();
      rows.forEach(p => urls.set(p.id, URL.createObjectURL(p.blob)));
      setThumbUrls(urls);
    });
    return () => {
      cancelled = true;
      setThumbUrls(prev => {
        prev.forEach(url => URL.revokeObjectURL(url));
        return new Map();
      });
    };
  }, [session.id]);

  const flagged = useMemo(
    () => photos.filter(p => p.quality.blurry || p.quality.badExposure).length,
    [photos],
  );
  const geotagged = useMemo(
    () => photos.filter(p => p.pose.lat !== null).length,
    [photos],
  );

  const handleExport = useCallback(async () => {
    setBusy('export');
    try {
      const { blob, fileName } = await buildBundle(session, project, photos);
      downloadBlob(blob, fileName);
      await setSessionStatus(session.id, 'EXPORTED');
      setNotice({
        text: `Bundle downloaded — drop it into Supply-Chain-Brain/pipeline/data/photogrammetry/inbox and run: python -m src.photogrammetry`,
        ok: true,
      });
      announce('Bundle exported.');
      onChanged();
    } catch {
      setNotice({ text: 'Export failed — try again.', ok: false });
    } finally {
      setBusy(null);
    }
  }, [onChanged, photos, project, session]);

  const handleUplink = useCallback(async () => {
    setBusy('uplink');
    try {
      const { blob, fileName } = await buildBundle(session, project, photos);
      const result = await uplinkBundle(blob, fileName, session.id);
      if (result.ok) {
        await setSessionStatus(session.id, 'UPLINKED');
        onChanged();
      }
      setNotice({ text: result.message, ok: result.ok });
      announce(result.message);
    } finally {
      setBusy(null);
    }
  }, [onChanged, photos, project, session]);

  const handleSendToOCR = useCallback(() => {
    if (!onSendToOCR) return;
    setBusy('ocr');
    const files = photos.map(
      p => new File([p.blob], p.fileName, { type: 'image/jpeg' }),
    );
    onSendToOCR(files);
    setBusy(null);
    setNotice({ text: `${files.length} photos queued in the OCR pipeline.`, ok: true });
  }, [onSendToOCR, photos]);

  const handleDelete = useCallback(async () => {
    await deleteSession(session.id);
    announce('Session deleted.');
    onChanged();
    onClose();
  }, [onChanged, onClose, session.id]);

  const statusChip = {
    ACTIVE: 'bg-primary-500/20 text-primary-300',
    COMPLETE: 'bg-emerald-500/20 text-emerald-300',
    EXPORTED: 'bg-sky-500/20 text-sky-300',
    UPLINKED: 'bg-violet-500/20 text-violet-300',
  }[session.status];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={`Session ${session.name}`}>
      <div className="bg-slate-950 border border-slate-800 sm:rounded-3xl rounded-t-3xl w-full sm:max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-800">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span>{preset.emoji}</span>
              <h2 className="text-white font-bold truncate">{session.name}</h2>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusChip}`}>
                {session.status}
              </span>
            </div>
            <p className="text-slate-400 text-xs mt-1">
              {project.name} · {preset.label} · {new Date(session.startedAt).toLocaleString()}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full shrink-0">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 p-5 pb-3">
          {[
            { label: 'Photos', value: String(photos.length) },
            {
              label: 'Coverage',
              value: preset.orbit
                ? `${Math.round((session.sectorsFilled.length / COVERAGE_SECTORS) * 100)}%`
                : '—',
            },
            { label: 'Geotagged', value: `${geotagged}/${photos.length}` },
            { label: 'Flagged', value: String(flagged), warn: flagged > 0 },
          ].map(s => (
            <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
              <p className={`text-lg font-bold tabular-nums ${s.warn ? 'text-amber-400' : 'text-white'}`}>{s.value}</p>
              <p className="text-slate-500 text-[10px] uppercase font-bold">{s.label}</p>
            </div>
          ))}
        </div>

        {session.origin && (
          <p className="px-5 pb-2 text-xs text-slate-400 flex items-center gap-1.5">
            <MapPin size={12} aria-hidden="true" className="text-emerald-400" />
            Origin {session.origin.lat.toFixed(5)}, {session.origin.lng.toFixed(5)}
            {session.origin.accuracyM !== null && ` (±${Math.round(session.origin.accuracyM)} m)`}
          </p>
        )}

        {/* Photo grid */}
        <div className="flex-1 overflow-y-auto px-5 pb-3">
          {photos.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-8">No photos yet — resume the session to start capturing.</p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
              {photos.map(p => (
                <div key={p.id} className="relative aspect-square">
                  <img
                    src={thumbUrls.get(p.id)}
                    alt={`Photo ${p.index + 1}`}
                    loading="lazy"
                    className={`w-full h-full object-cover rounded-lg ${
                      p.quality.blurry || p.quality.badExposure ? 'ring-2 ring-amber-400/80' : ''
                    }`}
                  />
                  {(p.quality.blurry || p.quality.badExposure) && (
                    <AlertTriangle size={11} className="absolute top-1 left-1 text-amber-400" aria-label="Flagged" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notice */}
        {notice && (
          <div className={`mx-5 mb-3 px-4 py-2.5 rounded-xl text-xs flex items-start gap-2 ${
            notice.ok ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
          }`}>
            {notice.ok ? <CheckCircle size={14} className="shrink-0 mt-0.5" aria-hidden="true" /> : <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />}
            <span className="break-words">{notice.text}</span>
          </div>
        )}

        {/* Actions */}
        <div className="p-5 pt-2 border-t border-slate-800 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {session.status === 'ACTIVE' && (
              <button
                onClick={() => onResume(session)}
                className="col-span-2 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-bold text-sm"
              >
                <Camera size={16} aria-hidden="true" /> Resume capture
              </button>
            )}
            <button
              onClick={handleExport}
              disabled={photos.length === 0 || busy !== null}
              className="flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm disabled:opacity-40"
            >
              {busy === 'export' ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
              Export bundle
            </button>
            <button
              onClick={handleUplink}
              disabled={photos.length === 0 || busy !== null}
              title={getIntakeUrl() ? `POST to ${getIntakeUrl()}` : 'Configure the SCB intake URL on the Operate home first'}
              className="flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm disabled:opacity-40"
            >
              {busy === 'uplink' ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
              Uplink to Brain
            </button>
            {onSendToOCR && (
              <button
                onClick={handleSendToOCR}
                disabled={photos.length === 0 || busy !== null}
                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm disabled:opacity-40"
              >
                <FileJson size={16} aria-hidden="true" /> Run OCR pipeline
              </button>
            )}
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={busy !== null}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-900 border border-red-900/50 hover:bg-red-950/40 text-red-400 font-semibold text-sm ${onSendToOCR ? '' : 'col-span-1'}`}
            >
              <Trash2 size={16} aria-hidden="true" /> Delete
            </button>
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="absolute inset-0 z-10 bg-black/70 flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full space-y-4">
            <h3 className="text-white font-bold">Delete this session?</h3>
            <p className="text-slate-300 text-sm">
              {photos.length} photo{photos.length === 1 ? '' : 's'} will be permanently removed from this device.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold">
                Keep
              </button>
              <button onClick={handleDelete} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-bold">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
