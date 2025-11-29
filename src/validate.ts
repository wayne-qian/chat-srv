import { BadRequest, Unauthorized } from './error'

function isString(v: unknown): v is string {
    return typeof v === 'string'
}

export function sanitizeUID(uid: unknown) {
    if (isString(uid)) {
        const s = uid.trim().toLowerCase()
        if (/^[a-z][a-z0-9]{2,15}$/.test(s))
            return s
    }
    throw new BadRequest('bad user id');
}

export function validateUID(uid: unknown) {
    if (isString(uid)) {
        if (/^[a-z][a-z0-9]+$/.test(uid))
            return uid
    }
    throw new BadRequest('bad user id');
}

export function sanitizeName(name: unknown) {
    if (isString(name)) {
        const s = name.trim()
        if (s.length && s.length < 30)
            return s
    }
    throw new BadRequest('bad name');
}

export function validatePassword(pass: unknown, strict = false) {
    if (isString(pass)) {
        if (!strict)
            return pass
        if (pass.length >= 6 && pass.length <= 20)
            return pass
    }
    throw new BadRequest('bad user password')
}

export function validateToken(token: unknown) {
    if (isString(token) && /^[0-9a-f]+$/.test(token))
        return token
    throw new Unauthorized('invalid token')
}

export function validateCID(cid: unknown) {
    if (isString(cid) && /^[0-9a-f]+$/.test(cid))
        return cid
    throw new BadRequest('bad channel id')
}


export function validateMsgContent(c: unknown) {
    if (isString(c) && c.length > 0 && c.length < 1024)
        return c

    throw new BadRequest('bad content')
}

export function validateRequestBody<T>(o : T){
    if(typeof o !== 'object')  
        throw new BadRequest('request body not an object')
    return o
}