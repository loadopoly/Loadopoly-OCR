/**
 * Operate Console — Photogrammetry Capture Types
 *
 * Defines the capture-session domain model and the `scb_manifest.json`
 * bundle contract (`schema: "loadopoly.capture/1"`) consumed by the
 * Supply Chain Brain intake module (`pipeline/src/photogrammetry`).
 *
 * A capture session is a sequence of overlapping photos of one subject
 * (stockpile, machine, pallet, document set …) plus per-photo device pose,
 * GPS, and quality metrics. Sessions are grouped into supply-chain projects
 * and exported as a self-describing bundle:
 *
 *   bundle_<sessionId>.zip
 *   ├── scb_manifest.json
 *   └── photos/IMG_0001.jpg …
 *
 * @module capture/types
 */

export const CAPTURE_SCHEMA_VERSION = 'loadopoly.capture/1';

/** Number of compass sectors used for orbit coverage tracking. */
export const COVERAGE_SECTORS = 12;

export type CapturePresetId =
  | 'STOCKPILE'
  | 'EQUIPMENT'
  | 'PALLET'
  | 'PART'
  | 'DOCUMENT'
  | 'YARD_SCENE';

export type CaptureRing = 'LOW' | 'MID' | 'HIGH';

export type SessionStatus =
  | 'ACTIVE'      // capture in progress
  | 'COMPLETE'    // finished, ready for export/uplink
  | 'EXPORTED'    // bundle downloaded at least once
  | 'UPLINKED';   // delivered to an SCB intake endpoint

/** Device pose snapshot at the moment of a capture. */
export interface PhotoPose {
  lat: number | null;
  lng: number | null;
  /** GPS horizontal accuracy in metres, if available */
  accuracyM: number | null;
  altM: number | null;
  /** Compass heading 0-360, screen-orientation corrected */
  headingDeg: number | null;
  pitchDeg: number | null;
  rollDeg: number | null;
}

/** Per-photo quality metrics computed at capture time. */
export interface PhotoQuality {
  /** Variance-of-Laplacian sharpness score; higher = sharper */
  blurScore: number;
  /** True when blurScore falls below the preset threshold */
  blurry: boolean;
  /** Mean luminance 0-1 */
  brightness: number;
  /** True when brightness is outside the usable exposure band */
  badExposure: boolean;
}

export interface CapturePhoto {
  id: string;
  sessionId: string;
  /** 0-based capture order */
  index: number;
  blob: Blob;
  fileName: string;
  width: number;
  height: number;
  bytes: number;
  capturedAt: string;
  pose: PhotoPose;
  /** Compass sector (0..COVERAGE_SECTORS-1) this photo covers, if heading known */
  sectorIdx: number | null;
  ring: CaptureRing;
  quality: PhotoQuality;
  /** SHA-256 of the JPEG bytes, hex — fixity for the SCB chain of custody */
  sha256: string;
}

/** A supply-chain project groups sessions captured for the same initiative. */
export interface CaptureProject {
  id: string;
  name: string;
  /** Short site/warehouse code, e.g. "CHA", "BUR", "JER" */
  site: string;
  description: string;
  createdAt: string;
  /** Free-form tags fed into the Brain corpus, e.g. ["aged-inventory"] */
  tags: string[];
}

export interface CaptureSession {
  id: string;
  projectId: string;
  name: string;
  preset: CapturePresetId;
  status: SessionStatus;
  startedAt: string;
  completedAt: string | null;
  photoCount: number;
  /** Sectors with at least one photo (subset of 0..COVERAGE_SECTORS-1) */
  sectorsFilled: number[];
  /** First GPS fix of the session — the bundle's spatial origin */
  origin: { lat: number; lng: number; accuracyM: number | null } | null;
  notes: string;
  operator: string;
  lastExportedAt: string | null;
  lastUplinkedAt: string | null;
}

// ============================================
// scb_manifest.json contract (loadopoly.capture/1)
// ============================================

export interface ManifestPhoto {
  file: string;            // "photos/IMG_0001.jpg"
  index: number;
  capturedAt: string;
  pose: PhotoPose;
  sectorIdx: number | null;
  ring: CaptureRing;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  quality: Omit<PhotoQuality, 'badExposure'> & { badExposure?: boolean };
}

export interface SCBManifest {
  schema: typeof CAPTURE_SCHEMA_VERSION;
  generatedAt: string;
  session: {
    id: string;
    name: string;
    preset: CapturePresetId;
    startedAt: string;
    completedAt: string | null;
    operator: string;
    notes: string;
    origin: CaptureSession['origin'];
    device: { userAgent: string; platform: string };
  };
  project: {
    id: string;
    name: string;
    site: string;
    tags: string[];
  };
  photos: ManifestPhoto[];
  coverage: {
    sectors: number;
    filled: number;
    pct: number;
  };
  /** Routing hints for the Supply Chain Brain intake */
  scb: {
    targetDataStore: 'supply-chain-brain';
    intakeModule: 'src.photogrammetry';
    kind: 'photogrammetry_capture';
  };
}
