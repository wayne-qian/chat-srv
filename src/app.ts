import Express, { RequestHandler, ErrorRequestHandler } from 'express';
import Cors from 'cors'
import BodyParser from 'body-parser'
import OS from 'os'
import Path from 'path'
import Morgan from 'morgan'

import { User } from './user'
import { Channel } from './channel'
import { Message } from './message'
import { BadRequest, Forbidden } from './error';
import { Database } from './database';
import { sanitizeName, sanitizeUID, validateCID, validateMsgContent, validatePassword, validateRequestBody, validateToken, validateUID } from './validate'

const db = new Database(Path.join(OS.homedir(), '.chat-db'))
const users = new User.Service(db)
const chns = new Channel.Service(db)
const msgs = new Message.Persist<Message.Compacted>(db)
const msgd = new Message.Dispatcher<Message.Regular | Message.Event>()

const app = Express();
app.use(Morgan('dev'))
app.use(Cors())
app.use(BodyParser.json())

const port = 3000;

app.get('/', async (req, res) => {
    res.send('This is the chat server!');
});

app.post('/users', async (req, res) => {
    const body = validateRequestBody(req.body)
    const uid = sanitizeUID(body.uid)
    const password = validatePassword(body.password, true)
    const name = sanitizeName(body.uid)

    await users.create(uid, password, name)
    const token = await users.newToken(uid)
    res.json({ token })
})

app.get('/users/:uid/desc', async (req, res) => {
    const uid = validateUID(req.params)
    const desc = await users
        .of(uid)
        .desc()
    res.json(desc)
})

app.post('/tokens', async (req, res) => {
    const body = validateRequestBody(req.body)
    const uid = sanitizeUID(body.uid)
    const password = validatePassword(body.password)

    await users.of(uid).verify(password)
    const token = await users.newToken(uid)
    res.json({ token })
})

// authenticate
app.use(async (req, res, next) => {
    const token = validateToken(req.header('xToken'))
    req.uid = await users.uidFromToken(token)
    next()
})

app.get('/peers', async (req, res) => {
    const peers = await users.of(req.uid).peers() || []
    res.json(peers)
})

app.put('/password', async (req, res) => {
    const body = validateRequestBody(req.body)
    const password = validatePassword(body.password)
    const newPassword = validatePassword(body.newPassword, true)

    const u = users.of(req.uid)
    await u.verify(password)
    await u.updateAuth(newPassword)
    const token = await users.newToken(req.uid)
    res.json({ token })
})

app.get('/desc', async (req, res) => {
    const desc = await users.of(req.uid).desc()
    res.json(desc)
})
app.put('/desc', async (req, res) => {
    const body = validateRequestBody(req.body)
    const name = sanitizeName(body.name)
    res.json(await users.of(req.uid).updateDesc(name))
})

const nonces: { [uid in string]: number } = {}

app.post('/messages', async (req, res) => {
    const body = validateRequestBody(req.body)
    const to = body.to
    const content = validateMsgContent(body.content)
    const nonce = parseInt(body.nonce)
    if (typeof to !== 'string')
        throw new BadRequest('invalid to')
    if (isNaN(nonce))
        throw new BadRequest('invalid nonce')

    if (nonces[req.uid] === nonce)
        return res.json({})

    const { key, members } = await prepareFromTo(req.uid, to)
    const ts = Date.now()
    const i = await msgs.of(key).save({
        f: req.uid,
        c: content,
        t: ts
    })
    if (!i && to.startsWith('@')) {
        const peer = to.slice(1)
        users.of(req.uid).addPeer(peer)
        users.of(peer).addPeer(req.uid)
    }
    msgd.dispatch({ i, from: req.uid, to, content, ts }, members)
    nonces[req.uid] = nonce
    res.json({})
})

app.get('/messages', async (req, res) => {
    const since = parseInt(req.query.since as string)
    const limit = parseInt(req.query.limit as string)
    if (!(since >= 0 && limit > 0))
        throw new BadRequest('invalid query')

    const result = await msgd.get(req.uid)
        .pull(since, Math.min(limit, 100), 10 * 1000)
    res.json(result)
})

app.get('/messages/:to', async (req, res) => {
    const start = parseInt(req.query.start as string)
    const limit = parseInt(req.query.limit as string)
    if (!(start >= 0 && limit > 0))
        throw new BadRequest('invalid query')

    const { key } = await prepareFromTo(req.uid, req.params.to)
    const { list, i0 } = await msgs.of(key).query(start, Math.min(limit, 100))
    res.json(list.map<Message.Regular<'omitTo'>>((e, i) => {
        return {
            i: i0 + i,
            from: e.f,
            content: e.c,
            ts: e.t
        }
    }))
})

// get channels list
app.get('/channels', async (req, res) => {
    const list = await users.of(req.uid).channels() || []
    res.json(list)
})

// create channel
app.post('/channels', async (req, res) => {
    const body = validateRequestBody(req.body)
    const name = sanitizeName(body.name)
    const ch = await chns.create(req.uid, name)
    await ch.addMember(req.uid)
    await users.of(req.uid).joinChannel(ch.id)
    res.json({ cid: ch.id })
})

// join channel
app.post('/channels/:cid', async (req, res) => {
    const cid = validateCID(req.params.cid)
    if (!await chns.exists(cid))
        throw new Forbidden('channel not found')
    await chns.of(cid).addMember(req.uid)
    await users.of(req.uid).joinChannel(cid)

    const { members } = await prepareFromTo(req.uid, cid)
    msgd.dispatch({
        event: 'join',
        src: req.uid,
        target: cid,
        ts: Date.now()
    }, members)
    res.json({})
})

// leave channel
app.delete('/channels/:cid', async (req, res) => {
    const cid = validateCID(req.params.cid)
    if (!await chns.exists(cid))
        throw new Forbidden('channel not found')
    await chns.of(cid).removeMember(req.uid)
    await users.of(req.uid).leaveChannel(cid)

    const { members } = await prepareFromTo(req.uid, cid)
    msgd.dispatch({
        event: 'leave',
        src: req.uid,
        target: cid,
        ts: Date.now()
    }, members)
    res.json({})
})

// get member list
app.get('/channels/:cid/members', async (req, res) => {
    const cid = validateCID(req.params.cid)
    const members = await chns.of(cid).members() || []
    if (!members.find(v => v.uid === req.uid))
        throw new Forbidden('not in channel')
    res.json(members)
})

app.get('/channels/:cid/desc', async (req, res) => {
    const cid = validateCID(req.params.cid)
    const desc = await chns.of(cid).desc()
    res.json(desc)
})

app.put('/channels/:cid/desc', async (req, res) => {
    const body = validateRequestBody(req.body)
    const cid = validateCID(req.params.cid)
    const name = sanitizeName(body.name)

    const ch = chns.of(cid)
    const desc = await ch.desc()
    if (!desc || desc.creator !== req.uid)
        throw new Forbidden('not allowed')

    res.json(await ch.updateDesc(name))
})

app.use(((err, req, res, next) => {
    if (err.status) {
        res.status(err.status).json({ error: err.message })
    } else {
        console.log(err)
        res.status(500).json({ error: "something wrong" })
    }
}) as ErrorRequestHandler)

app.listen(port, () => {
    console.log(`chat server is listening on ${port} !!!`);
});

async function prepareFromTo(from: string, to: string) {
    if (to.startsWith('@')) {
        to = validateUID(to.slice(1))
        if (!await users.exists(to))
            throw new Forbidden('uid not found')
        return {
            key: from < to ? `${from}&${to}` : `${to}&${from}`,
            members: [from, to]
        }
    } else {
        const cid = validateCID(to)
        const members = await chns.of(cid).members() || []
        if (!members.find(v => v.uid === from))
            throw new Forbidden('not in channel')
        return { key: cid, members: members.map(v => v.uid) }
    }
}