/**
 * Capture presets — guided photogrammetry recipes for supply-chain subjects.
 *
 * Each preset encodes field-proven capture geometry (orbit pattern, shot
 * count, overlap) plus quality thresholds, so an operator can walk up to a
 * stockpile or machine and produce a reconstruction-ready photo set without
 * knowing anything about photogrammetry.
 */

import { CapturePresetId, CaptureRing, COVERAGE_SECTORS } from './types';

export interface CapturePreset {
  id: CapturePresetId;
  label: string;
  /** One-line operator description shown on the preset picker */
  tagline: string;
  /** Supply-chain use the data feeds, shown in the picker detail */
  scbUse: string;
  /** Emoji used in compact UI chips (lucide icons used in full cards) */
  emoji: string;
  /** Minimum photos for a usable reconstruction */
  minPhotos: number;
  /** Recommended target photo count */
  targetPhotos: number;
  /** Whether the orbit coverage ring should be shown and tracked */
  orbit: boolean;
  /** Capture rings (heights) the operator is guided through */
  rings: CaptureRing[];
  /** Step-by-step guidance, one entry per phase */
  guidance: string[];
  /** Blur threshold: variance-of-Laplacian below this flags the shot */
  blurThreshold: number;
  /** Usable mean-luminance band [lo, hi] (0-1) */
  exposureBand: [number, number];
}

export const CAPTURE_PRESETS: Record<CapturePresetId, CapturePreset> = {
  STOCKPILE: {
    id: 'STOCKPILE',
    label: 'Stockpile / Volumetrics',
    tagline: 'Orbit an aggregate pile for volume measurement',
    scbUse: 'Feeds inventory volumetrics & yard stock reconciliation',
    emoji: '⛰️',
    minPhotos: 24,
    targetPhotos: 36,
    orbit: true,
    rings: ['MID', 'HIGH'],
    guidance: [
      'Walk a full circle around the pile, 5–10 m back. Take a photo every 2–3 steps — keep ~70% overlap.',
      'Second lap: raise the phone overhead (or step back further) and angle down ~20° to capture the crest.',
      'Keep the whole pile in frame every shot. Avoid moving machinery in the background.',
    ],
    blurThreshold: 60,
    exposureBand: [0.18, 0.85],
  },
  EQUIPMENT: {
    id: 'EQUIPMENT',
    label: 'Equipment / Asset',
    tagline: 'Full orbit of a machine or major component',
    scbUse: 'Asset condition record, cannibalization candidate review',
    emoji: '🚜',
    minPhotos: 24,
    targetPhotos: 48,
    orbit: true,
    rings: ['LOW', 'MID', 'HIGH'],
    guidance: [
      'Circle the machine at chest height, a photo every ~15°. Keep the whole unit in frame.',
      'Second lap low: crouch and capture undercarriage, fittings and wear surfaces.',
      'Third lap close-up: serial plates, damage, hour meters — fill the frame with each detail.',
    ],
    blurThreshold: 80,
    exposureBand: [0.15, 0.88],
  },
  PALLET: {
    id: 'PALLET',
    label: 'Pallet / Bin',
    tagline: 'Quick orbit of palletized or binned inventory',
    scbUse: 'Cycle-count evidence, receiving discrepancy documentation',
    emoji: '📦',
    minPhotos: 12,
    targetPhotos: 20,
    orbit: true,
    rings: ['MID'],
    guidance: [
      'Orbit the pallet at ~1.5 m, a photo every 30°. Include the floor around the base.',
      'Finish with straight-on shots of every label, tag and bin location placard.',
    ],
    blurThreshold: 90,
    exposureBand: [0.18, 0.88],
  },
  PART: {
    id: 'PART',
    label: 'Part / Component',
    tagline: 'Dense close-range orbit of a single part',
    scbUse: 'Part identification, condition scoring (GOOD/FAIR/POOR/SCRAP)',
    emoji: '⚙️',
    minPhotos: 16,
    targetPhotos: 32,
    orbit: true,
    rings: ['LOW', 'MID', 'HIGH'],
    guidance: [
      'Place the part on a contrasting surface in even light. Orbit close — part fills ⅔ of frame.',
      'Three heights: level with the part, 30° above, then top-down.',
      'Capture every marking, stamp or part number straight-on and sharp.',
    ],
    blurThreshold: 110,
    exposureBand: [0.2, 0.9],
  },
  DOCUMENT: {
    id: 'DOCUMENT',
    label: 'Documents / Labels',
    tagline: 'Flat capture of paperwork, tags and travelers',
    scbUse: 'OCR → part numbers, quantities, PO/SO references into the Brain',
    emoji: '📄',
    minPhotos: 1,
    targetPhotos: 10,
    orbit: false,
    rings: ['MID'],
    guidance: [
      'Hold the phone square over the document — fill the frame, avoid shadows and glare.',
      'One sharp photo per page or label. The blur meter must stay green.',
    ],
    blurThreshold: 140,
    exposureBand: [0.3, 0.95],
  },
  YARD_SCENE: {
    id: 'YARD_SCENE',
    label: 'Yard / Area Scan',
    tagline: 'Sweep a laydown yard, dock or storage area',
    scbUse: 'Spatial layout for slotting, flow and congestion analysis',
    emoji: '🏗️',
    minPhotos: 20,
    targetPhotos: 60,
    orbit: false,
    rings: ['MID'],
    guidance: [
      'Walk the perimeter shooting inward every few steps, then walk the aisles shooting both sides.',
      'Overlap consecutive frames ~60%. Keep the horizon level — watch the bubble.',
      'Capture fixed references (building corners, bay numbers) to anchor the scene.',
    ],
    blurThreshold: 60,
    exposureBand: [0.15, 0.9],
  },
};

export const PRESET_ORDER: CapturePresetId[] = [
  'STOCKPILE',
  'EQUIPMENT',
  'PALLET',
  'PART',
  'DOCUMENT',
  'YARD_SCENE',
];

/** Map a compass heading (deg) to a coverage sector index, or null. */
export function headingToSector(headingDeg: number | null): number | null {
  if (headingDeg === null || Number.isNaN(headingDeg)) return null;
  const norm = ((headingDeg % 360) + 360) % 360;
  return Math.floor(norm / (360 / COVERAGE_SECTORS)) % COVERAGE_SECTORS;
}
