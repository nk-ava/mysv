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
import {Serve} from "./serve";
import {Villa} from "./villa";

export interface Text {
	type: 'text'
	text: string
	style?: string
}

export interface At {
	type: 'at'
	scope?: 'user' | 'bot' | 'all',
	id: string
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
	id: string
}

export interface Link {
	type: 'link'
	url: string
	name?: string
	ac_tk?: boolean
}

export interface LinkRoom {
	type: 'rlink'
	name?: string
	vid: string
	rid: string
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
	private c: Serve
	private smallComponent: Component[]
	private midComponent: Component[]

	constructor(c: Serve, villa_id: number)
	constructor(c: Serve, villa_id: number, o: Elem[])

	constructor(c: Serve, villa_id: number, o?: Elem[]) {
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
				throw e
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
			message: tmg, obj_name: this.obj_name, panel: this.panel, brief: this.brief
		}
	}

	private text(obj: Text) {
		if (!obj.text) return
		this.t += obj.text
		this.brief += obj.text
		if (obj.style) {
			if (obj.style.includes("b")) {
				this.entities.push({
					entity: {
						type: "style",
						font_style: "bold"
					} as FontStyle,
					offset: this.offset,
					length: obj.text.length
				})
			}
			if (obj.style.includes("i")) {
				this.entities.push({
					entity: {
						type: "style",
						font_style: "italic"
					} as FontStyle,
					offset: this.offset,
					length: obj.text.length
				})
			}
			if (obj.style.includes("s")) {
				this.entities.push({
					entity: {
						type: "style",
						font_style: "strikethrough"
					} as FontStyle,
					offset: this.offset,
					length: obj.text.length
				})
			}
			if (obj.style.includes("u")) {
				this.entities.push({
					entity: {
						type: "style",
						font_style: "underline"
					} as FontStyle,
					offset: this.offset,
					length: obj.text.length
				})
			}
		}
		this.offset += obj.text.length
	}

	private async at(m: At) {
		if (!m.scope) m.scope = 'user'
		switch (m.scope) {
			case "user":
				if (typeof m.id !== 'string') m.id = String(m.id)
				if (!m.nickname) m.nickname = (await (await Villa.get(this.c, this.villa_id))?.getMemberInfo(Number(m.id)))?.basic?.nickname
				this.t += `@${m.nickname || '你猜我at的谁'} `
				this.brief += `@${m.nickname || '你猜我at的谁'} `
				this.entities.push({
					entity: {
						type: "mentioned_user",
						user_id: m.id
					} as AtUser,
					offset: this.offset,
					length: (m.nickname || '你猜我at的谁').length + 2
				} as Entity)
				this.offset += (m.nickname || '你猜我at的谁').length + 2
				if (!this.mention.type) {
					this.mention.type = 2
					this.mention.userIdList.push(m.id)
				}
				break
			case "all":
				this.t += `@全体成员 `
				this.brief += `@全体成员 `
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
				this.t += `@${m.nickname || '你猜我at的谁'}`
				this.brief += `@${m.nickname || '你猜我at的谁'}`
				this.entities.push({
					entity: {
						type: "mentioned_robot",
						bot_id: m.id
					} as AtRobot,
					offset: this.offset,
					length: (m.nickname || '你猜我at的谁').length + 2
				} as Entity)
				this.offset += (m.nickname || '你猜我at的谁').length + 2
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
		this.t += m.name || m.url
		this.brief += `[${m.name || '链接'}](${m.url})`
		this.entities.push({
			entity: {
				type: "link",
				url: m.url,
				requires_bot_access_token: m.ac_tk || false
			} as LinkMsg,
			offset: this.offset,
			length: (m.name || m.url).length
		} as Entity)
		this.offset += (m.name || m.url).length
	}

	private async rlink(m: LinkRoom) {
		if (!m.vid || !m.rid) return
		if (!m.name) m.name = (await (await Villa.get(this.c, Number(m.vid)))?.getRoom(Number(m.rid)))?.room_name
		this.t += `#${m.name || '这个房间'} `
		this.brief += `[#${m.name || '这个房间'}](${m.vid}-${m.rid})`
		this.entities.push({
			entity: {
				type: 'villa_room_link',
				villa_id: `${m.vid}`,
				room_id: `${m.rid}`
			} as LinkRoomMsg,
			offset: this.offset,
			length: `#${m.name || '这个房间'} `.length
		})
		this.offset += `#${m.name || '这个房间'} `.length
	}

	private post(m: Post) {
		if (typeof m.id !== 'string') m.id = String(m.id)
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
}