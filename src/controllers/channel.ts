import { Controller, Route, Get, Tags, Body, Put, Security, Request, Path, Post, Delete } from "tsoa";
import { Conflict, Forbidden, NotFound } from "../error";
import { Service } from '../services/channel'
import { db } from '../database'
import { dispatcher } from './message'

export const chns = new Service(db)

@Route("channels")
@Tags('Channel')
@Security('api_key')
export class ChannelController extends Controller {

    /**
     * @summary Create a new channel.  
     */
    @Post()
    async create(
        @Body() body: Channel.Create,
        @Request() req: Express.Request
    ): Promise<Channel.Desc> {
        const ch = await chns.create(req.user.id, body.name)
        await ch.alterMembers(_ => {
            return [{ uid: req.user.id }]
        })

        await req.user.alterChannels(list => {
            return [...list || [], { cid: ch.id }]
        })
        const desc = await ch.desc()
        return { ...desc!, cid: ch.id }
    }


    /**
     * @summary Get user's channel list.
     */
    @Get()
    async getList(
        @Request() req: Express.Request
    ): Promise<User.ChannelListItem[]> {
        return await req.user.channels() || []
    }

    /**
     * @summary Get the channel's description.
     */
    @Get('{cid}/desc')
    async getDesc(
        @Path() cid: Channel.ID
    ): Promise<Channel.Desc> {
        const desc = await chns.of(cid).desc()
        if (!desc)
            throw new NotFound('channel not found')
        return { ...desc, cid }
    }

    /**
     * @summary Update the channel's description.
     */
    @Put('{cid}/desc')
    async updateDesc(
        @Path() cid: Channel.ID,
        @Body() body: Channel.UpdateDesc,
        @Request() req: Express.Request
    ): Promise<Channel.Desc> {
        const ch = chns.of(cid)
        const desc = await ch.alterDesc(desc => {
            if (!desc)
                throw new NotFound('channel not found')
            if (desc.creator !== req.user.id)
                throw new Forbidden('not allowed')
            return { ...desc, name: body.name }
        })

        const members = await ch.members() || []
        await dispatcher.dispatch<Message.Event>(members.map(v => v.uid), ts => {
            return {
                event: 'channel',
                to: cid,
                from: req.user.id,
                ts
            }
        })
        return { ...desc, cid }
    }

    /**
     * @summary Get the channel's member list.
     */
    @Get('{cid}/members')
    async getMembers(
        @Path() cid: Channel.ID,
        @Request() req: Express.Request
    ): Promise<Channel.MemberListItem[]> {
        const members = await chns.of(cid).members()
        if (!members)
            throw new NotFound('channel not found')
        if (!members.find(v => v.uid === req.user.id))
            throw new Forbidden('not in channel')
        return members
    }

    /**
     * @summary Join the channel.
     */
    @Post('{cid}')
    async join(
        @Path() cid: Channel.ID,
        @Request() req: Express.Request
    ) {
        let eventReceivers: string[] | undefined
        await chns.of(cid).alterMembers(list => {
            if (!list)
                throw new NotFound('channel not found')
            if (list.find(v => v.uid === req.user.id))
                throw new Conflict('already in channel')
            eventReceivers = list.map(v => v.uid)
            return [...list, { uid: req.user.id }]
        })

        await req.user.alterChannels(list => {
            if (!list)
                return [{ cid: cid }]
            return list.find(v => v.cid === cid) ? list : [...list, { cid }]
        })

        if (eventReceivers && eventReceivers.length) {
            await dispatcher.dispatch<Message.Event>(eventReceivers, ts => {
                return {
                    event: 'join',
                    to: cid,
                    from: req.user.id,
                    ts
                }
            })
        }
        return {}
    }
    /**
     * @summary Leave the channel.
     */
    @Delete('{cid}')
    async leave(
        @Path() cid: Channel.ID,
        @Request() req: Express.Request
    ) {
        let eventReceivers: string[] | undefined
        await chns.of(cid).alterMembers(list => {
            if (!list)
                throw new NotFound('channel not found')
            const newList = list.filter(v => v.uid != req.user.id)
            if (newList.length == list.length)
                throw new Forbidden('not in channel')
            eventReceivers = newList.map(v => v.uid)
            return newList
        })

        await req.user.alterChannels(list => {
            return (list || []).filter(v => v.cid != cid)
        })

        if (eventReceivers && eventReceivers.length) {
            await dispatcher.dispatch<Message.Event>(eventReceivers, ts => {
                return {
                    event: 'leave',
                    to: cid,
                    from: req.user.id,
                    ts
                }
            })
        }
        return {}
    }

}

