
export class ErrorWithStatus extends Error {
    constructor(message: string, readonly status: number) {
        super(message)
    }
}

export class BadRequest extends ErrorWithStatus {
    constructor(message = 'bad request') {
        super(message, 400)
    }
}

export class Conflict extends ErrorWithStatus {
    constructor(message = 'conflict') {
        super(message, 409)
    }
}

export class Unauthorized extends ErrorWithStatus {
    constructor(message = 'unauthorized') {
        super(message, 401)
    }
}

export class Forbidden extends ErrorWithStatus {
    constructor(message = 'forbidden') {
        super(message, 403)
    }
}