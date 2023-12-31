import {RoomInfo, VillaInfo} from "../villa";
import {UClient, UClientRunTimeError} from "../uClient";
import {lock} from "../common";
import {UMemberInfo} from "../user";

const uVillaMap = new WeakMap<uVillaInfo, uVilla>()

export class uVilla {
	private readonly _info: uVillaInfo
	private readonly c: UClient
	private readonly vid: number
	private readonly ml = new Map<number, UMemberInfo>()
	private readonly rl = new Map<number, RoomInfo>()
	private readonly gl = new Map<number, string>()

	private constructor(c: UClient, vid: number, _info: uVillaInfo) {
		this.c = c
		this.vid = vid
		this._info = _info

		lock(this, "c")
		lock(this, "ml")
		lock(this, "rl")
		lock(this, "gl")
	}

	static get(c: UClient, villa_id: number) {
		const _info = c.vl.get(villa_id)
		if (!_info) throw new UClientRunTimeError(-3, `获取别野信息失败，villa_id: ${villa_id}`)
		if (!uVillaMap.has(_info)) {
			const villa = new uVilla(c, villa_id, _info)
			uVillaMap.set(_info, villa)
		}
		return uVillaMap.get(_info)
	}

	get info() {
		return this._info
	}

	async getRooms(force: boolean = false) {
		if (!force && this.rl.size) return this.rl
		const data = await this.c.fetchHttp(`https://bbs-api.miyoushe.com/vila/wapi/villa/v2/getVillaFull?villa_id=${this.vid}`, "get")
		const grs = data.villa_full_info.room_group_list
		this.gl.clear()
		this.rl.clear()
		for (let gr of grs) {
			gr.group_id = Number(gr.group_id)
			this.gl.set(gr.group_id, gr.group_name)
			const rooms = gr.room_list
			for (let r of rooms) {
				r.room_id = Number(r.room_id)
				this.rl.set(r.room_id, {
					room_id: r.room_id,
					room_name: r.room_name,
					room_type: r.room_type,
					group_info: {group_id: gr.group_id, group_name: gr.group_name},
					send_msg_auth_range: {
						is_all_send_msg: r.send_msg_auth.is_all_send_msg,
						roles: r.send_msg_auth.roles.map((v: string) => Number(v))
					},
					is_detail: true
				} as RoomInfo)
			}
		}
		return this.rl
	}

	async getRoom(room_id: number, force: boolean = false) {
		if (this.rl.has(room_id) && !force) return this.rl.get(room_id)
		const {room_info} = await this.c.fetchHttp(`https://bbs-api.miyoushe.com/vila/wapi/room/detail?villa_id=${this.vid}&room_id=${room_id}`, "get")
		room_info.room_id = Number(room_info.room_id)
		this.rl.set(room_info.room_id, {
			room_id: room_info.room_id,
			room_name: room_info.room_name,
			room_type: room_info.room_type,
			group_info: {...room_info.group_info, group_id: Number(room_info.group_id)},
			send_msg_auth_range: {
				is_all_send_msg: room_info.send_msg_auth_range.is_all_send_msg,
				roles: room_info.send_msg_auth_range.roles.map((v: string) => Number(v))
			},
			is_detail: true
		} as RoomInfo)
		return this.rl.get(room_id)
	}

	async getGroups(force: boolean = false) {
		if (!force && this.gl.size) return this.gl
		await this.getRooms(true)
		return this.gl
	}

	async getMember(uid: number, force: boolean = false) {
		if (this.ml.has(uid) && !force) return this.ml.get(uid)
		let {info} = await this.c.fetchHttp("https://bbs-api.miyoushe.com/vila/wapi/users/member/info", "post", {
			user_villa_ids: [{user_id: String(uid), villa_id: String(this.vid)}]
		})
		info = info[uid]
		const member = {
			avatar: info.member.avatar || info.member.avatar_url,
			gender: info.member.gender,
			introduce: info.member.introduce,
			nickname: info.member.nickname,
			uid: Number(info.member.uid),
			roles: info?.roles?.[this.vid]?.roles || [],
			tags: info.tag_list.map((t: any) => {
				t.tag_id = Number(t.tag_id);
				return t
			})
		} as UMemberInfo
		this.ml.set(Number(info.member.uid), member)
		return member
	}

	async getMembers(room_id: number, offset: number, size: number) {
		const {list} = await this.c.fetchHttp(`https://bbs-api.miyoushe.com/vila/wapi/room/member/search?targetId=${this.vid}&channelId=${room_id}&villa_id=${this.vid}&room_id=${room_id}&offset=${offset}&size=${size}`, "get")
		return list.map((info: any) => {
			const member = {
				avatar: info.member.avatar || info.member.avatar_url,
				gender: info.member.gender,
				introduce: info.member.introduce,
				nickname: info.member.nickname,
				uid: Number(info.member.uid),
				roles: info?.roles?.[this.vid]?.roles || [],
				tags: info.tag_list.map((t: any) => {
					t.tag_id = Number(t.tag_id);
					return t
				})
			} as UMemberInfo
			this.ml.set(member.uid, member)
			return member
		})
	}
}

export interface uVillaInfo extends VillaInfo {
	/** 别野ID */
	outer_id: string
	villa_created_at: number
}