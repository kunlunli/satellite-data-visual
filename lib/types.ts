export type ViewKey = 'azel' | 'pae' | 'rssi'

export interface SatelliteDataRow {
  timestamp: number
  cur_joint_Y: number
  cur_joint_X: number
  cur_az: number
  cur_el: number
  target_az: number
  target_el: number
  pae_joint_Y: number
  pae_joint_X: number
  cs_center_az: number
  cs_center_el: number
  cs_target_az: number
  cs_target_el: number
  rssi: number
  tx_enable: boolean
  /** milliseconds elapsed since the first row */
  flightTimeMs: number
}
