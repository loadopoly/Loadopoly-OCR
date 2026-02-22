/**
 * Spatial Coordinates Edge Function
 * 
 * Computes estimated subject GPS coordinates for every recognized object
 * in a captured image, using:
 *   1. Device GPS + compass heading + device pitch
 *   2. Object bounding-box pixel offset from image centre → angular offset
 *   3. Haversine bearing raycast to estimate subject lat/lng
 *   4. Optional: angular-size distance anchor for known structures
 *   5. Writes results to spatial_anchors table
 *   6. Upserts recognized entities to graph_nodes + graph_edges
 * 
 * Called by:
 *   - Client after each AR capture (real-time path)
 *   - Batch backfill job on existing assets that lack spatial data
 * 
 * Deployment:
 * ```bash
 * supabase functions deploy spatial-coordinates
 * ```
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================
// Types
// ============================================

interface DetectedObject {
  label: string;
  recognizedText?: string;
  confidence: number;
  // Normalized bounding box (0–1 relative to full image)
  bbox?: {
    x: number; // left edge
    y: number; // top edge
    w: number; // width
    h: number; // height
  };
  // Optional: known real-world size of object (metres) for distance estimation
  knownSizeM?: number;
}

interface SpatialRequest {
  // Asset linkage (optional — anchor can exist without a processed asset)
  assetId?: string;
  captureSessionId?: string;

  // Device capture context
  deviceLat: number;
  deviceLng: number;
  deviceAltM?: number;
  deviceAccuracyM?: number;
  compassHeadingDeg: number; // 0–360 true north
  devicePitchDeg?: number;   // 0=horizontal, positive=looking up
  deviceRollDeg?: number;

  // Camera FOV
  fovHorizontalDeg?: number;
  fovVerticalDeg?: number;
  imageWidthPx?: number;
  imageHeightPx?: number;

  // Pre-detected objects (if client already ran on-device OCR)
  detectedObjects?: DetectedObject[];

  // Raw image path (for server-side Gemini Vision call if objects not provided)
  imagePath?: string;
}

interface SpatialAnchorResult {
  id: string;
  label: string;
  subjectLat: number | null;
  subjectLng: number | null;
  subjectBearingDeg: number | null;
  subjectDistanceM: number | null;
  graphNodeId: string | null;
}

// ============================================
// Math helpers
// ============================================

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const EARTH_RADIUS_M = 6_371_000;

/**
 * Compute the destination point given a start point, bearing, and distance.
 * Uses the haversine / direct form of great-circle navigation.
 */
function haversineDestination(
  lat: number,
  lng: number,
  bearingDeg: number,
  distanceM: number
): { lat: number; lng: number } {
  const δ = distanceM / EARTH_RADIUS_M; // angular distance in radians
  const θ = bearingDeg * DEG2RAD;
  const φ1 = lat * DEG2RAD;
  const λ1 = lng * DEG2RAD;

  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
    );

  return {
    lat: φ2 * RAD2DEG,
    lng: ((λ2 * RAD2DEG + 540) % 360) - 180, // normalise to -180..+180
  };
}

/**
 * Compute absolute bearing from device to object, accounting for:
 *   - Compass heading (device centre line)
 *   - Horizontal pixel offset of object centre from image centre
 *   - Horizontal FOV
 */
function objectBearing(
  compassHeadingDeg: number,
  bboxCentreX: number,  // 0–1 (0=left, 1=right)
  fovHorizontalDeg: number
): number {
  // Normalised horizontal offset: -0.5 (hard left) to +0.5 (hard right)
  const normOffset = bboxCentreX - 0.5;
  const angularOffsetDeg = normOffset * fovHorizontalDeg;
  return (compassHeadingDeg + angularOffsetDeg + 360) % 360;
}

/**
 * Estimate distance to object using angular size of object and known real size.
 * distance = (knownSizeM / 2) / tan(angularSizeRad / 2)
 */
function estimateDistanceFromAngularSize(
  bboxWidthNorm: number,
  fovHorizontalDeg: number,
  knownSizeM: number
): number {
  const angularSizeRad = bboxWidthNorm * fovHorizontalDeg * DEG2RAD;
  if (angularSizeRad < 0.001) return NaN; // too small to be reliable
  return (knownSizeM / 2) / Math.tan(angularSizeRad / 2);
}

/**
 * Default distance heuristic when no known real size is available:
 * Uses vertical tilt and an assumed typical subject altitude.
 */
function estimateDistanceFromPitch(
  compassHeadingDeg: number,
  devicePitchDeg: number,
  bboxCentreY: number,  // 0–1 (0=top, 1=bottom)
  fovVerticalDeg: number,
  deviceAltM: number,
  assumedSubjectAltM = 0
): number {
  // Vertical angular offset from device horizon
  const normOffsetY = 0.5 - bboxCentreY; // positive = above horizon
  const angularOffsetDeg = normOffsetY * fovVerticalDeg;
  // Elevation angle to subject (device pitch + bbox vertical offset)
  const elevationDeg = devicePitchDeg + angularOffsetDeg;
  const altDiff = deviceAltM - assumedSubjectAltM;
  // Flat-earth approximation: d = altDiff / tan(elevationAngle)
  // Only useful when looking down (elevation < 0) or slightly up
  if (Math.abs(elevationDeg) < 2) {
    // Near-horizontal — use a fallback range
    return NaN;
  }
  const elevRad = elevationDeg * DEG2RAD;
  const dist = Math.abs(altDiff / Math.tan(elevRad));
  return dist;
}

// ============================================
// Main handler
// ============================================

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Auth: get calling user from Bearer token
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: SpatialRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const {
    assetId,
    captureSessionId,
    deviceLat,
    deviceLng,
    deviceAltM = 0,
    deviceAccuracyM,
    compassHeadingDeg,
    devicePitchDeg = 0,
    deviceRollDeg = 0,
    fovHorizontalDeg = 60,
    fovVerticalDeg = 45,
    imageWidthPx = 1920,
    imageHeightPx = 1080,
    detectedObjects = [],
  } = body;

  if (deviceLat == null || deviceLng == null || compassHeadingDeg == null) {
    return new Response(
      JSON.stringify({ error: 'deviceLat, deviceLng, compassHeadingDeg are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const results: SpatialAnchorResult[] = [];

  for (const obj of detectedObjects) {
    const bbox = obj.bbox ?? { x: 0.5, y: 0.5, w: 0.1, h: 0.1 };
    const bboxCentreX = bbox.x + bbox.w / 2;
    const bboxCentreY = bbox.y + bbox.h / 2;

    // --- Compute bearing to object ---
    const bearing = objectBearing(compassHeadingDeg, bboxCentreX, fovHorizontalDeg);

    // --- Estimate distance ---
    let distanceM: number | null = null;
    if (obj.knownSizeM) {
      const d = estimateDistanceFromAngularSize(bbox.w, fovHorizontalDeg, obj.knownSizeM);
      if (!isNaN(d) && d > 0 && d < 100_000) distanceM = d;
    }
    if (distanceM == null) {
      const d = estimateDistanceFromPitch(
        compassHeadingDeg, devicePitchDeg, bboxCentreY, fovVerticalDeg, deviceAltM
      );
      if (!isNaN(d) && d > 0 && d < 100_000) distanceM = d;
    }

    // --- Compute subject coordinates ---
    let subjectLat: number | null = null;
    let subjectLng: number | null = null;
    if (distanceM != null) {
      const dest = haversineDestination(deviceLat, deviceLng, bearing, distanceM);
      subjectLat = dest.lat;
      subjectLng = dest.lng;
    }

    // --- Upsert graph_node for this entity ---
    let graphNodeId: string | null = null;
    if (obj.label) {
      const normalizedLabel = obj.label.trim();
      const nodeType = (subjectLat != null) ? 'spatial' : 'entity';

      // Try to find existing node by label + type
      const { data: existing } = await supabase
        .from('graph_nodes')
        .select('ID, LAT, LNG, ANCHOR_COUNT')
        .eq('LABEL', normalizedLabel)
        .eq('NODE_TYPE', nodeType)
        .maybeSingle();

      if (existing) {
        graphNodeId = existing.ID;
        // Update position if we got a better fix (triangulation improvement)
        if (subjectLat != null) {
          const count = (existing.ANCHOR_COUNT ?? 0) + 1;
          // Incremental average of position over N fixes
          const newLat = existing.LAT != null
            ? (existing.LAT * (count - 1) + subjectLat) / count
            : subjectLat;
          const newLng = existing.LNG != null
            ? (existing.LNG * (count - 1) + subjectLng!) / count
            : subjectLng;
          await supabase
            .from('graph_nodes')
            .update({
              LAT: newLat,
              LNG: newLng,
              ANCHOR_COUNT: count,
              LAST_SEEN_AT: new Date().toISOString(),
            })
            .eq('ID', graphNodeId);
        }
      } else {
        const { data: inserted } = await supabase
          .from('graph_nodes')
          .insert({
            LABEL: normalizedLabel,
            NODE_TYPE: nodeType,
            LAT: subjectLat,
            LNG: subjectLng,
            ANCHOR_COUNT: subjectLat != null ? 1 : 0,
            USER_ID: user.id,
          })
          .select('ID')
          .single();
        if (inserted) graphNodeId = inserted.ID;
      }
    }

    // --- Insert spatial_anchor row ---
    const { data: anchor } = await supabase
      .from('spatial_anchors')
      .insert({
        USER_ID: user.id,
        ASSET_ID: assetId ?? null,
        CAPTURE_SESSION_ID: captureSessionId ?? null,
        DEVICE_LAT: deviceLat,
        DEVICE_LNG: deviceLng,
        DEVICE_ALT_M: deviceAltM,
        DEVICE_ACCURACY_M: deviceAccuracyM ?? null,
        COMPASS_HEADING_DEG: compassHeadingDeg,
        DEVICE_PITCH_DEG: devicePitchDeg,
        DEVICE_ROLL_DEG: deviceRollDeg,
        FOV_HORIZONTAL_DEG: fovHorizontalDeg,
        FOV_VERTICAL_DEG: fovVerticalDeg,
        IMAGE_WIDTH_PX: imageWidthPx,
        IMAGE_HEIGHT_PX: imageHeightPx,
        BBOX_X: obj.bbox?.x ?? null,
        BBOX_Y: obj.bbox?.y ?? null,
        BBOX_W: obj.bbox?.w ?? null,
        BBOX_H: obj.bbox?.h ?? null,
        RECOGNIZED_TEXT: obj.recognizedText ?? null,
        RECOGNIZED_LABEL: obj.label ?? null,
        RECOGNITION_CONFIDENCE: obj.confidence,
        SUBJECT_LAT: subjectLat,
        SUBJECT_LNG: subjectLng,
        SUBJECT_BEARING_DEG: bearing,
        SUBJECT_DISTANCE_M: distanceM,
        GRAPH_NODE_ID: graphNodeId,
        PROCESSING_STATUS: 'processed',
      })
      .select('ID')
      .single();

    results.push({
      id: anchor?.ID ?? '',
      label: obj.label,
      subjectLat,
      subjectLng,
      subjectBearingDeg: bearing,
      subjectDistanceM: distanceM,
      graphNodeId,
    });
  }

  return new Response(
    JSON.stringify({ success: true, anchors: results }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
});
