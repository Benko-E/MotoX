/**
 * Moto tuning: every value that affects how the game feels lives in this file.
 *
 * Change a number, save, and the game in your browser reloads with it.
 * Each later step adds its own section here (bike, suspension, steering,
 * lean, camera follow, input ramps, crashes), and the tuning panel is built
 * from this file, so every value here gets a slider.
 */
export const config = {
  physics: {
    /** Physics steps per second. The bike is simulated in slices this small no
     * matter how fast your screen refreshes, so it handles the same on every
     * machine. Higher is more precise but costs more CPU. */
    stepHz: 120,
    /** Most physics steps one frame may run. If the game stalls (for example
     * the tab was in the background), it skips ahead instead of
     * fast-forwarding through everything it missed. */
    maxStepsPerFrame: 8,
  },

  camera: {
    /** Field of view in degrees. Wider feels faster but distorts the edges. */
    fov: 65,
  },
}

export type Config = typeof config
