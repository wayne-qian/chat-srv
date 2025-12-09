import { Controller, Get, Route, Tags } from "tsoa";
import { Service } from '../services/misc'
import { db } from '../database'
import { onlineCount } from "./message";
export const miscs = new Service(db)

@Route('misc')
@Tags('Misc')
export class MiscController extends Controller {
    /**
     * @summary Get system statistics.
     */
    @Get('stats')
    async getStats(): Promise<User.Stats> {
        const s = await miscs.stats()
        if (!s) return {
            user: 0,
            channel: 0,
            online: onlineCount()
        }
        return { ...s, online: onlineCount() }
    }
}