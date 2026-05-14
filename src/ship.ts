import {z} from 'zod'

export namespace lf {
  export const start = z.object({
    /** bucket id */
    bid: z.string().nonempty(),
    /** prefix 文件夹 */
    prefix: z.string().optional().default('')
  })

  export const part = z.object({
    file: z.instanceof(File),
    fid: z.string().nonempty(),
    index: z.coerce.number()
  })

  export const finish = z.object({
    fid: z.string().nonempty()
  })
}

export const q = z.object({
  fid: z.string().nonempty()
})
