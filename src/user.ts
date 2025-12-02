import Crypto from 'crypto'
import { Conflict, Unauthorized } from './error'
import { Database } from './database'

import Desc = User.Desc
import Channel = User.Channel
import Auth = User.Auth

const defaultAlgo = 'sha256'
function buildAuth(key: string, pass: string, algo = defaultAlgo): Auth {
    const hmac = Crypto.createHmac(algo, key)
        .update(pass)
        .digest()
        .toString('hex')

    return { hmac, algo }
}

export class User {
    private readonly db
    constructor(readonly id: string, db: Service['db']) {
        this.db = {
            auth: db.auth(id),
            desc: db.desc(id),
            channels: db.channels(id),
            peers: db.peers(id),
        }
    }

    async verify(pass: string) {
        const auth = await this.db.auth.read()
        if (!auth) throw new Unauthorized('uid not found')

        const got = buildAuth(this.id, pass, auth.algo)
        if (got.hmac !== auth.hmac)
            throw new Unauthorized('wrong uid or password')
    }

    desc() {
        return this.db.desc.read()
    }
    auth() {
        return this.db.auth.read()
    }
    alterDesc(f: (desc: Desc | null) => Desc) {
        return this.db.desc.alter(f)
    }
    updatePassword(pass: string) {
        return this.db.auth.write(buildAuth(this.id, pass))
    }
    channels() {
        return this.db.channels.read()
    }

    alterChannels(f: (list: Channel[] | null) => Channel[]) {
        return this.db.channels.alter(f)
    }

    peers() {
        return this.db.peers.read()
    }

    addPeer(uid: string) {
        return this.db.peers.alter(list => {
            if (!list)
                return [{ uid }]
            return list.find(v => v.uid === uid) ? list : [...list, { uid }]
        })
    }
}

export namespace User {
    export type Desc = {
        createAt: number
        name: string
    }

    export type Auth = {
        hmac: string
        algo: string
    }

    export type Token = {
        uid: string
        hmac: string
        timestamp: number
    }

    export type Channel = {
        cid: string
    }
    export type Peer = {
        uid: string
    }

    export class Service {
        private readonly db
        constructor(db: Database) {
            this.db = {
                has(uid: string) { return db.users.hasKey(`${uid}.desc`) },
                desc(uid: string) { return db.users.keyOfJSON<Desc>(`${uid}.desc`) },
                auth(uid: string) { return db.users.keyOfJSON<Auth>(`${uid}.auth`) },
                channels(uid: string) { return db.users.keyOfJSON<Channel[]>(`${uid}.chs`) },
                peers(uid: string) { return db.users.keyOfJSON<Peer[]>(`${uid}.peers`) },
                token(s: string) { return db.tokens.keyOfJSON<Token>(s) }
            }
        }

        async create(uid: string, pass: string, name: string) {
            if (!await this.db.desc(uid).tryWrite({ createAt: Date.now(), name }))
                throw new Conflict('uid already exist')

            await this.db.auth(uid).write(buildAuth(uid, pass))
            return new User(uid, this.db)
        }

        async uidFromToken(token: string) {
            const tokenObj = await this.db.token(token).read()
            if (!tokenObj)
                throw new Unauthorized('invalid token')

            const auth = await this.db.auth(tokenObj.uid).read()
            if (auth!.hmac !== tokenObj.hmac)
                throw new Unauthorized('token expired')
            return tokenObj.uid
        }

        of(uid: string) {
            return new User(uid, this.db)
        }

        exists(uid: string) {
            return this.db.has(uid)
        }

        async newToken(uid: string) {
            const auth = await this.of(uid).auth()
            if (!auth) throw new Unauthorized('uid not found')
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
}

import Service = User.Service