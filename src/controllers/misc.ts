import { Controller, Get, Route, Tags, Request } from "tsoa";
import { Service } from '../services/misc'
import { db } from '../database'
import { onlineCount } from "./message";
import Express from 'express'
import { getClientIp } from 'get-client-ip'
import { URL } from 'url'

export const miscs = new Service(db)

@Route('misc')
@Tags('Misc')
export class MiscController extends Controller {
    /**
     * @summary Get system statistics.
     */
    @Get('stats')
    async getStats(): Promise<Misc.Stats> {
        const s = await miscs.stats()
        if (!s) return {
            user: 0,
            channel: 0,
            online: onlineCount()
        }
        return { ...s, online: onlineCount() }
    }

    /**
     * @summary Track visit counts of external websites.
     */
    @Get('visits')
    async getVisitCount(@Request() req: Express.Request): Promise<Misc.Visits> {
        const hostname = (() => {
            const origin = req.headers.origin
            if (origin) {
                try {
                    const u = new URL(origin)
                    return u.hostname
                } catch {
                }
            }
        })()

        if (hostname)
            return await miscs.visits(hostname, getClientIp(req) || '::1')

        return {
            total: 0,
            hour:0,
            day: 0,
            week: 0
        }
    }
}