import {B2} from '@iro/b2'
import {Hono} from 'hono'
import {customAlphabet} from 'nanoid'
import {Cloudflare} from 'cloudflare'
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
  status: 'start' | 'finish' | 'trancode',
  url?: string
  err?: string
  prefix?: string
  bid: string
}>()

// 清空零时目录
await rm('tmp', {recursive: true, force: true})

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

  tasks.set(r, {status: 'start', ..._r.data})
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
  const ouput = createWriteStream(`tmp/${fid}/output`)
  files.sort((a, b) => +a - +b)
  for (const f of files) {
    await pipeline(
      Bun.file(`tmp/${fid}/${f}`).stream(),
      ouput,
      {end: false}
    )
  }
  // 完成之后后台进行转码
  task.status = 'finish'
  trancode(fid)
  return c.json(files)
}))

app.get('/q', zv('query', ship.q, async (_r, c) => {
  if (!_r.success) throw httpErr.InvalidParams
}))

async function trancode(fid: string) {
  const abs = resolve(`tmp/${fid}/output`)
  const ft = await mime(abs)
  const suffix = ft === 'video' ? 'mp4' : 'webp'
  const {prefix, bid} = tasks.get(fid)!
  let r
  r = Bun.spawn([
    'ffmpeg', '-i', 'output', `${fid}.${suffix}`
  ], {cwd: `tmp/${fid}`})
  r = await r.exited
  if (r) return tasks.get(fid)!.err = '转码失败'
  // 上传到b2
  // 1. 获取上传地址
  r = await b2.getUploadUrl(bid)
  const file = Bun.file(`tmp/${fid}/${fid}.${suffix}`)
  // todo: 大文件分片
  r = await b2.uploadFile({
    file,
    url: r.uploadUrl,
    headers: {
      authorization: r.authorizationToken,
      'content-length': file.size,
      'x-bz-file-name': `${prefix}/${fid}`,
      'x-bz-content-sha1': await sha1(file)
    }
  })
  console.log(r)
}

export default app
