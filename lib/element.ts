import {
	AtAll,
	AtRobot,
	AtUser, Component,
	Entity,
	FontStyle,
	ImageMsg,
	LinkMsg,
	LinkRoomMsg,
	MentionedInfo, MsgContent,
	MsgContentInfo, Panel
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
	type: 'template',
	id: number
}

export interface Button {
	id: string
	type: 'button'
	size?: 'small' | 'middle' | 'big'
	text: string
	cb?: boolean
	extra?: string
	c_type?: 'input' | 'link' | 'cb'
	input?: string
	link?: string
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
	vid: string | number
	rid: string | number
}

export type Elem = Text | At | Image | Post | Link | LinkRoom | Button | Template | string

export class Msg {
	private readonly entities: Array<Entity>
	private readonly post_id: Array<string>
	private readonly mention: MentionedInfo
	private readonly panel: Panel
	private readonly villa_id: number
	private img: ImageMsg | undefined
	private t: string
	private brief: string
	private origin: Array<any> | undefined
	private offset: number
	private obj_name: string
	private c: Bot
	private smallComponent: Component[]
	private midComponent: Component[]

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
		this.post_id = Array<string>()
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
				this.c.logger.error(`消息{type: ${m.type}}转换失败：${(e as Error).message}`)
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
		if (this.img) {
			if (this.t.length) tmg.content.images = [this.img]
			else {
				tmg.content = <MsgContent>this.img
				this.obj_name = "MHY:Image"
			}
		}
		if (this.post_id.length) {
			tmg.content.post_id = this.post_id[0]
			this.obj_name = "MHY:Post"
		}
		if (this.mention.type !== 0) tmg.mentionedInfo = this.mention
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
		this.brief += '[图片]'
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
		m.id = String(m.id)
		if (!m.id || m.id === "") return
		this.brief += `[帖子](${m.id})`
		this.post_id.push(m.id)
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
	}
}