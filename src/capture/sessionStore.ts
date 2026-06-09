/**
 * Capture session store — IndexedDB persistence for the Operate Console.
 *
 * Lives in its own Dexie database (`LoadopolyCapture`) so the legacy
 * `GeoGraphSync` schema and its migration chain are never touched. Photos
 * are stored as Blobs and survive refresh/offline; everything works with
 * zero backend configuration.
 */

import Dexie, { Table } from 'dexie';
import {
  CaptureProject,
  CapturePhoto,
  CaptureSession,
  SessionStatus,
} from './types';

class CaptureDB extends Dexie {
  projects!: Table<CaptureProject, string>;
  sessions!: Table<CaptureSession, string>;
  photos!: Table<CapturePhoto, string>;

  constructor() {
    super('LoadopolyCapture');
    (this as any).version(1).stores({
      projects: 'id, name, createdAt',
      sessions: 'id, projectId, status, startedAt',
      photos: 'id, sessionId, index, capturedAt',
    });
  }
}

export const captureDb = new CaptureDB();

// ---------------------------------------------------------------- projects

export const DEFAULT_PROJECT_NAME = 'Supply Chain Optimization';

/** Ensure at least one project exists; returns the default project. */
export async function ensureDefaultProject(): Promise<CaptureProject> {
  const existing = await captureDb.projects.orderBy('createdAt').first();
  if (existing) return existing;
  const project: CaptureProject = {
    id: crypto.randomUUID(),
    name: DEFAULT_PROJECT_NAME,
    site: 'HQ',
    description:
      'Field captures feeding the Supply Chain Brain — stockpiles, assets, inventory and documents.',
    createdAt: new Date().toISOString(),
    tags: ['supply-chain-optimization'],
  };
  await captureDb.projects.add(project);
  return project;
}

export async function createProject(
  name: string,
  site: string,
  description = '',
  tags: string[] = [],
): Promise<CaptureProject> {
  const project: CaptureProject = {
    id: crypto.randomUUID(),
    name: name.trim() || 'Untitled Project',
    site: site.trim().toUpperCase() || 'HQ',
    description,
    createdAt: new Date().toISOString(),
    tags,
  };
  await captureDb.projects.add(project);
  return project;
}

export async function listProjects(): Promise<CaptureProject[]> {
  const all = await captureDb.projects.toArray();
  return all.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

// ---------------------------------------------------------------- sessions

export async function createSession(
  projectId: string,
  preset: CaptureSession['preset'],
  name: string,
  operator = '',
): Promise<CaptureSession> {
  const session: CaptureSession = {
    id: crypto.randomUUID(),
    projectId,
    name: name.trim() || `${preset} ${new Date().toLocaleString()}`,
    preset,
    status: 'ACTIVE',
    startedAt: new Date().toISOString(),
    completedAt: null,
    photoCount: 0,
    sectorsFilled: [],
    origin: null,
    notes: '',
    operator,
    lastExportedAt: null,
    lastUplinkedAt: null,
  };
  await captureDb.sessions.add(session);
  return session;
}

export async function updateSession(
  id: string,
  changes: Partial<CaptureSession>,
): Promise<void> {
  await captureDb.sessions.update(id, changes);
}

export async function getSession(id: string): Promise<CaptureSession | undefined> {
  return captureDb.sessions.get(id);
}

export async function listSessions(projectId?: string): Promise<CaptureSession[]> {
  const rows = projectId
    ? await captureDb.sessions.where('projectId').equals(projectId).toArray()
    : await captureDb.sessions.toArray();
  return rows.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
}

export async function setSessionStatus(
  id: string,
  status: SessionStatus,
): Promise<void> {
  const changes: Partial<CaptureSession> = { status };
  if (status === 'COMPLETE') changes.completedAt = new Date().toISOString();
  if (status === 'EXPORTED') changes.lastExportedAt = new Date().toISOString();
  if (status === 'UPLINKED') changes.lastUplinkedAt = new Date().toISOString();
  await captureDb.sessions.update(id, changes);
}

/** Delete a session and all of its photos. */
export async function deleteSession(id: string): Promise<void> {
  await captureDb.transaction('rw', captureDb.sessions, captureDb.photos, async () => {
    await captureDb.photos.where('sessionId').equals(id).delete();
    await captureDb.sessions.delete(id);
  });
}

// ---------------------------------------------------------------- photos

export async function addPhoto(photo: CapturePhoto): Promise<void> {
  await captureDb.transaction('rw', captureDb.photos, captureDb.sessions, async () => {
    await captureDb.photos.add(photo);
    const session = await captureDb.sessions.get(photo.sessionId);
    if (!session) return;
    const sectors = new Set(session.sectorsFilled);
    if (photo.sectorIdx !== null) sectors.add(photo.sectorIdx);
    const changes: Partial<CaptureSession> = {
      photoCount: session.photoCount + 1,
      sectorsFilled: [...sectors].sort((a, b) => a - b),
    };
    if (!session.origin && photo.pose.lat !== null && photo.pose.lng !== null) {
      changes.origin = {
        lat: photo.pose.lat,
        lng: photo.pose.lng,
        accuracyM: photo.pose.accuracyM,
      };
    }
    await captureDb.sessions.update(photo.sessionId, changes);
  });
}

export async function listPhotos(sessionId: string): Promise<CapturePhoto[]> {
  const rows = await captureDb.photos.where('sessionId').equals(sessionId).toArray();
  return rows.sort((a, b) => a.index - b.index);
}

export async function deletePhoto(id: string): Promise<void> {
  await captureDb.transaction('rw', captureDb.photos, captureDb.sessions, async () => {
    const photo = await captureDb.photos.get(id);
    if (!photo) return;
    await captureDb.photos.delete(id);
    const session = await captureDb.sessions.get(photo.sessionId);
    if (!session) return;
    // Recompute sector coverage from the remaining photos
    const remaining = await captureDb.photos
      .where('sessionId')
      .equals(photo.sessionId)
      .toArray();
    const sectors = new Set<number>();
    remaining.forEach(p => {
      if (p.sectorIdx !== null) sectors.add(p.sectorIdx);
    });
    await captureDb.sessions.update(photo.sessionId, {
      photoCount: remaining.length,
      sectorsFilled: [...sectors].sort((a, b) => a - b),
    });
  });
}

/** Total photos pending uplink across COMPLETE/EXPORTED sessions. */
export async function countPendingUplink(): Promise<{ sessions: number; photos: number }> {
  const pending = await captureDb.sessions
    .where('status')
    .anyOf(['COMPLETE', 'EXPORTED'])
    .toArray();
  return {
    sessions: pending.length,
    photos: pending.reduce((sum, s) => sum + s.photoCount, 0),
  };
}
