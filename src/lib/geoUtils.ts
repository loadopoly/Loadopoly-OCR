/**
 * Geospatial utility functions.
 *
 * Provides great-circle (Haversine) distance calculations for
 * accurate Earth-surface proximity measurements.
 *
 * Unlike a flat-Earth approach that compares raw degree differences
 * (which behaves like Manhattan distance on a projected grid and
 * ignores the convergence of meridians at high latitudes), these
 * functions compute true arc-length distances along the sphere.
 *
 * @module lib/geoUtils
 */

const EARTH_RADIUS_M = 6_371_000;

/**
 * Great-circle distance between two lat/lng points in metres,
 * computed using the Haversine formula.
 *
 * Unlike a flat-Earth (degree-difference) approximation, this correctly
 * accounts for Earth's curvature and the convergence of meridians at
 * high latitudes, giving accurate proximity results at any location.
 *
 * @param lat1  Latitude of point 1 in decimal degrees
 * @param lng1  Longitude of point 1 in decimal degrees
 * @param lat2  Latitude of point 2 in decimal degrees
 * @param lng2  Longitude of point 2 in decimal degrees
 * @returns     Great-circle distance in metres
 */
export function haversineDistanceM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lng2 - lng1);
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(Δλ / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
