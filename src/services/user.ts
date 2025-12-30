import Crypto from 'crypto'
import { Conflict } from '../error'
import { Database } from '../database'
import { validateUID, validateToken, validateCID } from './validate'
export interface Desc {
    createdAt: number
    name: string
}

export interface Auth {
    hmac: string
    algo: string
}

export interface Token {
    uid: string
    hmac: string
    timestamp: number
}

export interface ChannelListItem {
    cid: string
}
export interface PeerListItem {
    uid: string
}

export class User {
    private readonly db
    constructor(readonly id: string, db: Service['db']) {
        this.db = {
            auth: db.auth(id),
            desc: db.desc(id),
            channels: db.channels(id),
            peers: db.peers(id),
            data: db.data(id)
        }
    }

    async verify(pass: string) {
        const auth = await this.db.auth.read()
        if (!auth) return false

        const got = buildAuth(this.id, pass, auth.algo)
        if (got.hmac !== auth.hmac)
            return false
        return true
    }

    desc() {
        return this.db.desc.read()
    }
    auth() {
        return this.db.auth.read()
    }

    updateDesc(name: string) {
        return this.db.desc.alter(desc => {
            return { ...desc!, name }
        })
    }

    updatePassword(pass: string) {
        return this.db.auth.write(buildAuth(this.id, pass))
    }
    channels() {
        return this.db.channels.read()
    }

    addChannel(cid: string) {
        validateCID(cid)
        return this.db.channels.alter(list => {
            if (!list) return [{ cid }]
            return list.find(v => v.cid === cid) ? list : [...list, { cid }]
        })
    }

    removeChannel(cid: string) {
        validateCID(cid)
        return this.db.channels.alter(list => {
            if (!list) return []
            return list.filter(v => v.cid !== cid)
        })
    }

    peers() {
        return this.db.peers.read()
    }

    addPeer(uid: string) {
        validateUID(uid)
        return this.db.peers.alter(list => {
            if (!list)
                return [{ uid }]
            return list.find(v => v.uid === uid) ? list : [...list, { uid }]
        })
    }

    async data(key: string) {
        const obj = await this.db.data.read()
        return obj ? obj[key] : null
    }

    updateData(key: string, data: object) {
        return this.db.data.alter(obj => {
            const newObj = { ...obj }
            newObj[key] = data
            return newObj
        })
    }
}


export class Service {
    private readonly db
    constructor(db: Database) {
        const usersTbl = db.table('users')
        const tokensTbl = db.table('tokens')
        this.db = {
            has(uid: string) { return usersTbl.has(`${uid}.desc`) },
            desc(uid: string) { return usersTbl.json<Desc>(`${uid}.desc`) },
            auth(uid: string) { return usersTbl.json<Auth>(`${uid}.auth`) },
            channels(uid: string) { return usersTbl.json<ChannelListItem[]>(`${uid}.chs`) },
            peers(uid: string) { return usersTbl.json<PeerListItem[]>(`${uid}.peers`) },
            data(uid: string) { return usersTbl.json<{ [k in string]: object }>(`${uid}.data`) },
            token(s: string) { return tokensTbl.json<Token>(s) }
        }
    }

    async create(uid: string, pass: string, name: string) {
        validateUID(uid)
        if (!await this.db.desc(uid).tryWrite({ createdAt: Date.now(), name }))
            throw new Conflict('uid already exist')

        await this.db.auth(uid).write(buildAuth(uid, pass))
        return new User(uid, this.db)
    }

    async uidFromToken(token: string) {
        validateToken(token)
        const tokenObj = await this.db.token(token).read()
        if (!tokenObj) return null

        const auth = await this.db.auth(tokenObj.uid).read()
        if (auth!.hmac !== tokenObj.hmac) return null
        return tokenObj.uid
    }

    of(uid: string) {
        validateUID(uid)
        return new User(uid, this.db)
    }

    exists(uid: string) {
        validateUID(uid)
        return this.db.has(uid)
    }

    async newToken(uid: string) {
        validateUID(uid)
        const auth = await this.of(uid).auth()
        if (!auth) return null
        return await this.generateToken(uid, auth)
    }

    private async generateToken(uid: string, auth: Auth) {
        for (; ;) {
            const token = Crypto.randomBytes(10).toString('hex')
            if (await this.db.token(token).tryWrite({
                uid: uid,
                hmac: auth.hmac,
                timestamp: Date.now()
            }))
                return token
        }
    }
}

const defaultAlgo = 'sha256'
function buildAuth(key: string, pass: string, algo = defaultAlgo): Auth {
    const hmac = Crypto.createHmac(algo, key)
        .update(pass)
        .digest()
        .toString('hex')

    return { hmac, algo }
}
