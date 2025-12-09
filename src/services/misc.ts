import { Database } from '../database'

export interface Stats {
    user: number
    channel: number
}

export class Service {
    private readonly db
    constructor(db: Database) {
        this.db = {
            stats: db.table('misc').json<Stats>('stats')
        }
    }

    addUserCount() {
        return this.db.stats.alter(s => {
            if (!s) return { user: 1, channel: 0 }
            return { ...s, user: s.user + 1 }
        })
    }

    addChannelCount() {
        return this.db.stats.alter(s => {
            if (!s) return { user: 0, channel: 1 }
            return { ...s, channel: s.channel + 1 }
        })
    }

    stats() {
        return this.db.stats.read()
    }
}