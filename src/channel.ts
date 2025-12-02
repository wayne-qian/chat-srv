import Crypto from 'crypto'
import { Database } from './database'

import Desc = Channel.Desc
import Member = Channel.Member

export class Channel {
    private readonly db
    constructor(readonly id: string, db: Service['db']) {
        this.db = {
            desc: db.desc(id),
            members: db.members(id),
        }
    }
    desc() {
        return this.db.desc.read()
    }
    alterDesc(f: (desc: Desc | null) => Desc) {
        return this.db.desc.alter(f)
    }

    members() {
        return this.db.members.read()
    }
    alterMembers(f: (list: Member[] | null) => Member[]) {
        return this.db.members.alter(f)
    }
}

export namespace Channel {
    export type Desc = {
        createdAt: number
        creator: string
        name: string
    }
    export type Member = { uid: string }

    export class Service {
        private readonly db
        constructor(db: Database) {
            this.db = {
                has(cid: string) { return db.channels.hasKey(`${cid}.desc`) },
                desc(cid: string) { return db.channels.keyOfJSON<Desc>(`${cid}.desc`) },
                members(cid: string) { return db.channels.keyOfJSON<Member[]>(`${cid}.members`) },
            }
        }

        async create(by: string, name: string) {
            for (; ;) {
                const cid = Crypto.randomBytes(8).toString('hex');
                if (await this.db.desc(cid).tryWrite({ createdAt: Date.now(), creator: by, name }))
                    return new Channel(cid, this.db)
            }
        }

        of(cid: string) {
            return new Channel(cid, this.db)
        }

        exists(cid: string) {
            return this.db.has(cid)
        }
    }
}

import Service = Channel.Service
