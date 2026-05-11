import {B2} from '@iro/b2'
import {Hono} from 'hono'
import {customAlphabet} from 'nanoid'
import {Cloudflare} from 'cloudflare'
import {zValidator as zv} from '@hono/zod-validator'
import {mkdir, readdir, rm} from 'node:fs/promises'
import {pipeline} from 'node:stream/promises'
import {resolve} from 'node:path'

import {httpErr, co, mime} from './lib'
import * as ship from './ship'
import {createWriteStream} from 'node:fs'

const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 10)
const app = new Hono()
const cf = new Cloudflare({
  apiToken: process.env.CF_TOKEN
})
const tasks = new Map<string, {
  status: 'start' | 'finish' | 'trancode'
}>()

// 清空零时目录
await rm('tmp', {recursive: true, force: true})

// 开始大文件上传 反回upload id
app.get('/lf/start', async c => {
  let r

  while (true) {
    const k = nanoid()
    // 查看是否存在
    if (tasks.has(k)) continue
    r = k
    break
  }
  tasks.set(r, {status: 'start'})
  // 创建目录
  await mkdir(`tmp/${r}`, {recursive: true})

  return c.text(r)
})

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

async function trancode(fid: string) {
  const abs = resolve(`tmp/${fid}/output`)
  const ft = await mime(abs)
  const suffix = ft === 'video' ? 'mp4' : 'webp'
  let r
  r = Bun.spawn([
    'ffmpeg', '-i', 'output', `${fid}.${suffix}`
  ], {cwd: `tmp/${fid}`})
  console.log(await r.exited)
}

export default app
