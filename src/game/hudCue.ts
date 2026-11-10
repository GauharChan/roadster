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

/** 与世界竖直速度同号的整数。死区内留空。 */
export function formatClimb(vy: number): string {
  if (!Number.isFinite(vy) || Math.abs(vy) < 0.5) return ''
  const signed = Math.round(vy)
  const shown = signed === 0 ? (vy > 0 ? 1 : -1) : signed
  if (shown > 0) return `+${shown}`
  return `${shown}`
}

/** 把升降并进高度旁，并写明这是竖直速度。 */
export function climbLabel(vy: number): string {
  const climb = formatClimb(vy)
  if (!climb) return ''
  return `竖直 ${climb} m/s`
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
