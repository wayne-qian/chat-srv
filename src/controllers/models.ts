/**
 * @isInt
 */
type Int = number

/**
 * @isLong
 */
type Long = number


/**
 * @isLong
 */
type Timestamp = number

namespace User {
    /**
     * @pattern ^[a-z][a-z0-9]*$
     * @example "wangcai"
     */
    export type ID = string

    /**
     * @minLength 6 password too short
     * @maxLength 20 password too long
     * @example "aStrongPassword"
     */
    export type Password = string

    /**
     * @pattern ^[a-zA-Z][a-zA-Z0-9]*$ invalid uid
     * @minLength 3 uid too short
     * @maxLength 16 uid too long
     * @example "WangCai"
     */
    export type UserInputID = string

    /**
     * @pattern ^[a-z0-9]+$ invalid data key
     * @maxLength 10 data key too long
     * @example "x"
     */
    export type DataKey = string

    export interface Create {
        uid: UserInputID

        /**
         * @minLength 1
         * @maxLength 20
         * @example "旺财"
         */
        name?: string
        password: Password
    }

    export interface CreateToken {
        uid: UserInputID
        password: string
    }

    export interface CreateResp {
        desc: Desc
        token: string
    }

    export interface UpdatePassword {
        password: string
        newPassword: Password
    }

    export interface UpdateDesc {
        /**
         * @minLength 1
         * @maxLength 30
         */
        name: string
    }

    export interface Desc {
        uid: ID
        name: string
        createdAt: Timestamp
    }

    export interface ChannelListItem {
        cid: Channel.ID
    }
    export interface PeerListItem {
        uid: ID
    }

    export interface Data {
        [key: string]: any
    }
}

namespace Channel {
    /**
     * @pattern ^[a-f0-9]+$
     */
    export type ID = string

    export interface Create {
        /**
         * @minLength 1
         * @maxLength 30
         */
        name: string
    }

    export interface UpdateDesc {
        /**
         * @minLength 1
         * @maxLength 30
         */
        name: string
    }

    export interface Desc {
        cid: ID
        createdAt: Timestamp
        creator: User.ID
        name: string
    }


    export interface MemberListItem {
        uid: User.ID
    }
}

namespace Message {
    /**
     * @pattern ^(@[a-z][a-z0-9]*|[a-f0-9]+)$
     */
    export type To = string

    export interface Post {
        to: To
        /**
         * @minLength 1
         * @maxLength 2048
         */
        content: string
        nonce: Long
    }
    export interface PostResp {
        i: Int
    }
    export interface Common {
        i: Int
        from: User.ID
        to: To
        content: string
        ts: Timestamp
    }

    export interface Event {
        event: 'join' | 'leave' | 'channel'
        from: User.ID
        to: To
        ts: Timestamp
    }
}

namespace Misc {
    export interface Stats {
        user: Int
        channel: Int
        online: Int
    }
    export interface Visits {
        total: Int
        hour: Int
        day: Int
        week: Int
    }

    /**
     * @pattern ^[a-z0-9]+$ invalid rank name
     * @maxLength 10 rank name too long
     * @example "game"
     */
    export type RankName = string

    export interface RankRecord {
        uid: User.ID
        score: number
        ts: Timestamp
    }
    export interface UpdateRankRecord {
        score: number
    }
}