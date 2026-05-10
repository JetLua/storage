import {z} from 'zod'




export namespace lf {
  export const part = z.object({
    file: z.instanceof(File),
    fid: z.string().nonempty(),
    index: z.coerce.number()
  })

  export const finish = z.object({
    fid: z.string().nonempty()
  })
}
