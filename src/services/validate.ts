
export function validateUID(uid: string) {
    if (!/^[a-z][a-z0-9]*$/.test(uid))
        throw new Error('invalid uid')
}

export function validateCID(cid: string) {
    if (!/^[a-f0-9]+$/.test(cid))
        throw new Error('invalid cid')
}

export function validateToken(token: string) {
    if (!/^[a-f0-9]+$/.test(token))
        throw new Error('invalid token')
}