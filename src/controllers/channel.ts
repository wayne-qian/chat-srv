import { Controller, Route, Get, Tags, Body, Put, Security, Request, Path, Post, Delete } from "tsoa";
import { Forbidden, NotFound } from "../error";
import { Service } from '../services/channel'
import { db } from '../database'
import { dispatcher } from './message'
import { miscs } from './misc'

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
        await req.user.addChannel(ch.id)

        const desc = await ch.desc()
        await miscs.updateStats(0, 1)
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
        if (!desc) throw new NotFound('channel not found')
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
        const { newObj: desc, updated } = await ch.updateDesc(req.user.id, body.name)

        if (updated) {
            const members = await ch.members()
            if (members && members.length) {
                await dispatcher.dispatch<Message.Event>(members.map(v => v.uid), ts => {
                    return {
                        event: 'channel',
                        to: cid,
                        from: req.user.id,
                        ts
                    }
                })
            }
        }
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
    ): Promise<void> {
        const { newObj: members, updated } = await chns.of(cid).addMember(req.user.id)
        await req.user.addChannel(cid)

        if (updated) {
            await dispatcher.dispatch<Message.Event>(members.map(v => v.uid), ts => {
                return {
                    event: 'join',
                    to: cid,
                    from: req.user.id,
                    ts
                }
            })
        }
    }
    /**
     * @summary Leave the channel.
     */
    @Delete('{cid}')
    async leave(
        @Path() cid: Channel.ID,
        @Request() req: Express.Request
    ): Promise<void> {
        const { newObj: members, updated } = await chns.of(cid).removeMember(req.user.id)
        await req.user.removeChannel(cid)

        if (updated && members.length) {
            await dispatcher.dispatch<Message.Event>(members.map(v => v.uid), ts => {
                return {
                    event: 'leave',
                    to: cid,
                    from: req.user.id,
                    ts
                }
            })
        }
    }

}

