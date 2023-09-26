import {AtAll, AtRobot, AtUser, Entity, ImageMsg, LinkMsg, LinkRoomMsg, MentionedInfo, MsgContentInfo} from "./message";
import {Serve} from "./serve";

export interface Text {
	type: 'text'
	text: string
}

export interface At {
	type: 'at'
	scope: 'user' | 'bot' | 'all',
	id: string
	nickname?: string
}

export interface Image {
	type: 'image'
	file: string
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

export type Elem = Text | At | Image | Post | Link | LinkRoom

export class Msg {
	private readonly entities: Array<Entity>
	private readonly imgs: Array<ImageMsg>
	private readonly post_id: Array<string>
	private readonly mention: MentionedInfo
	private t: string
	private origin: Array<any> | undefined
	private offset: number
	private obj_name: string
	private c: Serve

	constructor(c: Serve)
	constructor(c: Serve, o: [])

	constructor(c: Serve, o?: []) {
		if (o) this.origin = o
		this.c = c
		this.entities = new Array<Entity>()
		this.t = ""
		this.imgs = new Array<ImageMsg>()
		this.post_id = Array<string>()
		this.mention = {type: 0, userIdList: []}
		this.offset = 0
		this.obj_name = 'MHY:Text'
	}

	parse(o: []): Msg {
		if (o) this.origin = o
		for (let m of this.origin || []) {
			if (typeof m === 'string') m = {type: 'text', text: m}
			try {// @ts-ignore
				this[m.type](m)
			} catch {
			}
		}
		return this
	}

	async gen() {
		let imgUrl: ImageMsg | undefined
		if (this.imgs.length) {
			this.imgs[0].url = await this.c.uploadImage(this.imgs[0].url)
			imgUrl = this.imgs[0]
			this.obj_name = "MHY:Image"
		} else imgUrl = undefined
		const tmg = {
			content: {
				text: this.t,
				entities: this.entities,
				...imgUrl
			}
		} as MsgContentInfo
		if (this.post_id.length) {
			tmg.content.post_id = this.post_id[0]
			this.obj_name = "MHY:Post"
		}
		if (this.mention.type !== 0) tmg.mentionedInfo = this.mention
		return {
			message: tmg, obj_name: this.obj_name
		}
	}

	private text(obj: Text) {
		this.t += obj.text
		this.offset += this.text.length
	}

	private at(m: At) {
		switch (m.scope) {
			case "user":
				if (typeof m.id !== 'string') m.id = String(m.id)
				this.t += `@${m.nickname || '你猜我at的谁'} `
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

	private image(m: Image) {
		if (!m.file || m.file === "") return
		let img: ImageMsg = {
			url: m.file
		}
		if (m.width && m.height) img.size = {width: m.width, height: m.height}
		if (m.size) img.file_size = m.size
		this.imgs.push(img)
	}

	private link(m: Link) {
		this.t += m.name || m.url
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

	private rlink(m: LinkRoom) {
		m = m as LinkRoom
		this.t += `#${m.name || '这个房间'} `
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
		this.post_id.push(m.id)
	}
}