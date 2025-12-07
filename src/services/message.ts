import { Database } from '../database'
import { RWLock, Signal, sleep } from '../util'

export interface WithTS { ts: number }

class Queue<T extends WithTS> {
    private msgs: T[] = []
    private activeTs = Date.now()
    private readonly signal = new Signal()
    constructor(dispose: () => void) {
        // housekeeping
        (async () => {
            for (; ;) {
                await sleep(60 * 60 * 1000)
                const now = Date.now()
                if (now > this.activeTs + 2 * 24 * 60 * 60 * 1000) { // no activity in 2 days
                    dispose()
                    return
                }

                const len = this.msgs.length
                if (len > 20000 || (len > 1000 && now > this.msgs[len >> 1].ts + 24 * 60 * 60 * 1000)) {
                    this.msgs = this.msgs.slice(len >> 1)
                }
            }
        })()
    }

    add(msg: T) {
        this.msgs.push(msg)
        this.signal.signal()
    }

    get(since: number, limit: number) {
        this.activeTs = Date.now()

        const len = this.msgs.length
        if (!len) return []
        if (since > this.msgs[len - 1].ts) return []

        let l = -1, r = len
        while (l + 1 != r) {
            const m = (l + r) >> 1
            if (since < this.msgs[m].ts)
                r = m
            else
                l = m
        }
        return this.msgs.slice(r, limit)
    }

    hasNew() { return this.signal.wait() }
}


export class Dispatcher<T extends WithTS> {
    private readonly queues: { [topic in string]?: Queue<T> } = {}
    private lock = new RWLock()
    private lastTs = 0

    dispatch<U extends T>(receivers: string[],buildMsg: (ts: number) => Promise<U> | U, ) {
        // why? to keep ts of queued msgs in order
        return this.lock.wLock('', async () => {
            const ts = this.lastTs = Math.max(Date.now(), this.lastTs + 1)
            const msg = await buildMsg(ts)
            for (const to of new Set(receivers))
                this.queues[to]?.add(msg)
            return msg
        })
    }

    get(to: string) {
        let s = this.queues[to]
        if (!s) {
            s = new Queue(() => { delete this.queues[to] })
            this.queues[to] = s
        }
        return {
            async pull(since: number, limit: number, timeout: number) {
                const msgs = s.get(since, limit)
                if (msgs.length) return msgs
                await Promise.race([sleep(timeout), s.hasNew()])
                return s.get(since, limit)
            }
        }
    }
}

export class Persist<T extends object> {
    private readonly db
    constructor(db: Database) {
        const tbl = db.table('messages')
        this.db = {
            has(key: string) { return tbl.has(`${key}.list`) },
            list(key: string) { return tbl.bigList<T>(`${key}.list`) }
        }
    }

    exists(key: string) {
        return this.db.has(key)
    }

    of(key: string) {
        const s = this.db.list(key)
        return {
            async count() { return s.count() },
            async save(msg: T) {
                const n = await s.append(msg)
                return n - 1
            },
            query(start: number, limit: number) {
                return s.range(start, limit)               
            }
        }
    }
}

