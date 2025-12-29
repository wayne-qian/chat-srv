import { Controller, Get, Post, Body, Route, Security, Request, Path, Put, Tags } from 'tsoa'
import { Service } from '../services/user'
import { db } from '../database'
import { NotFound, Unauthorized } from '../error'
import Express from 'express'
import { miscs } from './misc'

export const users = new Service(db)

@Route()
@Tags('User')
export class UserWithoutSecController extends Controller {
    /**
     * @summary Register a new user.
     */
    @Post('users')
    async create(
        @Body() body: User.Create
    ): Promise<User.CreateResp> {
        const u = await users.create(
            body.uid.toLowerCase(),
            body.password,
            body.name || body.uid)

        const desc = await u.desc()
        const token = await users.newToken(u.id)
        await miscs.updateStats(1, 0)
        return {
            desc: { ...desc!, uid: u.id },
            token: token!
        }
    }

    /**
     * @summary Create an access token, or say login.
     */
    @Post('tokens')
    async createToken(
        @Body() body: User.CreateToken
    ): Promise<User.CreateResp> {
        const u = users.of(body.uid)
        if (!await u.verify(body.password))
            throw new Unauthorized()

        const token = await users.newToken(u.id)
        if (!token)
            throw new Unauthorized()

        const desc = await u.desc()
        return {
            desc: { ...desc!, uid: u.id },
            token
        }
    }

    /**
     * @summary Get description of the user specified by id. 
     */
    @Get('users/{uid}/desc')
    async getDescByID(
        @Path() uid: User.ID
    ): Promise<User.Desc> {
        const u = users.of(uid)
        const desc = await u.desc()
        if (!desc) throw new NotFound('uid not found')
        return { ...desc, uid: u.id }
    }
}

@Route()
@Tags('User')
@Security('api_key')
export class UserController extends Controller {
    /**
     * @summary Update the password of the current user.
     */
    @Put('password')
    async updatePassword(
        @Body() body: User.UpdatePassword,
        @Request() req: Express.Request
    ): Promise<Omit<User.CreateResp, 'desc'>> {
        const u = req.user
        if (!await u.verify(body.password))
            throw new Unauthorized()
        await u.updatePassword(body.newPassword)
        return { token: (await users.newToken(u.id))! }
    }

    /**
     * @summary Get description of the current user.
     */
    @Get('desc')
    async getDesc(
        @Request() req: Express.Request
    ): Promise<User.Desc> {
        const u = req.user
        const desc = await u.desc()
        return { ...desc!, uid: u.id }
    }

    /**
     * @summary Update description of the current user.
     */
    @Put('desc')
    async updateDesc(
        @Body() body: User.UpdateDesc,
        @Request() req: Express.Request
    ): Promise<User.Desc> {
        const u = req.user
        const { newObj: desc } = await u.updateDesc(body.name)
        return { ...desc, uid: u.id }
    }

    /**
     * @summary Get a list of users who ever privately chatted with the current user.
     */
    @Get('peers')
    async getPeers(
        @Request() req: Express.Request
    ): Promise<User.PeerListItem[]> {
        return await req.user.peers() || []
    }

    @Get('data/{key}')
    async getData(
        @Path() key: User.DataKey,
        @Request() req: Express.Request
    ): Promise<User.Data> {
        return await req.user.data(key) || {}
    }

    @Put('data/{key}')
    async updateData(
        @Path() key: User.DataKey,
        @Body() body: User.Data,
        @Request() req: Express.Request
    ): Promise<void> {
        return req.user.updateData(key, body)
    }
}

export async function expressAuthentication(
    request: Express.Request,
    securityName: string,
    scopes?: string[]
) {
    const token = request.header('xToken')
    if (token && /^[0-9a-f]+$/.test(token)) {
        const uid = await users.uidFromToken(token)
        if (uid)
            return users.of(uid)
    }
    throw new Unauthorized()
}
