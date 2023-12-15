import {
	AtAll,
	AtRobot,
	AtUser, BadgeMsg, Component,
	Entity,
	FontStyle,
	ImageMsg,
	LinkMsg,
	LinkRoomMsg,
	MentionedInfo,
	MsgContentInfo, Panel, PreviewLinkMsg, TextMsg
} from "./message";
import {Bot, RobotRunTimeError} from "./bot";
import {Villa} from "./villa";

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
}

export interface VillaCard {
	type: 'villa'
	id: string
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

export type Elem =
	Text
	| At
	| Image
	| Post
	| Link
	| LinkRoom
	| Button
	| Template
	| PreviewLink
	| Badge
	| VillaCard
	| RobotCard
	| string

export class Msg {
	private readonly entities: Array<Entity>
	private readonly mention: MentionedInfo
	private readonly panel: Panel
	private readonly villa_id: number
	private readonly c: Bot
	private post_id!: string
	private villa_card!: string
	private robot_card!: string
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

	constructor(c: Bot, villa_id: number)
	constructor(c: Bot, villa_id: number, o: Elem[])

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
			try {// @ts-ignore
				await this[m.type](m)
			} catch (e) {
				this.c.logger.error(`消息{type: ${m.type}}转换失败,reason ${(e as Error).message}`)
			}
		}
		return this
	}

	async gen() {
		const tmg = {
			content: {
				text: this.t,
				entities: this.entities
			}
		} as MsgContentInfo
		if (this.robot_card) {
			tmg.content = {bot_id: this.robot_card}
			this.brief = `[分享机器人](${this.robot_card})`
			this.obj_name = 'MHY:RobotCard'
		} else if (this.villa_card) {
			tmg.content = {villa_id: this.villa_card}
			this.brief = `[分享别野](${this.villa_card})`
			this.obj_name = 'MHY:VillaCard'
		} else if (this.post_id) {
			tmg.content = {post_id: this.post_id}
			this.brief = `[分享帖子](${this.post_id})`
			this.obj_name = "MHY:Post"
		} else {
			if (this.img) {
				this.brief += '[图片]';
				if (this.t.length) (tmg.content as TextMsg).images = [this.img]
				else {
					tmg.content = this.img
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
		}
		if (this.smallComponent.length) this.panel.small_component_group_list?.push(this.smallComponent)
		if (this.midComponent.length) this.panel.mid_component_group_list?.push(this.midComponent)
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
				if (!m.nickname) m.nickname = (await (await Villa.get(this.c, this.villa_id))?.getMemberInfo(Number(m.id)))?.basic?.nickname || '你猜我at的谁'
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
		if (!m.name) m.name = (await (await Villa.get(this.c, Number(m.vid)))?.getRoom(Number(m.rid)))?.room_name || '这个房间'
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
		if (this.post_id) return;
		m.id = String(m.id)
		if (!m.id || m.id === "") return
		this.post_id = m.id
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
			const vinfo = await Villa.getInfo(this.c, this.villa_id)
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
		if (this.villa_card) return
		this.villa_card = String(m.id)
	}

	private robot(m: RobotCard) {
		if (this.robot_card) return
		this.robot_card = m.id
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
		if (typeof id === 'number') {
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
		if (!id?.startsWith("bot_")) throw new RobotRunTimeError(-13, `不是正确的bot_id`)
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
			headers: headers
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
	}
}