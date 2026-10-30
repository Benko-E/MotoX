import type { Ranges } from '../ui/tunables'

/** Slider ranges for map values, shared by every map. */
export const mapRanges: Ranges = {
  size: [200, 2000, 50],
  cellSize: [1, 8, 0.5],
  'hills.seed': [0, 9999, 1],
  'hills.height': [0, 120, 0.5],
  'hills.wavelength': [20, 600, 5],
  'hills.octaves': [1, 8, 1],
  'hills.roughness': [0, 1, 0.01],
  'clearing.x': [-450, 450, 5],
  'clearing.z': [-450, 450, 5],
  'clearing.radius': [0, 150, 1],
  'clearing.blend': [0, 150, 1],
  'clearing.calm': [0, 1, 0.05],
  'edge.start': [0, 1000, 5],
  'edge.rise': [0, 200, 1],
}
