import { Database } from '../database'
import NodeCache from 'node-cache'
import { validateHostname, validateIP } from './validate'

export interface Stats {
    user: number
    channel: number
}

export interface Visits {
    ts: number
    total: number
    hours: { [i in number]: number }
    days: { [i in number]: number }
}

function count(delta: number, limit: number, o: Visits['hours']) {
    const a: typeof o = { 0: 0 }
    for (let i = 0; i < limit; i++) {
        const c = o[delta + i]
        if (c)
            a[i] = c
    }
    a[0]++
    return a
}

function sum(o: Visits['hours']) {
    let c = 0
    for (const x of Object.values(o)) {
        c += x
    }
    return c
}

export class Service {
    private readonly db
    private readonly visitTTL = new NodeCache({ stdTTL: 60, checkperiod: 30 })

    constructor(db: Database) {
        this.db = {
            stats: db.table('misc').json<Stats>('stats'),
            visits(hostname: string) { return db.table('misc').json<Visits>(`${hostname}.visits`) }
        }
    }

    updateStats(dUser: number, dChannel: number) {
        return this.db.stats.alter(s => {
            if (!s) return { user: dUser, channel: dChannel }
            return { user: s.user + dUser, channel: s.channel + dChannel }
        })
    }

    stats() {
        return this.db.stats.read()
    }

    // rank

    async visits(hostname: string, clientIP: string) {
        validateHostname(hostname)
        validateIP(clientIP)
        const ttlKey = `${hostname}/${clientIP}`
        let vObj
        if (!this.visitTTL.ttl(ttlKey)) {
            this.visitTTL.set(ttlKey, {})
            const r = await this.db.visits(hostname).alter(vis => {
                if (!vis) {
                    return {
                        ts: Date.now(),
                        hours: { 0: 1 },
                        days: { 0: 1 },
                        total: 1
                    }
                }
                const dHour = Math.floor((Date.now() - vis.ts) / 3600 / 1000)
                const dDay = Math.floor(dHour / 24)

                vis.ts = Date.now()
                vis.total++
                vis.hours = count(dHour, 24, vis.hours)
                vis.days = count(dDay, 7, vis.days)

                return vis
            })
            vObj = r.newObj
        }

        vObj = vObj || await this.db.visits(hostname).read()
        return {
            day: sum(vObj!.hours),
            week: sum(vObj!.days),
            total: vObj!.total
        }
    }
}
