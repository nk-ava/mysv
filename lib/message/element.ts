import {
	AtAll,
	AtRobot,
	AtUser, BadgeMsg, Component, CVEmoticonMsg, EmoticonMsg,
	Entity,
	FontStyle, ForwardMsg, HoYomoji,
	ImageMsg,
	LinkMsg,
	LinkRoomMsg,
	MentionedInfo,
	MsgContentInfo, Panel, PostMsg, PreviewLinkMsg, RobotCardMsg, SMsg, TextMsg, UserMsg, VillaCardMsg
} from "./message";
import {Bot} from "../bot";
import {Villa} from "../villa";
import * as fs from "fs";
import {UClient} from "../uClient";

export interface Text {
	type: 'text'
	text: string
	style?: string
}

export interface At {
	type: 'at'
	scope?: 'user' | 'bot' | 'all',
	id?: string | number
	style?: string
	nickname?: string
}

export interface Template {
	type: 'template'
	id: number
}

export interface RobotCard {
	type: 'robot'
	id: string
	name?: string
}

export interface VillaCard {
	type: 'villa'
	id: number | string
	name?: string
}

export interface Button {
	id: string
	type: 'button'
	size?: 'small' | 'middle' | 'big'
	text: string
	/** 是否回调 */
	cb?: boolean
	extra?: string
	/** 按钮类型，有输入，链接和回调三种 */
	c_type?: 'input' | 'link' | 'cb'
	input?: string
	link?: string
	/** c_type为link时，访问是否携带token */
	token?: boolean
}

export enum CType {
	cb = 1, input, link
}

export interface Image {
	type: 'image'
	file: string
	headers?: any
	width?: number
	height?: number
	size?: number
	/** 别野专属表情名称 */
	name?: string
	/** 表情id */
	id?: string | number
	asface?: boolean
}

export interface Post {
	type: 'post'
	id: string | number
}

export interface Link {
	type: 'link'
	url: string
	name?: string
	style?: string
	ac_tk?: boolean
}

export interface LinkRoom {
	type: 'rlink'
	name?: string
	style?: string
	/** 别野ID */
	vid: string | number
	/** 房间ID */
	rid: string | number
}

export interface PreviewLink {
	type: 'plink'
	/** 标题 */
	title: string
	/** 内容 */
	content: string
	/** 跳转链接 */
	url: string
	/** 图标链接 */
	icon?: string
	/** 来源处 */
	source?: string
	/** 图片链接 */
	image?: string
}

export interface Badge {
	type: 'badge'
	// 图标链接
	icon?: string
	// 文本信息
	text: string
	// 跳转链接
	url?: string
}

export interface User {
	type: 'user'
	id: string | number
	nickname?: string
}

export interface Emoticon {
	type: "face",
	id?: string | number
	name: string
}

export interface HoYo {
	type: "hoyo"
	width?: number
	height?: number
	id?: string | number
	to_uid?: string | number
	content: Elem | Elem[]
	size?: number
	url: string
	show?: boolean
}

export interface Forward {
	type: 'forward'
	id: number | string
	room_id?: number | string
	villa_id?: number | string
	villa_name?: string
	room_name?: string
	summary: {
		uid?: string | number
		nickname: string
		content: string
	}[]
}

export type Elem = User | Text | At | Image | Link | LinkRoom | Button | Template | PreviewLink | Badge | SElem | string

/** 只能单独发，不能组合发的元素 */
export type SElem = Post | VillaCard | RobotCard | Emoticon | HoYo | Forward

export class Msg {
	private readonly entities: Array<Entity>
	private readonly mention: MentionedInfo
	private readonly villa_id: number
	private readonly c: Bot | UClient
	private panel: Panel
	private sMsg!: SMsg
	private img!: ImageMsg
	private t: string
	private brief: string
	private origin: Array<any> | undefined
	private offset: number
	private obj_name: string
	private smallComponent: Component[]
	private midComponent: Component[]
	private preview!: PreviewLinkMsg
	private badgeMsg!: BadgeMsg

	constructor(c: Bot | UClient, villa_id: number)
	constructor(c: Bot | UClient, villa_id: number, o: Elem[])

	constructor(c: Bot, villa_id: number, o?: Elem[]) {
		if (o) this.origin = o
		this.c = c
		this.entities = new Array<Entity>()
		this.panel = {
			small_component_group_list: [],
			mid_component_group_list: [],
			big_component_group_list: []
		}
		this.t = ""
		this.brief = ""
		this.mention = {type: 0, userIdList: []}
		this.offset = 0
		this.obj_name = 'MHY:Text'
		this.villa_id = villa_id
		this.smallComponent = []
		this.midComponent = []
	}

	async parse(o: Elem[]): Promise<Msg> {
		if (o) this.origin = o
		for (let m of this.origin || []) {
			if (typeof m === 'string') m = {type: 'text', text: m}
			if (this.sMsg) return this
			try {// @ts-ignore
				await this[m.type](m)
			} catch (e) {
				this.c.logger.error(`消息{type: ${m.type}}转换失败,reason ${(e as Error).message}`)
				if ((e as Error).message.includes("登录失效")) {
					fs.unlink(`${this.c.config.data_dir}/cookie`, () => {})
					this.c.config.mys_ck = ""
				}
			}
		}
		return this
	}

	gen() {
		const tmg = {
			content: {
				text: this.t,
				entities: this.entities
			}
		} as MsgContentInfo
		if (this.sMsg) {
			tmg.content = this.sMsg
			this.panel = {}
		} else {
			if (this.img) {
				this.brief += '[图片]';
				if (this.t.length) (tmg.content as TextMsg).images = [this.img]
				else {
					tmg.content = this.img
					this.panel = {}
					this.obj_name = "MHY:Image"
				}
			}
			if (this.preview && this.t.length) {
				this.brief += "[图文链接]";
				(tmg.content as TextMsg).preview_link = this.preview
			}
			if (this.badgeMsg && this.t.length) {
				this.brief += `{badge: ${this.badgeMsg.text}}`;
				(tmg.content as TextMsg).badge = this.badgeMsg
			}
			if (this.mention.type !== 0 && this.t.length) tmg.mentionedInfo = this.mention
			if (this.smallComponent.length && this.t.length) this.panel.small_component_group_list?.push(this.smallComponent)
			if (this.midComponent.length && this.t.length) this.panel.mid_component_group_list?.push(this.midComponent)
		}
		return {
			message: tmg, obj_name: this.obj_name, panel: this.panel, brief: this.brief, imgMsg: !!this.img
		}
	}

	private text(obj: Text) {
		if (!obj.text) return
		this.t += obj.text
		this.brief += obj.text
		const len = obj.text.length
		if (obj.style) this.style(obj, len)
		this.offset += len
	}

	private async at(m: At) {
		if (!m.scope) {
			if (String(m?.id)?.startsWith('bot')) m.scope = 'bot'
			else m.scope = 'user'
		}
		let len: number
		switch (m.scope) {
			case "user":
				if (!m.id) break
				m.id = String(m.id)
				if (!m.nickname) {
					if (this.c instanceof Bot) m.nickname = (await (await Villa.get(this.c, this.villa_id))?.getMemberInfo(Number(m.id)))?.basic?.nickname || '你猜我at的谁'
					else m.nickname = '你猜我at的谁'
				}
				this.t += `@${m.nickname} `
				this.brief += `@${m.nickname} `
				len = m.nickname.length + 2
				if (m.style) this.style(m, len)
				this.entities.push({
					entity: {
						type: "mentioned_user",
						user_id: m.id
					} as AtUser,
					offset: this.offset,
					length: len
				} as Entity)
				this.offset += len
				if (!this.mention.type) {
					this.mention.type = 2
					this.mention.userIdList.push(m.id)
				}
				break
			case "all":
				this.t += `@全体成员 `
				this.brief += `@全体成员 `
				if (m.style) this.style(m, 6)
				this.entities.push({
					entity: {
						type: 'mentioned_all'
					} as AtAll,
					offset: this.offset,
					length: 6
				} as Entity)
				this.offset += 6
				this.mention.type = 1
				break
			case "bot":
				if (!m.id) break
				m.id = String(m.id)
				if (!m.nickname) m.nickname = '你猜我at的谁'
				this.t += `@${m.nickname} `
				this.brief += `@${m.nickname} `
				len = m.nickname.length + 2
				if (m.style) this.style(m, len)
				this.entities.push({
					entity: {
						type: "mentioned_robot",
						bot_id: m.id
					} as AtRobot,
					offset: this.offset,
					length: len
				} as Entity)
				this.offset += len
				if (!this.mention.type) {
					this.mention.type = 2
					this.mention.userIdList.push(m.id)
				}
				break
		}
	}

	private async image(m: Image) {
		if (!m.file || m.file === "") return
		if (this.img) return;
		this.img = {
			url: await this.c.uploadImage(m.file, this.villa_id, m.headers)
		} as ImageMsg
		if (m.width && m.height) this.img.size = {width: Number(m.width), height: Number(m.height)}
		if (typeof m.size !== 'undefined') this.img.file_size = Number(m.size)
		if (m.asface) {
			this.sMsg = {
				...this.img,
				id: String(m.id)
			} as CVEmoticonMsg
			if (m.name) {
				(this.sMsg as CVEmoticonMsg).name = m.name
				this.brief = `[别野专属表情](${m.name})`
				this.obj_name = "MHY:VillaEmoticon"
				return
			}
			this.brief = '[自定义表情]'
			this.obj_name = "MHY:CustomEmoticon"
		}
	}

	private link(m: Link) {
		if (!m.url) return
		this.brief += `[${m.name || '链接'}](${m.url})`
		if (!m.name) m.name = m.url
		this.t += m.name
		if (m.style) this.style(m, m.name.length)
		this.entities.push({
			entity: {
				type: "link",
				url: m.url,
				requires_bot_access_token: m.ac_tk || false
			} as LinkMsg,
			offset: this.offset,
			length: m.name.length
		} as Entity)
		this.offset += m.name.length
	}

	private async rlink(m: LinkRoom) {
		if (!m.vid || !m.rid) return
		if (!m.name) {
			if (this.c instanceof Bot) m.name = (await (await Villa.get(this.c, Number(m.vid)))?.getRoom(Number(m.rid)))?.room_name || '这个房间'
			else m.name = "这个房间"
		}
		this.t += `#${m.name} `
		this.brief += `[#${m.name}](${m.vid}-${m.rid})`
		if (m.style) this.style(m, m.name?.length + 2)
		this.entities.push({
			entity: {
				type: 'villa_room_link',
				villa_id: `${m.vid}`,
				room_id: `${m.rid}`
			} as LinkRoomMsg,
			offset: this.offset,
			length: m.name.length + 2
		})
		this.offset += m.name.length + 2
	}

	private post(m: Post) {
		m.id = String(m.id)
		if (!m.id || m.id === "") return
		this.sMsg = {} as PostMsg
		this.sMsg.post_id = m.id
		this.brief = `[分享帖子](${m.id})`
		this.obj_name = "MHY:Post"
	}

	private async user(m: User) {
		m.id = String(m.id)
		if (!m.id) return
		!m.nickname && (m.nickname = this.c instanceof UClient ? "unknown" : ((await (await Villa.get(this.c, this.villa_id))?.getMemberInfo(Number(m.id)))?.basic?.nickname || "unknown"))
		this.entities.push({
			entity: {
				type: 'user',
				user_id: m.id
			} as UserMsg,
			offset: this.offset,
			length: m.nickname.length
		})
		this.t += `${m.nickname}`
		this.brief += `${m.nickname}`
		this.offset += m.nickname.length
	}

	private button(m: Button) {
		if (!m.size) m.size = "small"
		switch (m.size) {
			case "small":
				this.smallComponent.push({
					id: m.id,
					text: m.text,
					type: 1,
					need_callback: m.cb || true,
					extra: m.extra,
					c_type: CType[m.c_type || "cb"],
					input: m.input,
					need_token: m.token,
					link: m.link
				} as Component)
				if (this.smallComponent.length == 3) {
					this.panel.small_component_group_list?.push(this.smallComponent)
					this.smallComponent = []
				}
				break
			case "middle":
				this.midComponent.push({
					id: m.id,
					text: m.text,
					type: 1,
					need_callback: m.cb || true,
					extra: m.extra,
					c_type: CType[m.c_type || "cb"],
					input: m.input,
					need_token: m.token,
					link: m.link
				} as Component)
				if (this.midComponent.length == 2) {
					this.panel.mid_component_group_list?.push(this.midComponent)
					this.midComponent = []
				}
				break
			case "big":
				this.panel.big_component_group_list?.push([{
					id: m.id,
					text: m.text,
					type: 1,
					need_callback: m.cb || true,
					extra: m.extra,
					c_type: CType[m.c_type || "cb"],
					input: m.input,
					need_token: m.token,
					link: m.link
				} as Component])
				break
		}
	}

	private template(m: Template) {
		this.panel.template_id = m.id
	}

	private async plink(m: PreviewLink) {
		if (this.preview) return
		if (!m.icon || !m.source) {
			const vinfo = this.c instanceof Bot && (await Villa.getInfo(this.c, this.villa_id)) || undefined
			!m.icon && (m.icon = (vinfo?.villa_avatar_url || 'https://i.gtimg.cn/open/app_icon/09/28/85/17/1109288517_100_ios.png'))
			!m.source && (m.source = (vinfo?.name || '米游社'))
		}
		this.preview = {
			title: m.title || "米游社",
			content: m.content || "米游社是米哈游（miHoYo）旗下游戏玩家社区。集合了崩坏学园2、崩坏3、未定事件簿、原神、崩坏：星穹铁道、绝区零等游戏官方资讯、游戏攻略、活动周边、福利趣闻和同人作品。",
			url: m.url || "https://www.miyoushe.com/",
			icon_url: m.icon,
			source_name: m.source,
			image_url: m.image || "https://i.gtimg.cn/open/app_icon/09/28/85/17/1109288517_100_ios.png"
		}
	}

	private badge(m: Badge) {
		!m.icon && (m.icon = "https://upload-bbs.mihoyo.com/vila_bot/bbs_origin_badge.png")
		!m.url && (m.url = "https://www.miyoushe.com/")
		this.badgeMsg = {
			icon_url: m.icon,
			text: m.text,
			url: m.url
		}
	}

	private villa(m: VillaCard) {
		this.sMsg = {} as VillaCardMsg
		m.id && (this.sMsg.villa_id = String(m.id))
		m.name && (this.sMsg.villa_name = String(m.name))
		this.brief = `[分享别野](${m.id})`
		this.obj_name = 'MHY:VillaCard'
	}

	private robot(m: RobotCard) {
		this.sMsg = {} as RobotCardMsg
		m.id && (this.sMsg.bot_id = m.id)
		m.name && (this.sMsg.name = String(m.name))
		this.brief = `[分享机器人](${m.id})`
		this.obj_name = 'MHY:RobotCard'
	}

	private face(m: Emoticon) {
		this.sMsg = {} as EmoticonMsg
		m.id && (this.sMsg.id = String(m.id))
		m.name && (this.sMsg.emoticon = m.name)
		this.brief = `[${m.name || "动画表情"}]`
		this.obj_name = 'MHY:Emoticon'
	}

	private async hoyo(m: HoYo) {
		m.to_uid = String(m.to_uid || "")
		!m.content && (m.content = "")
		if (!Array.isArray(m.content)) m.content = [m.content]
		const msg = await new Msg(this.c, this.villa_id).parse(m.content)
		this.sMsg = {
			action_id: String(m.id || ""),
			target_user_id: m.to_uid,
			entities: msg.entities,
			text: msg.t,
			file_size: m.size || 0,
			url: m.url
		} as HoYomoji
		if (m.width && m.height) this.sMsg.size = {
			width: m.width,
			height: m.height
		}
		this.brief = `[HoYo表情](${msg.t})`
		this.obj_name = m.show ? "MHY:HoYomoji" : (msg.t === "掷骰子" ? "MHY:RandomEmoticon" : "MHY:AvatarEmoticon")
	}

	private async forward(m: Forward) {
		this.sMsg = {
			summary_list: m.summary || [],
			room_name: m.room_name || "",
			villa_name: m.villa_name || ""
		} as ForwardMsg
		m.room_id && ((this.sMsg as ForwardMsg).room_id = String(m.room_id))
		m.villa_id && ((this.sMsg as ForwardMsg).villa_id = String(m.villa_id))
		m.id && (this.sMsg.id = String(m.id))
		this.brief = "[转发消息]"
		this.obj_name = "MHY:ForwardMsg"
	}

	private style(obj: any, len: number) {
		if (obj.style.includes("b")) {
			this.entities.push({
				entity: {
					type: "style",
					font_style: "bold"
				} as FontStyle,
				offset: this.offset,
				length: len
			})
		}
		if (obj.style.includes("i")) {
			this.entities.push({
				entity: {
					type: "style",
					font_style: "italic"
				} as FontStyle,
				offset: this.offset,
				length: len
			})
		}
		if (obj.style.includes("s")) {
			this.entities.push({
				entity: {
					type: "style",
					font_style: "strikethrough"
				} as FontStyle,
				offset: this.offset,
				length: len
			})
		}
		if (obj.style.includes("u")) {
			this.entities.push({
				entity: {
					type: "style",
					font_style: "underline"
				} as FontStyle,
				offset: this.offset,
				length: len
			})
		}
	}
}

export const segment = {
	at: (id: number | string, style?: string): At => {
		if (typeof id === 'number' || Number(id)) {
			return {
				type: 'at',
				id: id,
				scope: 'user',
				style: style
			}
		}
		if (id.trim() === "all") return {
			type: 'at',
			scope: 'all',
			style: style
		}
		if (!id?.startsWith("bot_")) throw new Error(`不是正确的bot_id`)
		return {
			type: 'at',
			id: id,
			scope: 'bot',
			style: style
		}
	},
	text: (text: string, style?: string): Text => {
		return {
			type: 'text',
			text: String(text),
			style: style
		}
	},
	image: (file: string, headers?: any): Image => {
		return {
			type: 'image',
			file: file,
			headers: headers,
			asface: false
		}
	},
	post: (id: string | number): Post => {
		return {
			type: 'post',
			id: id
		}
	},
	link: (url: string, name?: string, style?: string): Link => {
		return {
			type: 'link',
			url: url,
			name: name,
			style: style
		}
	},
	rlink: (vid: number, rid: number, name?: string, style?: string): LinkRoom => {
		return {
			type: 'rlink',
			vid: vid,
			rid: rid,
			name: name,
			style: style
		}
	},
	button: (id: string, c_type: 'input' | 'link' | 'cb', size?: 'small' | 'middle' | 'big'): Button => {
		return {
			type: "button",
			id: id,
			text: id,
			c_type: c_type,
			size: size
		}
	},
	template: (id: number): Template => {
		return {
			type: 'template',
			id: id
		}
	},
	plink: (title: string, content: string, url: string, image?: string): PreviewLink => {
		return {
			type: 'plink',
			title: title,
			content: content,
			url: url,
			image: image
		}
	},
	badge: (text: string, url?: string, icon?: string): Badge => {
		return {
			type: 'badge',
			icon: icon,
			text: text,
			url: url
		}
	},
	villa: (id: number | string): VillaCard => {
		return {
			type: 'villa',
			id: id
		}
	},
	robot: (id: string): RobotCard => {
		return {
			type: "robot",
			id: id
		}
	},
	face: (name: string): Emoticon => {
		return {
			type: "face",
			name: name
		}
	}
}