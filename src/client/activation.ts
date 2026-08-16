export const DESKTOP_SESSION_ACTIVATION_EVENT = 'dsh-notify-center:activate-session'
export const DESKTOP_SESSION_ACTIVATION_VERSION = 1

interface SessionActivationDetail {
  readonly version: typeof DESKTOP_SESSION_ACTIVATION_VERSION
  readonly sessionId: string
  readonly turn?: number
}

export interface SessionActivationPort {
  readonly list: {
    getSnapshot(): {
      readonly byId: Readonly<Record<string, unknown>>
    }
  }
  open(sessionId: string): void
  subagentAddress(sessionId: string): unknown
}

export interface SessionActivationLogger {
  warn(message: string): void
}

type ActivationEventTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseSessionActivationDetail(value: unknown): SessionActivationDetail | null {
  if (!isRecord(value)) return null
  const keys = Object.keys(value)
  if (keys.some(key => key !== 'version' && key !== 'sessionId' && key !== 'turn')) return null
  if (value.version !== DESKTOP_SESSION_ACTIVATION_VERSION) return null
  if (
    typeof value.sessionId !== 'string'
    || value.sessionId.length === 0
    || value.sessionId.length > 512
    || value.sessionId.trim() !== value.sessionId
  ) return null
  if (
    value.turn !== undefined
    && (!Number.isSafeInteger(value.turn) || (value.turn as number) < 0)
  ) return null
  return {
    version: DESKTOP_SESSION_ACTIVATION_VERSION,
    sessionId: value.sessionId,
    ...(value.turn === undefined ? {} : { turn: value.turn as number }),
  }
}

export function registerDesktopSessionActivation(
  target: ActivationEventTarget,
  sessions: SessionActivationPort,
  logger: SessionActivationLogger = console,
): () => void {
  const listener: EventListener = (event) => {
    const detail = parseSessionActivationDetail((event as CustomEvent<unknown>).detail)
    if (!detail) {
      logger.warn('[dsh-notify-center] ignored invalid desktop session activation')
      return
    }

    try {
      const listed = Object.prototype.hasOwnProperty.call(
        sessions.list.getSnapshot().byId,
        detail.sessionId,
      )
      if (!listed && !sessions.subagentAddress(detail.sessionId)) {
        logger.warn('[dsh-notify-center] ignored desktop activation for an unknown session')
        return
      }
      sessions.open(detail.sessionId)
    } catch {
      logger.warn('[dsh-notify-center] desktop session activation failed')
    }
  }

  target.addEventListener(DESKTOP_SESSION_ACTIVATION_EVENT, listener)
  return () => target.removeEventListener(DESKTOP_SESSION_ACTIVATION_EVENT, listener)
}
