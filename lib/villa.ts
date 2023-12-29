import {Bot, RobotRunTimeError} from "./bot";
import {Color, MemberInfo, C, MemberRole} from "./user";

const VillaMap = new WeakMap<VillaInfo, Villa>()

export class Villa {
	private readonly vid: number;
	private readonly _info: VillaInfo
	private c: Bot;
	private readonly ml = new Map<number, MemberInfo>()
	private readonly rl = new Map<number, RoomInfo>()
	private readonly gl = new Map<number, string>()
	private readonly roles = new Map<number, MemberRole>()

	private constructor(c: Bot, vid: number, info: VillaInfo) {
		this.c = c
		this.vid = vid
		this._info = info
	}

	static async get(c: Bot, vid: number) {
		const _info = await Villa.getInfo(c, vid)
		if (!_info) throw new RobotRunTimeError(-7, '获取大别野信息失败')
		if (VillaMap.has(_info)) return VillaMap.get(_info)
		else {
			let villa = new Villa(c, vid, _info)
			VillaMap.set(_info, villa)
			return villa
		}
	}

	static async getInfo(c: Bot, vid: number) {
		let _info = c.vl.get(vid)
		if (!_info) {
			_info = (await c.fetchResult(vid, "/vila/api/bot/platform/getVilla", 'get', "")).villa
			if (_info) c.vl.set(vid, _info)
		}
		return _info
	}

	/** 获取大别野信息 */
	get info() {
		return this._info
	}

	/** 获取大别野成员列表 */
	async getMembers(size: number, offset_str: string = "") {
		const path = "/vila/api/bot/platform/getVillaMembers"
		return await this.c.fetchResult(this.vid, path, 'get', `?offset_str=${offset_str}&size=${size}`)
	}

	/** 提出大别野用户 */
	async kickUser(uid: number) {
		const path = "/vila/api/bot/platform/deleteVillaMember"
		await this.c.fetchResult(this.vid, path, "post", "", {uid: uid})
		this.ml.delete(uid)
		return true
	}

	/** 获取别野用户信息 */
	async getMemberInfo(uid: number, force: boolean = false): Promise<MemberInfo | undefined> {
		if (force || !this.ml.has(uid)) {
			const path = "/vila/api/bot/platform/getMember"
			const member = (await this.c.fetchResult(this.vid, path, 'get', `?uid=${uid}`)).member
			if (member) this.ml.set(uid, member)
		}
		return this.ml.get(uid)
	}

	/** 获取房间信息 */
	async getRoom(room_id: number, force: boolean = false) {
		if (force || !this.rl.has(room_id)) {
			await this.getRooms(true)
		}
		return this.rl.get(room_id)
	}

	/** 获取别野房间列表信息 */
	async getRooms(force: boolean = false) {
		if (force || this.rl.size == 0) {
			this.gl.clear()
			this.rl.clear()
			const groups = (await this.c.fetchResult(this.vid, "/vila/api/bot/platform/getVillaGroupRoomList", "get", "")).list
			for (let g of groups) {
				this.gl.set(Number(g.group_id), g.group_name)
				for (let r of g.room_list) {
					this.rl.set(Number(r.room_id), r)
				}
			}
		}
		return this.rl
	}

	/** 编辑房间，只支持编辑名称 */
	async editRoom(room_id: number, room_name: string) {
		await this.c.fetchResult(this.vid, "/vila/api/bot/platform/editRoom", "post", "", {
			room_id: room_id,
			room_name: room_name
		})
		const r = this.rl.get(room_id)
		if (r) {
			r.room_name = room_name
			this.rl.set(room_id, r)
		}
		return true
	}

	/** 删除房间 */
	async deleteRoom(room_id: number) {
		await this.c.fetchResult(this.vid, "/vila/api/bot/platform/deleteRoom", "post", "", {
			room_id: room_id
		})
		this.rl.delete(room_id)
		return true
	}

	/** 创建分组 */
	async createGroup(group_name: string) {
		const cg = await this.c.fetchResult(this.vid, "/vila/api/bot/platform/createGroup", "post", "", {
			group_name: group_name
		})
		this.gl.set(Number(cg.group_id), group_name)
		return cg
	}

	/** 编辑分组，只允许编辑分组名称 */
	async editGroup(group_id: number, group_name: string) {
		await this.c.fetchResult(this.vid, "/vila/api/bot/platform/editGroup", "post", "", {
			group_id: group_id,
			group_name: group_name
		})
		this.gl.set(group_id, group_name)
		return true
	}

	/** deleteGroup，删除分组 */
	async deleteGroup(group_id: number) {
		await this.c.fetchResult(this.vid, "/vila/api/bot/platform/deleteGroup", "post", "", {
			group_id: group_id
		})
		this.gl.delete(group_id)
		return true
	}

	/** 获取分组列表 */
	async getGroups(force = false) {
		if (force || this.gl.size == 0) {
			this.gl.clear()
			const gs = (await this.c.fetchResult(this.vid, "/vila/api/bot/platform/getGroupList", "get", "")).list
			for (let g of gs) {
				this.gl.set(Number(g.group_id), g.group_name)
			}
		}
		return this.gl
	}

	/** 创建身份组 */
	async createRole(name: string, color: C, permissions: Perm[]): Promise<{ id: string }> {
		return this.c.fetchResult(this.vid, "/vila/api/bot/platform/createMemberRole", "post", "", {
			name: name,
			color: Color[color],
			permissions: permissions
		})
	}

	/** 编辑身份组 */
	async editRole(id: number, name: string, color: C, permissions: Perm[]) {
		await this.c.fetchResult(this.vid, "/vila/api/bot/platform/editMemberRole", "post", "", {
			id: id,
			name: name,
			color: Color[color],
			permissions: permissions
		})
		this.roles.delete(id)
		return true
	}

	/** 删除身份组 */
	async deleteRole(id: number) {
		await this.c.fetchResult(this.vid, "/vila/api/bot/platform/deleteMemberRole", "post", "", {
			id: id
		})
		this.roles.delete(id)
		return true
	}

	/** 获取身份组 */
	async getRole(role_id: number, detail: boolean = true) {
		if (this.roles.has(role_id)) {
			const role = this.roles.get(role_id)
			if (role && (role.is_detail || !detail)) return role
		}
		const rs = (await this.c.fetchResult(this.vid, "/vila/api/bot/platform/getMemberRoleInfo", "get", `?role_id=${role_id}`)).role
		rs.is_detail = true
		this.roles.set(role_id, rs)
		return rs
	}

	/** 获取大别野所有身份组 */
	async getRoles(force: boolean = false) {
		if (force || this.roles.size == 0) {
			this.roles.clear()
			const rs = (await this.c.fetchResult(this.vid, "/vila/api/bot/platform/getVillaMemberRoles", "get", "")).list
			for (let r of rs) {
				r.is_detail = false
				this.roles.set(Number(r.id), r)
			}
		}
		return this.roles
	}

	/** 向身份组操作用户 */
	async operateMember(role_id: number, uid: number, is_add: boolean) {
		await this.c.fetchResult(this.vid, "/vila/api/bot/platform/operateMemberToRole", "post", "", {
			role_id: role_id,
			uid: uid,
			is_add: is_add
		})
		return true
	}

	/** 创建消息组件模板，创建成功后会返回 template_id，发送消息时，可以使用 template_id 填充 component_board */
	async createComponentTemplate(components: []) {
		return this.c.createComponentTemplate(this.vid, components)
	}
}

export type RoomType = "BOT_PLATFORM_ROOM_TYPE_CHAT_ROOM"	        //聊天房间
	| "BOT_PLATFORM_ROOM_TYPE_POST_ROOM"	                        //帖子房间
	| "BOT_PLATFORM_ROOM_TYPE_SCENE_ROOM"	                        //场景房间
	| "BOT_PLATFORM_ROOM_TYPE_LIVE_ROOM"                            //直播房间
	| "BOT_PLATFORM_ROOM_TYPE_TALKING_ROOM"                         //语音房间
	| "BOT_PLATFORM_ROOM_TYPE_INVALID"	                            //无效

export type NoticeType = "BOT_PLATFORM_DEFAULT_NOTIFY_TYPE_NOTIFY"	//默认通知
	| "BOT_PLATFORM_DEFAULT_NOTIFY_TYPE_IGNORE"	                    //默认免打扰
	| "BOT_PLATFORM_DEFAULT_NOTIFY_TYPE_INVALID"	                //无效

export interface RoomInfo {
	//房间 id
	room_id: number
	//房间名称
	room_name: string
	//房间类型
	room_type: RoomType
	//分组 id
	group_id: number
	//房间默认通知类型
	room_default_notify_type: NoticeType
	//房间消息发送权限范围设置
	send_msg_auth_range: {
		//是否全局可发送
		is_all_send_msg: boolean
		//可发消息的身份组 id
		roles: Array<number>
	}
}

export interface VillaInfo {
	//大别野 id
	villa_id: number
	//名称
	name: string
	//别野头像链接
	villa_avatar_url: string
	//别野主人 id
	owner_uid: number
	//是否是官方别野
	is_official: boolean
	//介绍
	introduce: string
	category_id: number
	//标签
	tags: string[]
}

/** 身份组可添加权限 */
export type Perm = "mention_all" |
	"recall_message" |
	"pin_message" |
	"manage_member_role" |
	"edit_villa_info" |
	"manage_group_and_room" |
	"villa_silence" |
	"black_out" |
	"handle_apply" |
	"manage_chat_room" |
	"view_data_board" |
	"manage_custom_event" |
	"live_room_order" |
	"manage_spotlight_collection"