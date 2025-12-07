import Crypto from 'crypto'
import { Database } from '../database'
import { validateCID, validateUID } from './validate'

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
    alterDesc(f: (desc: Desc | null) => Desc) {
        return this.db.desc.alter(f)
    }

    members() {
        return this.db.members.read()
    }
    alterMembers(f: (list: MemberListItem[] | null) => MemberListItem[]) {
        return this.db.members.alter(f)
    }
}

export class Service {
    private readonly db
    constructor(db: Database) {
        const tbl  = db.table('channels')
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
            if (await this.db.desc(cid).tryWrite({ createdAt: Date.now(), creator: by, name }))
                return new Channel(cid, this.db)
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

