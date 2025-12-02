import Path from 'path'
import FS from 'fs'
import { RWLock } from './util'

export class Database {
    readonly users
    readonly tokens
    readonly channels
    readonly messages

    constructor(dir: string) {
        this.users = new Table(Path.join(dir, 'users'))
        this.tokens = new Table(Path.join(dir, 'tokens'))
        this.channels = new Table(Path.join(dir, 'channels'))
        this.messages = new Table(Path.join(dir, 'messages'))
    }
}

export namespace Database {
    async function readStr(path: string) {
        try {
            return await FS.promises.readFile(path, 'utf8')
        } catch (err: any) {
            if (err.code === 'ENOENT')
                return null
            throw err
        }
    }

    async function writeStr(path: string, s: string) {
        return FS.promises.writeFile(path, s)
    }

    async function tryWriteStr(path: string, s: string) {
        try {
            await FS.promises.writeFile(
                path,
                s, { flag: 'wx' })
            return true;
        } catch (err: any) {
            if (err.code === 'EEXIST')
                return false
            throw err
        }
    }

    async function fSize(path: string) {
        try {
            const stat = await FS.promises.stat(path)
            return stat.size;
        } catch (err: any) {
            if (err.code === 'ENOENT')
                return 0
            throw err
        }
    }

    async function readBytes(path: string, pos: number, len: number) {
        const h = await FS.promises.open(path)
        try {
            const buf = new Uint8Array(len)
            const r = await h.read(buf, { position: pos })
            if (r.bytesRead !== len)
                throw new Error('insufficient bytes')
            return buf
        }
        finally {
            await h.close()
        }
    }
    async function writeBytes(path: string, buf: Uint8Array, pos: number) {
        const h = await FS.promises.open(path, 'a')
        try {
            const r = await h.write(buf, { position: pos })
        } finally {
            await h.close()
        }
    }
    async function readLines(path: string, pos: number, limit?: number) {
        try {
            const h = await FS.promises.open(path)
            limit ||= Infinity
            try {
                const lines = []
                for await (const line of h.readLines({ start: pos, encoding: 'utf8' })) {
                    lines.push(line)
                    if (lines.length >= limit)
                        return lines
                }
                return lines
            } finally {
                await h.close()
            }
        } catch (err: any) {
            if (err.code === 'ENOENT')
                return []
            throw err
        }
    }

    export class Table {
        private readonly lock = new RWLock()
        constructor(private readonly dir: string) {
            FS.mkdirSync(dir, { recursive: true })
        }

        async hasKey(key: string) {
            const path = Path.join(this.dir, key)
            try {
                await FS.promises.access(path, FS.promises.constants.F_OK)
                return true
            } catch {
                return false
            }
        }

        keyOfJSON<T extends object>(key: string) {
            const path = Path.join(this.dir, key)
            const lock = this.lock
            return {
                async read(): Promise<T | null> {
                    const s = await lock.rLock(key, () => readStr(path))
                    if (s) return JSON.parse(s)
                    return null
                },

                write(obj: T) {
                    const s = JSON.stringify(obj)
                    return lock.wLock(key, () => writeStr(path, s))
                },
                async tryWrite(obj: T) {
                    const s = JSON.stringify(obj)
                    return lock.wLock(key, () => tryWriteStr(path, s))
                },
                alter(f: (obj: T | null) => T) {
                    return lock.wLock(key, async () => {
                        const s = await readStr(path)
                        const newObj = f(s ? JSON.parse(s) : null)
                        const newS = JSON.stringify(newObj)
                        if (s !== newS)
                            await writeStr(path, newS)
                        return newObj
                    })
                }
            }
        }

        keyOfBigList<T extends object>(key: string) {
            const path = Path.join(this.dir, key)
            const indexPath = Path.join(this.dir, `${key}.index`)
            const lock = this.lock

            const _count = (() => {
                let cached = { n: -1 }
                return async () => {
                    if (cached.n >= 0) return cached
                    const indexSize = await fSize(indexPath)
                    if (indexSize % 4)
                        throw new Error('corrupted index file')
                    let cnt = indexSize / 4 * 100
                    let pos = 0
                    if (indexSize) {
                        const bytes = await readBytes(indexPath, indexSize - 4, 4)
                        pos = new DataView(bytes.buffer).getUint32(0)
                    }
                    const lines = await readLines(path, pos)
                    cached.n = cnt + lines.length
                    return cached
                }
            })()

            return {
                count() {
                    return lock.rLock(key, async () => {
                        return (await _count()).n
                    })
                },
                append(obj: T) {
                    return lock.wLock(key, async () => {
                        const c = await _count()
                        if (c.n && !(c.n % 100)) {
                            const buf = new Uint8Array(4)
                            const view = new DataView(buf.buffer)
                            view.setUint32(0, await fSize(path))
                            await writeBytes(indexPath, buf, (c.n / 100 - 1) * 4)
                        }
                        const s = JSON.stringify(obj)
                        await FS.promises.appendFile(path, s + '\n')
                        c.n++
                        return c.n
                    })
                },
                range(start: number, limit: number) {
                    return lock.rLock(key, async () => {
                        const c = await _count()
                        if (start >= c.n)
                            return []

                        let pos = 0;
                        let indexPos = ((start - start % 100) / 100 - 1) * 4
                        if (indexPos >= 0) {
                            const bytes = await readBytes(indexPath, indexPos, 4)
                            pos = new DataView(bytes.buffer).getUint32(0)
                        }

                        let offset = start % 100
                        const lines = await readLines(path, pos, limit + offset)
                        return lines.slice(offset).map<T>(s => JSON.parse(s))
                    })
                }
            }
        }
    }
}


import Table = Database.Table


