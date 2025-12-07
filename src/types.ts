import { User } from './services/user'
declare global {
    namespace Express {
        interface Request {
            user: User
        }
    }
}
