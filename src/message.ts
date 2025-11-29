import { Database } from './database'
import { Signal, sleep } from './util'

export namespace Message {

    export type Compacted = {
        f: string // from
        c: string // content     
        t: number // timestamp
    }

    export type Regular<T extends 'omitTo' | '' = ''> = {
        i: number
        from: string
        content: string
        ts: number
    } & (T extends 'omitTo' ? {} : {
        to: string
    })

    export type Event = {
        event: 'join' | 'leave'
        src: string
        target: string
        ts: number
    }

    class Queue<T extends object> {
        private msgs: { msg: T, t: number }[] = []
        private headPos = 0
        private activeTs = Date.now()

        readonly signal = new Signal()
        constructor(dispose: () => void) {
            // housekeeping
            (async () => {
                for (; ;) {
                    await sleep(1000 * 5)
                    const now = Date.now()
                    if (now > this.activeTs + 60 * 1000) {
                        dispose()
                        return
                    }

                    const len = this.msgs.length
                    if (len > 1000 && now > this.msgs[len >> 1].t + 60 * 60 * 1000) {
                        this.headPos += (len >> 1)
                        this.msgs = this.msgs.slice(len >> 1)
                    }
                }
            })()
        }

        add(msg: T) {
            this.msgs.push({ msg, t: Date.now() })
            this.signal.signal()
        }

        get(since: number, limit: number) {
            this.activeTs = Date.now()

            since = Math.min(
                Math.max(since, this.headPos),
                this.headPos + this.msgs.length)

            const msgs = this.msgs
                .slice(since - this.headPos, limit)
                .map(v => v.msg)
            return {
                msgs,
                next: since + msgs.length
            }
        }
    }


    export class Dispatcher<T extends object> {
        private readonly queues: { [topic in string]?: Queue<T> } = {}

        dispatch(msg: T, tos: string[]) {
            for (const to of new Set(tos))
                this.queues[to]?.add(msg)
        }

        get(to: string) {
            let s = this.queues[to]
            if (!s) {
                s = new Queue(() => { delete this.queues[to] })
                this.queues[to] = s
            }
            return {
                async pull(since: number, limit: number, timeout: number) {
                    const r = s.get(since, limit)
                    if (r.msgs.length) return r
                    await Promise.race([sleep(timeout), s.signal.wait()])
                    return s.get(since, limit)
                }
            }
        }
    }

    export class Persist<T extends object> {
        private readonly db
        constructor(db: Database) {
            this.db = {
                has(key: string) { return db.messages.hasKey(`${key}.list`) },
                list(key: string) { return db.messages.keyOfBigList<T>(`${key}.list`) }
            }
        }

        exists(key: string) {
            return this.db.has(key)
        }

        of(key: string) {
            const s = this.db.list(key)
            return {
                async save(msg: T) {
                    const i = await s.count()
                    await s.append(msg)
                    return i
                },
                async query(start: number, limit: number) {
                    const list = await s.range(start, limit)
                    return {
                        i0: start,
                        list
                    }
                }
            }
        }
    }
}
