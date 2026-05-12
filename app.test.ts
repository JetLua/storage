import {test, expect} from 'bun:test'
import {resolve} from 'node:path'
import {B2} from '@iro/b2'
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
  r = await fetch('http://127.1:3000/lf/start?bid=849230d8e385e0f299b90a17&prefix=test')
  const fid = await r.text()
  // 分片上传
  {
    const file = Bun.file('1.mov')
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

// test('b2:upload', async () => {
//   const b2 = new B2({id: process.env.B2_ID, key: process.env.B2_TOKEN})
//   const bid = '849230d8e385e0f299b90a17'
//   const fid = ''
//   let r
//   r = await b2.getUploadUrl(bid)
//   const file = Bun.file(`tmp/${fid}/${fid}.${suffix}`)
//   r = await b2.uploadFile({
//     file,
//     url: r.uploadUrl,
//     headers: {
//       authorization: r.authorizationToken,
//       'content-length': file.size,
//       'x-bz-file-name': fid,
//       'x-bz-content-sha1': Bun.SHA1.hash(file, 'hex')
//     }
//   })
// })
