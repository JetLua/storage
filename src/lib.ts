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
