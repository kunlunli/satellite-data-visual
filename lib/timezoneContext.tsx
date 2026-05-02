'use client'

import { createContext, useContext } from 'react'

export interface TimezoneCtx {
  /** IANA timezone string, or null for elapsed flight-time mode. */
  timezone: string | null
  /** First data row's timestamp in microseconds since Unix epoch. */
  t0Us: number
}

export const TimezoneContext = createContext<TimezoneCtx>({ timezone: null, t0Us: 0 })
export const useTimezone = () => useContext(TimezoneContext)
