import {Serve} from "./serve";

const VillaMap = new Map<number, Villa>()
const InfoMap = new Map<number, VillaInfo>()

export class Villa {
	private readonly vid: number;
	private c: Serve;

	private constructor(c: Serve, vid: number) {
		this.c = c
		this.vid = vid
	}

	static get(c: Serve, vid: number) {
		if (VillaMap.has(vid)) return VillaMap.get(vid)
		else {
			let villa = new Villa(c, vid)
			VillaMap.set(vid, villa)
			return villa
		}
	}

	static async getInfo(c:Serve, vid: number) {
		if (InfoMap.has(vid)) return InfoMap.get(vid)
		else {
			let info = await c.getVillaInfo(vid)
			InfoMap.set(vid, info)
			return info
		}
	}

	async info() {
		if (InfoMap.has(this.vid)) return InfoMap.get(this.vid)
		else {
			let info = await this.getVillaInfo()
			InfoMap.set(this.vid, info)
			return info
		}
	}

	/** 获取大别野信息 */
	async getVillaInfo() {
		const path = "/vila/api/bot/platform/getVilla"
		return (await this.c.fetchResult(this.vid, path, 'get', "")).villa
	}

	/** 获取大别野成员列表 */
	async getVillaUsers(size: number, offset_str: string = "") {
		const path = "/vila/api/bot/platform/getVillaMembers"
		return await this.c.fetchResult(this.vid, path, 'get', `?offset_str=${offset_str}&size=${size}`)
	}

	/** 提出大别野用户 */
	async kickUser(uid: number) {
		const path = "/vila/api/bot/platform/deleteVillaMember"
		return await this.c.fetchResult(this.vid, path, "post", "", {uid: uid})
	}

	/** 获取别野用户信息 */
	async getMemberInfo(uid: number) {
		const path = "/vila/api/bot/platform/getMember"
		return (await this.c.fetchResult(this.vid, path, 'get', `?uid=${uid}`)).member
	}
}

export type RoomType = "BOT_PLATFORM_ROOM_TYPE_CHAT_ROOM"	        //聊天房间
	| "BOT_PLATFORM_ROOM_TYPE_POST_ROOM"	                        //帖子房间
	| "BOT_PLATFORM_ROOM_TYPE_SCENE_ROOM"	                        //场景房间
	| "BOT_PLATFORM_ROOM_TYPE_INVALID"	                            //无效

export type NoticeType = "BOT_PLATFORM_DEFAULT_NOTIFY_TYPE_NOTIFY"	//默认通知
	| "BOT_PLATFORM_DEFAULT_NOTIFY_TYPE_IGNORE"	                    //默认免打扰
	| "BOT_PLATFORM_DEFAULT_NOTIFY_TYPE_INVALID"	                //无效

export interface RoomInfo {
	room_id: number	                        //房间 id
	room_name: string	                    //房间名称
	room_type: RoomType	                    //房间类型
	group_id: number	                    //分组 id
	room_default_notify_type: NoticeType	//房间默认通知类型
	send_msg_auth_range: {
		is_all_send_msg: boolean            //是否全局可发送
		roles: Array<number>                //可发消息的身份组 id
	}	                                    //房间消息发送权限范围设置
}

export interface VillaInfo {
	villa_id: number	        //大别野 id
	name: string	            //名称
	villa_avatar_url: string	//别野头像链接
	owner_uid: number	        //别野主人 id
	is_official: boolean	    //是否是官方别野
	introduce: string	        //介绍
	category_id: number
	tags: string[]	            //标签
}