import { Controller, Route, Post, Tags, Security, Get, Query, Request, Path, Body } from "tsoa";
import { Dispatcher, Persist } from "../services/message";
import { db } from "../database";
import { users } from './user'
import { chns } from './channel'
import { Forbidden } from "../error";

export const dispatcher = new Dispatcher<Message.Common | Message.Event>()
const persist = new Persist<Compacted>(db)

const nonces: { [uid in string]: { nonce: number, i: number } } = {}


type Compacted = {
    f: string // from
    c: string // content     
    t: number // timestamp
}

@Route('messages')
@Tags('Message')
@Security('api_key')
export class MessageController extends Controller {
    /**
     * @summary Post message to some user or channel.
     */
    @Post()
    async postMessage(
        @Body() body: Message.Post,
        @Request() req: Express.Request
    ): Promise<Message.PostResp> {
        const nonceRec = nonces[req.user.id]
        if (nonceRec && nonceRec.nonce == body.nonce)
            return { i: nonceRec.i }

        const { key, members } = await prepareFromTo(req.user.id, body.to)
        const msg = await dispatcher.dispatch<Message.Common>(members, async ts => {
            const i = await persist.of(key).save({
                f: req.user.id,
                c: body.content,
                t: ts
            })
            return { i, from: req.user.id, to: body.to, content: body.content, ts }
        })

        if (!msg.i && body.to.startsWith('@')) {
            const peer = body.to.slice(1)
            await Promise.all([
                users.of(req.user.id).addPeer(peer),
                users.of(peer).addPeer(req.user.id)])
        }
        nonces[req.user.id] = { nonce: body.nonce, i: msg.i }
        return { i: msg.i }
    }

    /**
     * @summary Pull new messages for the current user.
     */
    @Get()
    async getMessages(
        @Query() since: Timestamp,
        @Query() limit: Int,
        @Request() req: Express.Request
    ): Promise<(Message.Common | Message.Event)[]> {
        const result = await dispatcher.get(req.user.id)
            .pull(since, Math.min(limit, 100), 10 * 1000)
        return result
    }

    /**
     * @summary Query history messages with some user or channel.
     * 
     * @param _with channel id or \@\{user id\}
     * @param start the index start from 0
     * @param limit max count of records returned
     */
    @Get('{with}')
    async getMessagesWith(
        @Path('with') _with: Message.To,
        @Query() start: Int,
        @Query() limit: Int,
        @Request() req: Express.Request
    ): Promise<Omit<Message.Common, 'to'>[]> {
        const { key } = await prepareFromTo(req.user.id, _with)

        limit = Math.min(limit, 100)
        if (start < 0) {
            const count = await persist.of(key).count()
            start = Math.max(0, count - limit)
        }

        const list = await persist.of(key).query(start, limit)
        return list.map<Omit<Message.Common, 'to'>>((e, i) => {
            return {
                i: start + i,
                from: e.f,
                content: e.c,
                ts: e.t
            }
        })
    }
}


async function prepareFromTo(from: string, to: string) {
    if (to.startsWith('@')) {
        to = to.slice(1)
        if (!await users.exists(to))
            throw new Forbidden('uid not found')
        return {
            key: from < to ? `${from}+${to}` : `${to}+${from}`,
            members: [from, to]
        }
    } else {
        const cid = to
        const members = await chns.of(cid).members() || []
        if (!members.find(v => v.uid === from))
            throw new Forbidden('not in channel')
        return { key: cid, members: members.map(v => v.uid) }
    }
}