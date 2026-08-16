import type { IncomingMessage, ServerResponse } from 'node:http'
import type { NotifyLogger } from './types.js'
import {
  NotificationSettingsStore,
  SettingsRevisionConflictError,
  SettingsValidationError,
  type SettingsPathOp,
} from './settings-store.js'

export const SETTINGS_API_PATH = '/api/dsh-notify-center/settings'
const MAX_REQUEST_BYTES = 64 * 1024

export interface SettingsRouteRegistry {
  register(route: {
    kind: 'exact'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

function normalizeHostname(value: string): string {
  return value.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0]
}

function isLoopback(value: string | undefined): boolean {
  if (!value) return false
  const host = normalizeHostname(value)
  return host === '127.0.0.1' || host === '::1' || host === '::ffff:127.0.0.1' || host === 'localhost'
}

function requestOrigin(req: IncomingMessage): URL {
  const host = req.headers.host
  if (!host) throw new HttpError(403, 'loopback host required')
  let origin: URL
  try {
    origin = new URL(`http://${host}`)
  } catch {
    throw new HttpError(403, 'loopback host required')
  }
  if (!isLoopback(origin.hostname)) throw new HttpError(403, 'loopback host required')
  return origin
}

function validateRequestSource(req: IncomingMessage): void {
  if (!isLoopback(req.socket.remoteAddress)) throw new HttpError(403, 'loopback access only')
  const expected = requestOrigin(req)
  const fetchSite = req.headers['sec-fetch-site']
  if (typeof fetchSite === 'string' && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    throw new HttpError(403, 'cross-origin request rejected')
  }
  const originHeader = req.headers.origin
  if (typeof originHeader === 'string') {
    let origin: URL
    try {
      origin = new URL(originHeader)
    } catch {
      throw new HttpError(403, 'invalid origin')
    }
    if (origin.protocol !== 'http:' || origin.origin !== expected.origin) {
      throw new HttpError(403, 'cross-origin request rejected')
    }
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown, head = false): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(head ? undefined : payload)
}

function readBody(req: IncomingMessage): Promise<string> {
  const contentLength = req.headers['content-length']
  if (typeof contentLength === 'string') {
    const parsed = Number(contentLength)
    if (!Number.isSafeInteger(parsed) || parsed < 0) throw new HttpError(400, 'invalid content length')
    if (parsed > MAX_REQUEST_BYTES) {
      req.resume()
      throw new HttpError(413, 'request body too large')
    }
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let settled = false
    const fail = (error: Error): void => {
      if (settled) return
      settled = true
      cleanup()
      req.resume()
      reject(error)
    }
    const cleanup = (): void => {
      req.off('data', onData)
      req.off('end', onEnd)
      req.off('error', onError)
      req.off('aborted', onAborted)
    }
    const onData = (chunk: Buffer | string): void => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.byteLength
      if (size > MAX_REQUEST_BYTES) {
        fail(new HttpError(413, 'request body too large'))
        return
      }
      chunks.push(buffer)
    }
    const onEnd = (): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve(Buffer.concat(chunks).toString('utf8'))
    }
    const onError = (): void => fail(new HttpError(400, 'request body could not be read'))
    const onAborted = (): void => fail(new HttpError(400, 'request was aborted'))
    req.on('data', onData)
    req.on('end', onEnd)
    req.on('error', onError)
    req.on('aborted', onAborted)
  })
}

async function readMutation(req: IncomingMessage): Promise<{ expectedRevision: number; ops: SettingsPathOp[] }> {
  const contentType = req.headers['content-type']
  if (typeof contentType !== 'string' || !contentType.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'application/json required')
  }
  const body = await readBody(req)
  let value: unknown
  try {
    value = JSON.parse(body)
  } catch {
    throw new HttpError(400, 'request body is not valid JSON')
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'request body is invalid')
  }
  const object = value as Record<string, unknown>
  return {
    expectedRevision: object.expectedRevision as number,
    ops: object.ops as SettingsPathOp[],
  }
}

export function createSettingsApiHandler(
  store: NotificationSettingsStore,
  logger: NotifyLogger = console,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    try {
      validateRequestSource(req)
      if (req.method === 'GET' || req.method === 'HEAD') {
        sendJson(res, 200, store.getView(), req.method === 'HEAD')
        return
      }
      if (req.method !== 'PATCH') {
        res.setHeader('allow', 'GET, HEAD, PATCH')
        throw new HttpError(405, 'method not allowed')
      }
      const mutation = await readMutation(req)
      sendJson(res, 200, await store.mutate(mutation.expectedRevision, mutation.ops))
    } catch (error) {
      if (error instanceof SettingsRevisionConflictError) {
        sendJson(res, 409, { error: { code: 'revision_conflict', message: error.message, revision: error.actualRevision } })
        return
      }
      if (error instanceof SettingsValidationError) {
        sendJson(res, 400, { error: { code: 'invalid_settings', message: error.message } })
        return
      }
      if (error instanceof HttpError) {
        sendJson(res, error.status, { error: { code: 'invalid_request', message: error.message } })
        return
      }
      logger.warn(`[dsh-notify-center] settings request failed: ${error instanceof Error ? error.name : 'unknown error'}`)
      sendJson(res, 500, { error: { code: 'internal_error', message: 'settings could not be saved' } })
    }
  }
}

export function registerSettingsApi(
  webServer: SettingsRouteRegistry,
  store: NotificationSettingsStore,
  logger: NotifyLogger = console,
): () => void {
  return webServer.register({
    kind: 'exact',
    path: SETTINGS_API_PATH,
    handler: createSettingsApiHandler(store, logger),
  })
}
