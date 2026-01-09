/**
 * Plugins Directory Index
 * 
 * Central export for all built-in plugins
 */

export { threeJSPlugin, ThreeJSRenderer } from './threejs-renderer';

// Export list of all built-in plugins for auto-registration
export const builtinPlugins = [
  () => import('./threejs-renderer'),
];
