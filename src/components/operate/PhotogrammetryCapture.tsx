/**
 * PhotogrammetryCapture — full-screen guided multi-shot capture.
 *
 * The operator picks a preset (stockpile, equipment, pallet …) and this HUD
 * walks them through a reconstruction-ready photo set:
 *
 *   • orbit coverage ring — 12 compass sectors fill as the operator circles
 *   • live sharpness meter — variance-of-Laplacian on the preview stream
 *   • level bubble — pitch/roll indicator to keep the horizon stable
 *   • pose stamping — GPS + compass + tilt recorded per shot
 *   • quality gate — soft/blurred shots are flagged, never silently kept
 *
 * Every photo is persisted to IndexedDB immediately (offline-first); the
 * session survives refreshes and OS camera interruptions.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  MapPin,
  Compass,
  Check,
  AlertTriangle,
  Zap,
  ZapOff,
  Trash2,
  Flag,
} from 'lucide-react';
import { announce } from '../../lib/accessibility';
import {
  CapturePhoto,
  CaptureProject,
  CaptureRing,
  CaptureSession,
  COVERAGE_SECTORS,
} from '../../capture/types';
import { CAPTURE_PRESETS, headingToSector } from '../../capture/presets';
import {
  PoseTracker,
  PoseSnapshot,
  analyzeFrame,
  sha256Hex,
  haptic,
} from '../../capture/sensors';
import { addPhoto, deletePhoto, getSession, nextPhotoIndex, setSessionStatus } from '../../capture/sessionStore';

interface Props {
  session: CaptureSession;
  project: CaptureProject;
  /** Called when the operator exits; parent reloads session state from Dexie */
  onExit: (finished: boolean) => void;
}

interface ThumbEntry {
  id: string;
  url: string;
  index: number;
  blurry: boolean;
}

const RING_LABEL: Record<CaptureRing, string> = {
  LOW: 'Low pass',
  MID: 'Mid pass',
  HIGH: 'High pass',
};

export default function PhotogrammetryCapture({ session, project, onExit }: Props) {
  const preset = CAPTURE_PRESETS[session.preset];
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackerRef = useRef<PoseTracker | null>(null);
  const photoIndexRef = useRef(session.photoCount);
  const indexSeededRef = useRef(false);
  // Single source of truth for camera teardown + a generation guard so a
  // late-resolving getUserMedia (unmount / OS-interruption race) stops its own
  // tracks instead of re-lighting the camera.
  const streamRef = useRef<MediaStream | null>(null);
  const streamGenRef = useRef(0);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [pose, setPose] = useState<PoseSnapshot | null>(null);
  const [liveBlur, setLiveBlur] = useState<{ score: number; blurry: boolean } | null>(null);
  const [photoCount, setPhotoCount] = useState(session.photoCount);
  const [sectors, setSectors] = useState<Set<number>>(new Set(session.sectorsFilled));
  const [activeRing, setActiveRing] = useState<CaptureRing>(preset.rings[0]);
  const [thumbs, setThumbs] = useState<ThumbEntry[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [flash, setFlash] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [toast, setToast] = useState<{ text: string; warn: boolean } | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);

  // ---------------------------------------------------------------- camera

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const startStream = useCallback(async () => {
    const gen = ++streamGenRef.current;
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      if (gen !== streamGenRef.current) {
        // Superseded while getUserMedia was in flight (unmount, backgrounding,
        // or another start) — stop the tracks we just acquired, don't commit.
        newStream.getTracks().forEach(t => t.stop());
        return;
      }
      const track = newStream.getVideoTracks()[0];
      const caps = (track.getCapabilities?.() ?? {}) as any;
      setTorchSupported(Boolean(caps.torch));
      // Stop any previous live stream before swapping it in.
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = newStream;
      setCameraError(null);
      setStream(newStream);
      // Upgrade resolution in the background — fast first frame matters more
      track
        .applyConstraints({ width: { ideal: 3840 }, height: { ideal: 2160 } })
        .catch(() => track.applyConstraints({ width: { ideal: 1920 }, height: { ideal: 1080 } }).catch(() => {}));
    } catch {
      if (gen === streamGenRef.current) {
        setCameraError('Camera unavailable. Check permissions and try again.');
      }
    }
  }, []);

  useEffect(() => {
    startStream();
    return () => {
      streamGenRef.current++; // invalidate any in-flight getUserMedia
      stopStream();
      setStream(null);
    };
  }, [startStream, stopStream]);

  // Keep srcObject reactive (camera black-screen fix from CameraCapture)
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  // Recover from OS interruptions (phone call, app switch)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        streamGenRef.current++; // invalidate any in-flight getUserMedia
        stopStream();
        setStream(null);
      } else if (document.visibilityState === 'visible') {
        startStream();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [startStream, stopStream]);

  // ---------------------------------------------------------------- sensors

  // Revoke any thumbnail object URLs still held when the HUD unmounts.
  const thumbsRef = useRef<ThumbEntry[]>([]);
  useEffect(() => { thumbsRef.current = thumbs; }, [thumbs]);
  useEffect(() => () => {
    thumbsRef.current.forEach(t => URL.revokeObjectURL(t.url));
  }, []);

  // Seed the next photo index from the store (max existing index + 1), NOT the
  // photo count — a resumed session whose photos were deleted or partially
  // failed would otherwise reuse an index and corrupt the bundle.
  useEffect(() => {
    let cancelled = false;
    nextPhotoIndex(session.id).then(n => {
      if (!cancelled) {
        photoIndexRef.current = n;
        indexSeededRef.current = true;
      }
    });
    return () => { cancelled = true; };
  }, [session.id]);

  useEffect(() => {
    const tracker = new PoseTracker();
    trackerRef.current = tracker;
    // Best-effort start on mount; on iOS, DeviceOrientation permission needs a
    // user gesture, so the first shutter tap retries start() (see capturePhoto).
    tracker.start();
    const unsub = tracker.subscribe(setPose);
    return () => {
      unsub();
      tracker.stop();
      trackerRef.current = null;
    };
  }, []);

  // Live sharpness meter — cheap 96×96 analysis twice a second
  useEffect(() => {
    const timer = setInterval(() => {
      const video = videoRef.current;
      if (!video || !video.videoWidth) return;
      const q = analyzeFrame(video, preset);
      setLiveBlur({ score: q.blurScore, blurry: q.blurry });
    }, 500);
    return () => clearInterval(timer);
  }, [preset]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const toggleTorch = useCallback(() => {
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    track
      .applyConstraints({ advanced: [{ torch: next }] } as any)
      .then(() => setTorchOn(next))
      .catch(() => setToast({ text: 'Torch not available', warn: true }));
  }, [stream, torchOn]);

  // ---------------------------------------------------------------- capture

  const takePhoto = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || isCapturing) return;
    setIsCapturing(true);
    setFlash(true);
    setTimeout(() => setFlash(false), 120);
    haptic();

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas');
      ctx.drawImage(video, 0, 0);

      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.92),
      );

      // First real user gesture: if orientation never arrived (iOS needs an
      // in-gesture permission grant), retry starting the tracker now.
      if (trackerRef.current && trackerRef.current.current?.headingDeg == null) {
        trackerRef.current.start();
      }

      const quality = analyzeFrame(video, preset);
      const currentPose = trackerRef.current?.current;
      // Guard against a shutter that fires before the async index seed landed.
      if (!indexSeededRef.current) {
        photoIndexRef.current = await nextPhotoIndex(session.id);
        indexSeededRef.current = true;
      }
      const index = photoIndexRef.current++;
      const sectorIdx = preset.orbit ? headingToSector(currentPose?.headingDeg ?? null) : null;

      const photo: CapturePhoto = {
        id: crypto.randomUUID(),
        sessionId: session.id,
        index,
        blob,
        fileName: `IMG_${String(index + 1).padStart(4, '0')}.jpg`,
        width: canvas.width,
        height: canvas.height,
        bytes: blob.size,
        capturedAt: new Date().toISOString(),
        pose: {
          lat: currentPose?.lat ?? null,
          lng: currentPose?.lng ?? null,
          accuracyM: currentPose?.accuracyM ?? null,
          altM: currentPose?.altM ?? null,
          headingDeg: currentPose?.headingDeg ?? null,
          pitchDeg: currentPose?.pitchDeg ?? null,
          rollDeg: currentPose?.rollDeg ?? null,
        },
        sectorIdx,
        ring: activeRing,
        quality,
        sha256: await sha256Hex(blob),
      };

      await addPhoto(photo);
      setPhotoCount(c => c + 1);
      if (sectorIdx !== null) {
        setSectors(prev => new Set(prev).add(sectorIdx));
      }
      setThumbs(prev => {
        const next = [
          { id: photo.id, url: URL.createObjectURL(blob), index, blurry: quality.blurry },
          ...prev,
        ];
        // Revoke the object URLs of entries scrolled past the 6-thumb strip so
        // long capture sessions don't pin hundreds of MB of Blob memory.
        next.slice(6).forEach(t => URL.revokeObjectURL(t.url));
        return next.slice(0, 6);
      });

      if (quality.blurry) {
        setToast({ text: 'Soft frame — flagged. Consider a retake.', warn: true });
        announce('Photo captured but flagged as soft.');
      } else if (quality.badExposure) {
        setToast({ text: 'Exposure off — flagged.', warn: true });
      } else {
        announce(`Photo ${index + 1} captured.`);
      }
    } catch {
      setToast({ text: 'Capture failed — try again.', warn: true });
    } finally {
      setIsCapturing(false);
    }
  }, [activeRing, isCapturing, preset, session.id]);

  const removeThumb = useCallback(async (entry: ThumbEntry) => {
    await deletePhoto(entry.id);
    URL.revokeObjectURL(entry.url);
    setThumbs(prev => prev.filter(t => t.id !== entry.id));
    // Recompute coverage from the store — deleting the only shot of a sector
    // must un-fill the ring, not just decrement the count.
    const fresh = await getSession(session.id);
    if (fresh) {
      setSectors(new Set(fresh.sectorsFilled));
      setPhotoCount(fresh.photoCount);
    } else {
      setPhotoCount(c => Math.max(0, c - 1));
    }
    announce('Photo removed.');
  }, [session.id]);

  const finishSession = useCallback(async () => {
    await setSessionStatus(session.id, 'COMPLETE');
    announce('Capture session complete.');
    onExit(true);
  }, [onExit, session.id]);

  const requestExit = useCallback(() => {
    if (photoCount > 0) setConfirmExit(true);
    else onExit(false);
  }, [onExit, photoCount]);

  // ---------------------------------------------------------------- derived

  const coveragePct = preset.orbit
    ? Math.round((sectors.size / COVERAGE_SECTORS) * 100)
    : Math.min(100, Math.round((photoCount / preset.targetPhotos) * 100));
  const countPct = Math.min(100, Math.round((photoCount / preset.targetPhotos) * 100));
  const guidanceStep = Math.min(
    preset.guidance.length - 1,
    Math.floor((photoCount / Math.max(1, preset.targetPhotos)) * preset.guidance.length),
  );
  const canFinish = photoCount >= preset.minPhotos;
  const heading = pose?.headingDeg ?? null;
  const currentSector = headingToSector(heading);

  // ---------------------------------------------------------------- render

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label="Photogrammetry capture">
      {/* Viewfinder */}
      <div className="absolute inset-0">
        {cameraError ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-8">
            <AlertTriangle size={40} className="text-amber-400" />
            <p className="text-slate-200 text-sm max-w-xs">{cameraError}</p>
            <button onClick={startStream} className="px-5 py-2.5 bg-primary-600 hover:bg-primary-500 rounded-xl text-white text-sm font-semibold">
              Retry camera
            </button>
          </div>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        )}
        {flash && <div className="absolute inset-0 bg-white/70 pointer-events-none" />}
      </div>

      {/* Top bar */}
      <div className="relative z-10 flex items-start justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] bg-gradient-to-b from-black/70 to-transparent">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base">{preset.emoji}</span>
            <h2 className="text-white font-bold text-sm truncate max-w-[46vw]">{session.name}</h2>
          </div>
          <p className="text-slate-300 text-[11px] mt-0.5 truncate max-w-[60vw]">
            {project.name} · {preset.label}
          </p>
        </div>
        <button
          onClick={requestExit}
          aria-label="Close capture"
          className="p-2.5 bg-white/10 hover:bg-white/20 backdrop-blur rounded-full text-white shrink-0"
        >
          <X size={22} aria-hidden="true" />
        </button>
      </div>

      {/* Guidance banner */}
      <div className="relative z-10 mx-4 mt-1">
        <div className="bg-black/55 backdrop-blur-md border border-white/10 rounded-2xl px-4 py-2.5">
          <p className="text-white text-[13px] leading-snug">
            <span className="text-primary-300 font-bold mr-1.5">Step {guidanceStep + 1}/{preset.guidance.length}</span>
            {preset.guidance[guidanceStep]}
          </p>
        </div>
      </div>

      {/* Status pills — GPS / heading / sharpness */}
      <div className="relative z-10 flex items-center gap-2 px-4 mt-2 flex-wrap">
        <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold backdrop-blur ${
          pose?.gpsLock ? 'bg-emerald-500/25 text-emerald-300' : 'bg-white/10 text-slate-300'
        }`}>
          <MapPin size={11} aria-hidden="true" />
          {pose?.gpsLock ? `GPS ±${Math.round(pose.accuracyM ?? 0)}m` : 'NO GPS'}
        </span>
        <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold backdrop-blur ${
          heading !== null ? 'bg-primary-500/25 text-primary-200' : 'bg-white/10 text-slate-300'
        }`}>
          <Compass size={11} aria-hidden="true" />
          {heading !== null ? `${Math.round(heading)}°` : 'NO COMPASS'}
        </span>
        {liveBlur && (
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold backdrop-blur ${
            liveBlur.blurry ? 'bg-amber-500/30 text-amber-200' : 'bg-emerald-500/25 text-emerald-300'
          }`}>
            {liveBlur.blurry ? 'SOFT — hold steady' : 'SHARP'}
          </span>
        )}
      </div>

      <div className="flex-1 relative z-10 pointer-events-none">
        {/* Level bubble */}
        {pose && (pose.pitchDeg !== null || pose.rollDeg !== null) && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-white/25 bg-black/30 backdrop-blur-sm flex items-center justify-center">
            <div className="absolute w-full h-px bg-white/20" />
            <div className="absolute h-full w-px bg-white/20" />
            <div
              className={`w-3.5 h-3.5 rounded-full transition-transform duration-100 ${
                Math.abs(pose.rollDeg ?? 0) < 5 && Math.abs(pose.pitchDeg ?? 0) < 12
                  ? 'bg-emerald-400'
                  : 'bg-amber-400'
              }`}
              style={{
                transform: `translate(${Math.max(-22, Math.min(22, (pose.rollDeg ?? 0) * 1.1))}px, ${Math.max(-22, Math.min(22, (pose.pitchDeg ?? 0) * 0.8))}px)`,
              }}
            />
          </div>
        )}

        {/* Orbit coverage ring */}
        {preset.orbit && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1">
            <svg width="92" height="92" viewBox="0 0 100 100" aria-label={`Coverage ${coveragePct} percent`}>
              {Array.from({ length: COVERAGE_SECTORS }).map((_, i) => {
                const a0 = ((i * 30 - 90 - 15) * Math.PI) / 180;
                const a1 = (((i + 1) * 30 - 90 - 15) * Math.PI) / 180;
                const x0 = 50 + 38 * Math.cos(a0);
                const y0 = 50 + 38 * Math.sin(a0);
                const x1 = 50 + 38 * Math.cos(a1);
                const y1 = 50 + 38 * Math.sin(a1);
                const filled = sectors.has(i);
                const isCurrent = currentSector === i;
                return (
                  <path
                    key={i}
                    d={`M ${x0} ${y0} A 38 38 0 0 1 ${x1} ${y1}`}
                    fill="none"
                    strokeWidth={isCurrent ? 9 : 7}
                    strokeLinecap="round"
                    className={
                      filled
                        ? 'stroke-emerald-400'
                        : isCurrent
                          ? 'stroke-primary-400 animate-pulse'
                          : 'stroke-white/20'
                    }
                  />
                );
              })}
              <text x="50" y="47" textAnchor="middle" className="fill-white font-bold" fontSize="17">
                {coveragePct}%
              </text>
              <text x="50" y="62" textAnchor="middle" className="fill-white/60" fontSize="9">
                orbit
              </text>
            </svg>
            {heading === null && (
              <span className="text-[9px] text-slate-300 bg-black/40 px-2 py-0.5 rounded-full pointer-events-none">
                compass off — count guides you
              </span>
            )}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="relative z-20 mx-auto mb-2 pointer-events-none animate-fade-in" style={{ width: 'fit-content' }}>
          <span className={`px-4 py-2 rounded-full text-xs font-semibold backdrop-blur-md ${toast.warn ? 'bg-amber-500/90 text-black' : 'bg-emerald-500/90 text-black'}`}>
            {toast.text}
          </span>
        </div>
      )}

      {/* Bottom control deck */}
      <div className="relative z-10 bg-gradient-to-t from-black via-black/85 to-transparent pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 px-4 space-y-3">
        {/* Thumbnail strip */}
        {thumbs.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Recent photos">
            {thumbs.map(t => (
              <div key={t.id} className="relative shrink-0">
                <img
                  src={t.url}
                  alt={`Photo ${t.index + 1}`}
                  className={`w-14 h-14 object-cover rounded-lg border-2 ${t.blurry ? 'border-amber-400' : 'border-white/20'}`}
                />
                {t.blurry && (
                  <AlertTriangle size={12} className="absolute top-0.5 left-0.5 text-amber-400" aria-label="Flagged soft" />
                )}
                <button
                  onClick={() => removeThumb(t)}
                  aria-label={`Delete photo ${t.index + 1}`}
                  className="absolute -top-1.5 -right-1.5 bg-slate-900 border border-white/30 rounded-full p-0.5 text-white"
                >
                  <Trash2 size={10} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Ring selector */}
        {preset.rings.length > 1 && (
          <div className="flex items-center justify-center gap-1.5" role="group" aria-label="Capture height pass">
            {preset.rings.map(r => (
              <button
                key={r}
                onClick={() => setActiveRing(r)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors ${
                  activeRing === r ? 'bg-primary-600 text-white' : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                {RING_LABEL[r]}
              </button>
            ))}
          </div>
        )}

        {/* Shutter row */}
        <div className="flex items-center justify-between">
          <div className="w-20 flex flex-col items-start gap-2">
            {torchSupported && (
              <button
                onClick={toggleTorch}
                aria-label={torchOn ? 'Torch off' : 'Torch on'}
                className={`p-3 rounded-full ${torchOn ? 'bg-amber-400 text-black' : 'bg-white/10 text-white'}`}
              >
                {torchOn ? <Zap size={20} aria-hidden="true" /> : <ZapOff size={20} aria-hidden="true" />}
              </button>
            )}
            <div className="text-left">
              <p className="text-white font-bold text-lg leading-none tabular-nums">{photoCount}</p>
              <p className="text-slate-400 text-[10px]">of {preset.targetPhotos} target</p>
            </div>
          </div>

          <button
            onClick={takePhoto}
            disabled={isCapturing || !stream}
            aria-label="Take photo"
            className="relative w-[76px] h-[76px] rounded-full border-4 border-white flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
          >
            <div className={`w-[60px] h-[60px] rounded-full ${isCapturing ? 'bg-slate-300' : 'bg-white'}`} />
            {/* progress ring toward target count */}
            <svg className="absolute inset-[-7px]" width="90" height="90" viewBox="0 0 90 90" aria-hidden="true">
              <circle
                cx="45" cy="45" r="42"
                fill="none"
                strokeWidth="3"
                strokeDasharray={`${(countPct / 100) * 264} 264`}
                strokeLinecap="round"
                className="stroke-primary-400"
                transform="rotate(-90 45 45)"
              />
            </svg>
          </button>

          <div className="w-20 flex justify-end">
            <button
              onClick={finishSession}
              disabled={!canFinish}
              aria-label="Finish session"
              className={`flex flex-col items-center justify-center w-16 h-16 rounded-full font-bold transition-all ${
                canFinish
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-900/40'
                  : 'bg-white/10 text-slate-500'
              }`}
            >
              {canFinish ? <Check size={22} aria-hidden="true" /> : <Flag size={18} aria-hidden="true" />}
              <span className="text-[9px] uppercase mt-0.5">{canFinish ? 'Finish' : `min ${preset.minPhotos}`}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Exit confirmation */}
      {confirmExit && (
        <div className="absolute inset-0 z-30 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full space-y-4">
            <h3 className="text-white font-bold">Leave capture?</h3>
            <p className="text-slate-300 text-sm">
              {photoCount} photo{photoCount === 1 ? '' : 's'} are saved. You can resume this session
              or finish it now{canFinish ? '' : ` (needs ${preset.minPhotos - photoCount} more to finish)`}.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmExit(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold"
              >
                Keep shooting
              </button>
              {canFinish ? (
                <button
                  onClick={finishSession}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-bold"
                >
                  Finish session
                </button>
              ) : (
                <button
                  onClick={() => onExit(false)}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500/90 hover:bg-amber-400 text-black text-sm font-bold"
                >
                  Pause & exit
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
