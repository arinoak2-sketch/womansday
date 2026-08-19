/**
 * The icon set.
 *
 * One consistent drawing style — 24px grid, 1.6 stroke, round caps and joins,
 * no fills — so icons read as a family. Anything that needs a different weight
 * scales via `size`; the stroke is scaled with it so a 16px icon isn't chunky.
 */

import type { SVGProps } from 'react'

export type IconName =
  | 'plus'
  | 'minus'
  | 'arrow-left'
  | 'arrow-right'
  | 'arrow-up-right'
  | 'chevron-down'
  | 'chevron-right'
  | 'check'
  | 'close'
  | 'search'
  | 'sparkle'
  | 'target'
  | 'chart'
  | 'trophy'
  | 'settings'
  | 'home'
  | 'edit'
  | 'trash'
  | 'info'
  | 'alert'
  | 'calendar'
  | 'clock'
  | 'tag'
  | 'refresh'
  | 'sun'
  | 'moon'
  | 'display'
  | 'volume-on'
  | 'volume-off'
  | 'image'
  | 'archive'
  | 'flag'
  | 'download'
  | 'upload'
  | 'wallet'
  | 'more'

/** Path data only — every icon inherits the same stroke presentation. */
const PATHS: Record<IconName, string> = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  'arrow-left': 'M19 12H5m0 0 6-6m-6 6 6 6',
  'arrow-right': 'M5 12h14m0 0-6-6m6 6-6 6',
  'arrow-up-right': 'M7 17 17 7m0 0H8m9 0v9',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-right': 'm9 6 6 6-6 6',
  check: 'm4.5 12.5 5 5 10-11',
  close: 'M6 6l12 12M18 6 6 18',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
  sparkle:
    'M12 3.5 13.6 9 19 10.5 13.6 12 12 17.5 10.4 12 5 10.5 10.4 9 12 3.5ZM18.5 15.5l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0-3a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  chart: 'M4 20h16M7 20v-6m5 6V6m5 14v-9',
  trophy:
    'M8 4h8v5a4 4 0 0 1-8 0V4Zm0 1H5.5A2.5 2.5 0 0 0 8 9.5M16 5h2.5A2.5 2.5 0 0 1 16 9.5M12 13v3m-3 4h6m-6 0 .5-2h5l.5 2',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.13-1.36l2-1.5-2-3.46-2.34.94a7.5 7.5 0 0 0-2.35-1.36L14.2 2.5h-4l-.38 2.36a7.5 7.5 0 0 0-2.35 1.36l-2.34-.94-2 3.46 2 1.5a7.5 7.5 0 0 0 0 2.72l-2 1.5 2 3.46 2.34-.94a7.5 7.5 0 0 0 2.35 1.36l.38 2.36h4l.38-2.36a7.5 7.5 0 0 0 2.35-1.36l2.34.94 2-3.46-2-1.5c.09-.44.13-.9.13-1.36Z',
  home: 'M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-9.5Z',
  edit: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3ZM14.5 7.5l2 2',
  trash: 'M4.5 7h15M9 7V4.5h6V7m-8 0 .8 12a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L17 7M10 11v6m4-6v6',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-9.5V16m0-8h.01',
  alert: 'M12 8.5V13m0 3.5h.01M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20.2h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  calendar: 'M4.5 8.5h15M7 3.5V6m10-2.5V6M5.5 6h13a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13.5V12l3 2',
  tag: 'M3.5 11.2V4.5a1 1 0 0 1 1-1h6.7a1 1 0 0 1 .7.3l8.3 8.3a1 1 0 0 1 0 1.4l-6.7 6.7a1 1 0 0 1-1.4 0L3.8 11.9a1 1 0 0 1-.3-.7ZM7.75 7.75h.01',
  refresh: 'M20 12a8 8 0 1 1-2.34-5.66M20 4v4.5h-4.5',
  sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 2v2m0 16v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M2 12h2m16 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M20 14.3A8.5 8.5 0 0 1 9.7 4a8.5 8.5 0 1 0 10.3 10.3Z',
  display: 'M4 5.5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1ZM8.5 20.5h7M12 16.5v4',
  'volume-on': 'M4 9.5h3L11.5 5v14L7 14.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Zm11 .5a3.5 3.5 0 0 1 0 4m2.5-6.5a7 7 0 0 1 0 9',
  'volume-off': 'M4 9.5h3L11.5 5v14L7 14.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Zm11 .5 5 5m0-5-5 5',
  image: 'M4 5.5h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Zm.5 12 5-5 3.5 3.5 3-2.5 4.5 4M9 10.5a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z',
  archive: 'M3.5 6.5h17v3h-17v-3Zm1.5 3v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9M10 13h4',
  flag: 'M5 21V4m0 0h11l-2 3.5L16 11H5',
  download: 'M12 3.5v11m0 0 4-4m-4 4-4-4M4.5 17v2.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V17',
  upload: 'M12 14.5v-11m0 0 4 4m-4-4-4 4M4.5 17v2.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V17',
  wallet:
    'M3.5 7.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2m-15 0v10a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-2.5m-17-7.5h15.5a1.5 1.5 0 0 1 1.5 1.5V15m0 0h-3.5a2 2 0 0 1 0-4H21',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
}

/** Icons whose shapes read better filled than stroked. */
const FILLED = new Set<IconName>(['sparkle'])

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  /** Rendered size in px. Stroke width scales to keep optical weight even. */
  size?: number
}

/**
 * Stroke width in *screen* pixels, paired with `vector-effect: non-scaling-
 * stroke` below. Scaling the stroke with the viewBox would make a 16px icon
 * spindly and a 32px one heavy; pinning it to screen px and nudging it at the
 * extremes keeps every size looking like the same pen drew it.
 */
function strokeWidthFor(size: number): number {
  if (size <= 18) return 1.5
  if (size <= 28) return 1.6
  return 1.75
}

export function Icon({ name, size = 20, ...rest }: IconProps) {
  const filled = FILLED.has(name)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      // Icons here are always decorative: every control that uses one also has
      // a visible label or an aria-label, so announcing the glyph would just
      // duplicate it.
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path
        d={PATHS[name]}
        stroke={filled ? 'none' : 'currentColor'}
        fill={filled ? 'currentColor' : 'none'}
        strokeWidth={strokeWidthFor(size)}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
