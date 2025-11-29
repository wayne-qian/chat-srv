import Crypto from 'crypto'
import { Database } from './database'



export class Channel {
    private readonly db
    constructor(readonly id: string, db: Channel.Service['db']) {
        this.db = {
            desc: db.desc(id),
            members: db.members(id),
        }
    }
    desc() {
        return this.db.desc.read()
    }
    updateDesc(name: string) {
        return this.db.desc.alter(desc => {
            return { ...desc!, name }
        })
    }
    async members() {
        return await this.db.members.read()
    }
    addMember(uid: string) {
        return this.db.members.alter(list => {
            if (!list)
                return [{ uid }]
            return list.find(v => v.uid == uid) ? list : [...list, { uid }]
        })
    }
    removeMember(uid: string) {
        return this.db.members.alter(list => {
            if (!list)
                return []
            return list.filter(v => v.uid !== uid)
        })
    }
}

export namespace Channel {
    export type Desc = {
        createdAt: number
        creator: string
        name: string
    }
    type Member = { uid: string }

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

