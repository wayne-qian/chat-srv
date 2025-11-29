export class RWLock {
    private readonly wSem: { [k in string]: Promise<void> } = {}
    private readonly rSem: { [k in string]: {
        p: Promise<void>
        r: () => void
        c: number
    } } = {}


    async rLock<T>(scope: string, f: () => Promise<T>) {
        for (let w = this.wSem[scope]; w; w = this.wSem[scope])
            await w

        let s = this.rSem[scope]
        if (s)
            s.c++
        else {
            s = this.rSem[scope] = <any>{}
            s.p = new Promise<void>(resolve => {
                s.r = resolve
            })
            s.c = 1
        }

        try {
            return await f()
        } finally {
            s.c--
            if (!s.c) {
                s.r()
                delete this.rSem[scope]
            }
        }
    }

    async wLock<T>(scope: string, f: () => Promise<T>) {
        for (let w = this.wSem[scope]; w; w = this.wSem[scope])
            await w

        let release!: () => void
        this.wSem[scope] = new Promise(resolve => {
            release = resolve
        })

        for (let r = this.rSem[scope]; r; r = this.rSem[scope])
            await r.p

        try {
            return await f()
        } finally {
            release()
            delete this.wSem[scope]
        }
    }
}

export function sleep(ms: number) {
    return new Promise<void>(resolve => {
        setTimeout(resolve, ms)
    })
}

export class Signal {
    private p!: Promise<void>
    private r!: () => void

    constructor() {
        this.reset()
    }
    wait() {
        return this.p
    }
    signal() {
        this.r()
        this.reset()
    }
    private reset() {
        this.p = new Promise(resolve => {
            this.r = resolve
        })
    }
}



