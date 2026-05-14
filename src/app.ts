import {B2} from '@iro/b2'
import {Hono} from 'hono'
import {customAlphabet} from 'nanoid'
import {zValidator as zv} from '@hono/zod-validator'
import {mkdir, readdir, rm} from 'node:fs/promises'
import {pipeline} from 'node:stream/promises'
import {resolve} from 'node:path'

import {httpErr, sha1, mime} from './lib'
import * as ship from './ship'
import {createWriteStream} from 'node:fs'

const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 10)
const app = new Hono()
const b2 = new B2({id: process.env.B2_ID, key: process.env.B2_TOKEN})
await b2.auth()
const tasks = new Map<string, {
  status: 'downloading' | 'downloaded' | 'transcoding' | 'transcoded' | 'uploading' | 'done',
  path?: string
  err?: string
  prefix?: string
  suffix?: string
  bid: string
}>()

// 清空零时目录
// await rm('tmp', {recursive: true, force: true})

// 开始大文件上传 反回upload id
app.get('/lf/start', zv('query', ship.lf.start, async (_r, c) => {
  if (!_r.success) throw httpErr.InvalidParams
  let r

  while (true) {
    const k = nanoid()
    // 查看是否存在
    if (tasks.has(k)) continue
    r = k
    break
  }

  tasks.set(r, {status: 'downloading', ..._r.data})
  // 创建目录
  await mkdir(`tmp/${r}`, {recursive: true})

  return c.text(r)
}))

app.patch('/lf/part', zv('form', ship.lf.part, async (_r, c) => {
  if (!_r.success) throw httpErr.InvalidParams
  const {data: {fid, index, file}} = _r
  if (!tasks.has(fid)) throw httpErr.new(`${fid}: 不存在`)
  await Bun.write(`tmp/${fid}/${index}`, file)
  return c.body(null)
}))

app.patch('/lf/finish', zv('json', ship.lf.finish, async (_r, c) => {
  if (!_r.success) throw httpErr.InvalidParams
  const {data: {fid}} = _r
  const task = tasks.get(fid)
  if (!task) throw httpErr.new(`${fid}: 不存在`)
  const files = await readdir(`tmp/${fid}`)
  const ouput = createWriteStream(`tmp/${fid}/output`, {autoClose: false})
  files.sort((a, b) => +a - +b)
  for (const f of files) {
    await pipeline(
      Bun.file(`tmp/${fid}/${f}`).stream(),
      ouput,
      {end: false}
    )
  }
  ouput.close()
  // 完成之后后台进行转码
  task.status = 'downloaded'
  transcode(fid)
  return c.json(files)
}))

app.get('/q', zv('query', ship.q, async (_r, c) => {
  if (!_r.success) throw httpErr.InvalidParams
  const task = tasks.get(_r.data.fid)
  if (!task) throw httpErr.NotFound
  if (task.err) throw httpErr.new(task.err)
  return c.text(task.path ?? '')
}))

// 只转码
async function transcode(fid: string) {
  const abs = resolve(`tmp/${fid}/output`)
  const ft = await mime(abs)
  const suffix = ft === 'video' ? 'mp4' : 'webp'
  const task = tasks.get(fid)!
  task.status = 'transcoding'
  task.suffix = suffix
  let r
  r = Bun.spawn([
    'ffmpeg', '-i', 'output', `${fid}.${suffix}`
  ], {cwd: `tmp/${fid}`})
  r = await r.exited
  if (r) {
    task.err = '转码失败'
    task.status = 'done'
    // 转码失败就清空文件
    await rm(`tmp/${fid}`, {force: true, recursive: true})
  } else {
    task.status = 'transcoded'
    // 上传
    upload(fid)
      .catch(() => {
        task.err = '上传失败'
        task.status = 'done'
      })
      .finally(() => {
        rm(`tmp/${fid}`, {force: true, recursive: true})
      })
    // 进行下一个转码任务
    for (const [k, v] of tasks) {
      if (v.status === 'downloaded') {
        transcode(k)
        break
      }
    }
  }
}

async function upload(fid: string) {
  const task = tasks.get(fid)!
  task.status = 'uploading'
  const {prefix, bid, suffix} = task
  const fileName = prefix ? `${prefix}/${fid}` : fid
  const file = Bun.file(`tmp/${fid}/${fid}.${suffix}`)
  const size = file.size
  const chunkSize = 5 * 1024 ** 2
  const n = Math.ceil(size / chunkSize)
  const ct = suffix === 'mp4' ? 'video/mp4' : 'image/webp'

  let r
  // 单文件上传
  if (n < 2) {
    // 上传到b2
    // 1. 获取上传地址
    r = await b2.getUploadUrl(bid)
    r = await b2.uploadFile({
      file,
      url: r.uploadUrl,
      headers: {
        authorization: r.authorizationToken,
        'content-type': ct,
        'content-length': file.size,
        'x-bz-file-name': fileName,
        'x-bz-content-sha1': await sha1(file)
      }
    })

  } else {
    const {fileId} = await b2.startLargeFile({bucketId: bid, fileName, contentType: ct})
    const results = []
    const CAP = 5
    let count = 0
    while (count < n) {
      const delta = n - count
      const cap = Math.min(CAP, delta)

      r = await Promise.all(Array.from({length: cap}, async (_, i) => {
        const j = count + i
        const chunk = file.slice(j * chunkSize, (j + 1) * chunkSize)
        const {uploadUrl, authorizationToken} = await b2.getUploadPartUrl(fileId)

        return b2.uploadPart({
          file: chunk,
          url: uploadUrl,
          headers: {
            authorization: authorizationToken,
            'x-bz-content-sha1': await sha1(chunk),
            'x-bz-part-number': j + 1,
            'content-length': chunk.size
          }
        })
      }))

      count += cap

      results.push(...r)
    }

    r = await b2.finishLargeFile({
      fileId,
      partSha1Array: results.map(item => item.contentSha1)
    })
  }

  // 写入完成任务
  task.status = 'done'
  task.path = fileName
  // 下一个
  for (const [k, v] of tasks) {
    if (v.status === 'transcoded') {
      upload(k)
      break
    }
  }
}

export default app
