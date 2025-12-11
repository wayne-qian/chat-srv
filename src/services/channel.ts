import Crypto from 'crypto'
import { Database } from '../database'
import { validateCID, validateUID } from './validate'
import { Forbidden, NotFound } from '../error'

export interface Desc {
    createdAt: number
    creator: string
    name: string
}
export interface MemberListItem { uid: string }

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

    updateDesc(by: string, name: string) {
        return this.db.desc.alter(desc => {
            if (!desc || desc.creator !== by) throw new Forbidden('not allowed')
            return { ...desc, name }
        })
    }

    members() {
        return this.db.members.read()
    }

    addMember(uid: string) {
        validateUID(uid)
        return this.db.members.alter(list => {
            if (!list) throw new Forbidden('not allowed')
            return list.find(v => v.uid === uid) ? list : [...list, { uid }]
        })
    }

    removeMember(uid: string) {
        validateUID(uid)
        return this.db.members.alter(list => {
            if (!list) throw new Forbidden('not allowed')
            return list.filter(v => v.uid !== uid)
        })
    }
}

export class Service {
    private readonly db
    constructor(db: Database) {
        const tbl = db.table('channels')
        this.db = {
            has(cid: string) { return tbl.has(`${cid}.desc`) },
            desc(cid: string) { return tbl.json<Desc>(`${cid}.desc`) },
            members(cid: string) { return tbl.json<MemberListItem[]>(`${cid}.members`) },
        }
    }

    async create(by: string, name: string) {
        validateUID(by)
        for (; ;) {
            const cid = Crypto.randomBytes(8).toString('hex');
            if (await this.db.desc(cid).tryWrite({ createdAt: Date.now(), creator: by, name })) {
                await this.db.members(cid).write([{ uid: by }])
                return new Channel(cid, this.db)
            }
        }
    }

    of(cid: string) {
        validateCID(cid)
        return new Channel(cid, this.db)
    }

    exists(cid: string) {
        validateCID(cid)
        return this.db.has(cid)
    }
}

