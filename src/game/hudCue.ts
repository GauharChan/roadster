export type NoticeKind = 'none' | 'land' | 'recover' | 'reset'

export interface MomentNotice {
  kind: NoticeKind
  text: string
  remaining: number
}

const HOLD_SECONDS = 3

const COPY: Record<Exclude<NoticeKind, 'none'>, string> = {
  land: '已着陆',
  recover: '硬着陆，已扶正',
  reset: '已手动重置',
}

/** 与世界竖直速度同号。死区内不标上升或下降，避免贴地抖动。 */
export function formatClimb(vy: number): string {
  if (!Number.isFinite(vy) || Math.abs(vy) < 0.5) return '0'
  const signed = Math.round(vy)
  const shown = signed === 0 ? (vy > 0 ? 1 : -1) : signed
  if (shown > 0) return `+${shown} 上升`
  return `${shown} 下降`
}

export function showMoment(kind: Exclude<NoticeKind, 'none'>): MomentNotice {
  return { kind, text: COPY[kind], remaining: HOLD_SECONDS }
}

export function idleNotice(): MomentNotice {
  return { kind: 'none', text: '', remaining: 0 }
}

export function tickMoment(notice: MomentNotice, dt: number): MomentNotice {
  if (notice.kind === 'none') return notice
  const remaining = notice.remaining - dt
  if (remaining <= 0) return idleNotice()
  return { ...notice, remaining }
}
