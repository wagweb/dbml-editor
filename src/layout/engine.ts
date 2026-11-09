import ELK from 'elkjs/lib/elk-api.js'
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url'
import type { ElkLike } from './elk'

let engine: ElkLike | undefined

/** Layout engine running in a web worker, created on first use. */
export function getLayoutEngine(): ElkLike {
  engine ??= new ELK({ workerUrl: elkWorkerUrl })
  return engine
}
