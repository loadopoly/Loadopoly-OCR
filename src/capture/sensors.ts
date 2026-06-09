/**
 * Capture sensors — device pose (GPS + orientation) and frame quality.
 *
 * Wraps Geolocation and DeviceOrientation behind a single PoseTracker with
 * graceful degradation: every reading is nullable and the capture flow works
 * with zero sensors (desktop webcam) up to full pose (mobile in the yard).
 *
 * Frame quality uses a variance-of-Laplacian sharpness score plus mean
 * luminance, computed on a tiny downscaled canvas so it runs per-shot in
 * well under a frame.
 */

import { PhotoPose, PhotoQuality } from './types';
import { CapturePreset } from './presets';

export interface PoseSnapshot extends PhotoPose {
  /** True once at least one GPS fix has arrived */
  gpsLock: boolean;
  /** True once orientation events are flowing */
  orientationLock: boolean;
}

type PoseListener = (pose: PoseSnapshot) => void;

export class PoseTracker {
  private watchId: number | null = null;
  private listeners = new Set<PoseListener>();
  private orientationHandler: ((e: DeviceOrientationEvent) => void) | null = null;
  private pose: PoseSnapshot = {
    lat: null,
    lng: null,
    accuracyM: null,
    altM: null,
    headingDeg: null,
    pitchDeg: null,
    rollDeg: null,
    gpsLock: false,
    orientationLock: false,
  };

  get current(): PoseSnapshot {
    return { ...this.pose };
  }

  subscribe(fn: PoseListener): () => void {
    this.listeners.add(fn);
    fn(this.current);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    const snapshot = this.current;
    this.listeners.forEach(fn => fn(snapshot));
  }

  /**
   * Start sensors. On iOS this must be called from a user gesture so the
   * DeviceOrientation permission prompt can fire.
   */
  async start(): Promise<void> {
    this.startGps();
    await this.startOrientation();
  }

  private startGps() {
    if (this.watchId !== null || !('geolocation' in navigator)) return;
    this.watchId = navigator.geolocation.watchPosition(
      pos => {
        this.pose.lat = pos.coords.latitude;
        this.pose.lng = pos.coords.longitude;
        this.pose.accuracyM = pos.coords.accuracy ?? null;
        this.pose.altM = pos.coords.altitude ?? null;
        this.pose.gpsLock = true;
        this.emit();
      },
      () => {
        // Denied or unavailable — capture continues without GPS
        this.pose.gpsLock = false;
        this.emit();
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
  }

  private async startOrientation(): Promise<void> {
    if (this.orientationHandler) return;
    // iOS 13+ requires an explicit permission request from a user gesture
    const DOE = (window as any).DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      try {
        const result = await DOE.requestPermission();
        if (result !== 'granted') return;
      } catch {
        return; // not from a user gesture, or denied
      }
    }

    this.orientationHandler = (e: DeviceOrientationEvent) => {
      // webkitCompassHeading: iOS true-north heading (already CW-positive).
      // alpha: device yaw — convert to compass heading for other platforms.
      const webkitHeading = (e as any).webkitCompassHeading;
      let heading: number | null = null;
      if (typeof webkitHeading === 'number' && !Number.isNaN(webkitHeading)) {
        heading = webkitHeading;
      } else if (e.alpha !== null) {
        heading = (360 - e.alpha) % 360;
      }
      // Correct for screen rotation (landscape capture)
      const screenAngle =
        (screen.orientation && screen.orientation.angle) ||
        (window as any).orientation ||
        0;
      if (heading !== null) {
        heading = ((heading + Number(screenAngle)) % 360 + 360) % 360;
      }
      this.pose.headingDeg = heading;
      this.pose.pitchDeg = e.beta !== null ? e.beta - 90 : null; // 0 = camera level
      this.pose.rollDeg = e.gamma;
      this.pose.orientationLock = heading !== null || e.beta !== null;
      this.emit();
    };

    // 'deviceorientationabsolute' gives compass-referenced alpha on Android
    const evt = 'ondeviceorientationabsolute' in window
      ? 'deviceorientationabsolute'
      : 'deviceorientation';
    window.addEventListener(evt, this.orientationHandler as EventListener, true);
  }

  stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.orientationHandler) {
      window.removeEventListener(
        'deviceorientationabsolute',
        this.orientationHandler as EventListener,
        true,
      );
      window.removeEventListener(
        'deviceorientation',
        this.orientationHandler as EventListener,
        true,
      );
      this.orientationHandler = null;
    }
    this.listeners.clear();
  }
}

// ---------------------------------------------------------------- quality

const ANALYSIS_SIZE = 96;
const analysisCanvas =
  typeof document !== 'undefined' ? document.createElement('canvas') : null;

/**
 * Score a video frame for sharpness and exposure.
 *
 * Sharpness: variance of a 3×3 Laplacian over the downscaled grayscale frame.
 * Texture-rich, in-focus frames score in the hundreds; motion-blurred or
 * defocused frames collapse toward 0. Thresholds come from the preset since
 * acceptable sharpness differs by subject distance.
 */
export function analyzeFrame(
  video: HTMLVideoElement,
  preset: CapturePreset,
): PhotoQuality {
  const fallback: PhotoQuality = {
    blurScore: 0,
    blurry: false,
    brightness: 0.5,
    badExposure: false,
  };
  if (!analysisCanvas || !video.videoWidth) return fallback;

  analysisCanvas.width = ANALYSIS_SIZE;
  analysisCanvas.height = ANALYSIS_SIZE;
  const ctx = analysisCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return fallback;
  ctx.drawImage(video, 0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE).data;
  } catch {
    return fallback;
  }

  // Grayscale
  const n = ANALYSIS_SIZE;
  const gray = new Float32Array(n * n);
  let lumSum = 0;
  for (let i = 0; i < n * n; i++) {
    const o = i * 4;
    const g = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    gray[i] = g;
    lumSum += g;
  }
  const brightness = lumSum / (n * n * 255);

  // Variance of Laplacian (4-neighbour kernel), skipping the border
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < n - 1; y++) {
    for (let x = 1; x < n - 1; x++) {
      const i = y * n + x;
      const lap =
        gray[i - 1] + gray[i + 1] + gray[i - n] + gray[i + n] - 4 * gray[i];
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }
  const mean = sum / count;
  const blurScore = sumSq / count - mean * mean;

  const [lo, hi] = preset.exposureBand;
  return {
    blurScore: Math.round(blurScore * 10) / 10,
    blurry: blurScore < preset.blurThreshold,
    brightness: Math.round(brightness * 1000) / 1000,
    badExposure: brightness < lo || brightness > hi,
  };
}

/** SHA-256 of a blob, hex-encoded — used for manifest fixity checksums. */
export async function sha256Hex(blob: Blob): Promise<string> {
  try {
    const buf = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(digest)]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    // crypto.subtle requires a secure context; degrade rather than block capture
    return '';
  }
}

/** Short haptic tick where supported. */
export function haptic(ms = 35) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}
