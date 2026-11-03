/** A number picked with a slider and a number box. */
export type SliderSetting = {
  kind: 'slider'
  id: string
  name: string
  tab: string
  section: string
  min: number
  max: number
  step: number
  default: number
  unit: string
  /** Shown under the row, to explain what the number means. */
  note?: string
}

/** A debug line drawn in the world (or a debug readout), switched on and off with a checkbox. In "Copy changes" when it differs from its default, like a slider. */
export type LineSetting = {
  kind: 'line'
  id: string
  name: string
  tab: string
  section: string
  default: boolean
  /** The colour it's drawn in, so the menu can show it. None for a readout that isn't drawn in the world. */
  color?: number
  note?: string
}

export type Setting = SliderSetting | LineSetting
