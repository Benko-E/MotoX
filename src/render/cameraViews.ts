import type { Config } from '../config'

/**
 * The camera views C goes through, in order: the chase views from
 * config.camera.views, then the helmet view (from the rider's head), then the
 * free-fly camera, then round to the first again.
 */
export function cameraModes(config: Config): string[] {
  return [...Object.keys(config.camera.views), 'helmet', 'fly']
}

/** The view after `mode`. */
export function nextCameraMode(config: Config, mode: string): string {
  const modes = cameraModes(config)
  return modes[(modes.indexOf(mode) + 1) % modes.length]
}
