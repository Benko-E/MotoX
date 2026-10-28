import type { Ranges } from '../ui/tunables'

/** Slider ranges for map values, shared by every map. */
export const mapRanges: Ranges = {
  size: [200, 2000, 50],
  cellSize: [1, 8, 0.5],
  'hills.seed': [0, 9999, 1],
  'hills.height': [0, 60, 0.5],
  'hills.wavelength': [20, 600, 5],
  'hills.octaves': [1, 8, 1],
  'hills.roughness': [0, 1, 0.01],
  'flatArea.x': [-500, 500, 1],
  'flatArea.z': [-500, 500, 1],
  'flatArea.height': [-30, 30, 0.5],
  'edge.start': [0, 1000, 5],
  'edge.rise': [0, 200, 1],
  'lips.*.x': [-500, 500, 1],
  'lips.*.z': [-500, 500, 1],
  'lips.*.heading': [0, 360, 1],
  'lips.*.lipAngle': [5, 60, 1],
  'lips.*.backAngle': [5, 60, 1],
  'lips.*.height': [0, 15, 0.1],
  'ramps.*.x': [-500, 500, 0.5],
  'ramps.*.z': [-500, 500, 0.5],
  'ramps.*.heading': [0, 360, 1],
  'ramps.*.lipAngle': [5, 60, 1],
  'ramps.*.backAngle': [5, 60, 1],
  'ramps.*.height': [0, 10, 0.1],
}
