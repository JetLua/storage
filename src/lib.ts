import {HTTPException} from 'hono/http-exception'

export const httpErr = {
  Unauthorized: new HTTPException(401, {message: 'Unauthorized'}),
  Forbidden: new HTTPException(403, {message: 'Forbidden'}),
  Bad: new HTTPException(400, {message: 'Bad Request'}),
  Failed: new HTTPException(500, {message: 'Unknown Error'}),
  NotFound: new HTTPException(404, {message: 'Not Found'}),
  InvalidParams: new HTTPException(400, {message: 'Invalid Params'}),
  Limited: new HTTPException(429, {message: 'Too Many Requests'}),
  new: (s: string = 'Unknown Error', status?: ConstructorParameters<typeof HTTPException>[0]) => {
    return new HTTPException(status ?? 500, {message: s})
  }
}

export async function co<T>(p: Promise<T>) {
  return p.then(ok).catch(error)
}

export function error(data: unknown): [null, Error] {
  if (data instanceof Error) return [null, data]
  return [null, new Error(data as any)]
}

export function ok<T>(data: T): [T, null] {
  return [data, null]
}

export async function mime(path: string) {
  let r
  r = Bun.spawn([
    'ffprobe', '-v', 'quiet', '-print_format', 'json',
    '-show_format', '-show_streams', path
  ])
  // @ts-ignore
  r = JSON.parse(await r.stdout.text()) as {
    streams: Array<{
      index: number
      nb_frames: string
      profile: string
      disposition: [{}]
    }>
    format: {
      duration?: string
    }
  }
  const duration = +(r.format.duration ?? 0)
  if (duration) return 'video'
  return 'image'
}

export async function sha1(file: Bun.BunFile, encoding: Bun.DigestEncoding = 'hex') {
  const hasher = new Bun.CryptoHasher('sha1')
  const stream = file.stream()
  for await (const chunk of stream) {
    hasher.update(chunk)
  }
  return hasher.digest(encoding)
}
