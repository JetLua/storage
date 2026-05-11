import {test, expect} from 'bun:test'
import {resolve} from 'node:path'
import {mime} from './src/lib'

test('mime', async () => {
  const r = await Promise.all([
    mime(resolve('1.mov')),
    mime(resolve('1.webp')),
    mime(resolve('final.heic')),
  ])
  expect(r).toEqual(['video', 'image', 'image'])
})

test('upload', async () => {
  let r
  r = await fetch('http://127.1:3000/lf/start')
  const fid = await r.text()
  // 分片上传
  {
    const file = Bun.file('1.MOV')
    const size = file.size
    const chunkSize = 5 * 1024 ** 2
    const n = Math.ceil(size / chunkSize)
    await Promise.all(Array.from({length: n}, (_, i) => {
      const body = new FormData()
      body.set('fid', fid)
      body.set('index', `${i}`)
      body.set('file', file.slice(i * chunkSize, (i + 1) * chunkSize))
      return fetch('http://127.1:3000/lf/part', {
        method: 'PATCH',
        body
      })
    }))
  }
  r = await fetch('http://127.1:3000/lf/finish', {
    method: 'PATCH',
    body: JSON.stringify({
      fid
    }),
    headers: {'content-type': 'application/json'}
  })
  r = await r.json()
  expect(r instanceof Array).toBe(true)
})
