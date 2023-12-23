import {
	JoinVilla, SendMessage, CreateBot, DeleteBot,
	AddQuickEmoticon, AuditCallback, BaseEvent,
	ClickMsgComponent, MessageRet, UserInfo
} from "./event";
import {Bot} from "./bot";
import {Villa, VillaInfo} from "./villa";
import {
	At, Badge, Button, CType, Elem, Image, Link, LinkRoom, Post, PreviewLink, RobotCard, Template, Text,
	VillaCard, Entity, Quotable, Emoticon, HoYo, User, Forward
} from "./message";
import {UClient} from "./uClient";
import {Message} from "./core";

export type Events = JoinVilla | SendMessage | CreateBot | DeleteBot | AddQuickEmoticon | AuditCallback

const et: string[] = [
	'',
	'JoinVilla',
	'SendMessage',
	'CreateRobot',
	'DeleteRobot',
	'AddQuickEmoticon',
	'AuditCallback',
	"ClickMsgComponent"
]
const auditResult = ["None", "Pass", "Reject"]
const objName = ["UnknownObjectName", "Text", "Post"]

export default class Parser {
	public event_type!: string
	private readonly baseEvent!: BaseEvent
	private readonly event_data: any
	private readonly c: Bot | UClient

	constructor(c: Bot | UClient, event?: any) {
		this.c = c
		if (event) {
			this.event_type = et[event.type] || event.type
			this.baseEvent = {
				source: {
					villa_id: Number(event.robot.villa_id),
					bot: event.robot.template
				},
				id: event.id,
				created_time: Number(event.created_at),
				send_time: Number(event.send_at)
			}
			this.event_data = event?.extend_data?.EventData || event?.extend_data
		}
	}

	async doParse(): Promise<Array<Events>> {
		const es: [string, any][] = Object.entries(this.event_data)
		const rs = new Array<Events>()
		let info = await Villa.getInfo((this.c as Bot), this.baseEvent.source.villa_id) as VillaInfo
		this.baseEvent.source.villa_name = info.name
		for (let [k, v] of es) {
			switch (k) {
				case "JoinVilla":
				case "join_villa":
					rs.push({
						...this.baseEvent,
						join_uid: Number(v.join_uid),
						join_nickname: v.join_user_nickname,
						join_time: Number(v.join_at)
					} as JoinVilla)
					this.c.logger.info(`用户 ${v.join_user_nickname}(${v.join_uid})加入大别野[${info.name || "unknown"}](${this.baseEvent.source.villa_id})`)
					break
				case "SendMessage":
				case "send_message":
					const content = JSON.parse(v.content)
					const msg = content.content.text.replace(`@${this.baseEvent.source.bot.name} `, "")
					rs.push({
						...this.baseEvent,
						message: this.parseContent(content.content, content.panel),
						user: {
							...content.user,
							id: Number(content.user.id) || content.user.id
						} as UserInfo,
						msg: msg,
						from_uid: v.from_user_id = (v.bot_msg_id ? this.baseEvent.source.bot.id : Number(v.from_user_id)),
						send_time: Number(v.send_at),
						room_id: Number(v.room_id),
						object_name: typeof v.object_name === 'string' ? v.object_name : objName[Number(v.object_name)],
						nickname: v.nickname,
						msg_id: v.msg_uid,
						bot_msg_id: v.bot_msg_id,
						quote_msg: v.quote_msg ? {
							...v.quote_msg,
							send_at: Number(v?.quote_msg?.send_at) || undefined,
							from_user_id: Number(v?.quote_msg?.from_user_id) || undefined
						} : undefined,
						reply: (content: Elem | Elem[], quote: boolean = false): Promise<MessageRet> => {
							const q: Quotable = {
								message_id: v.msg_uid,
								send_time: Number(v.send_at)
							}
							return (this.c as Bot).sendMsg(v.room_id, this.baseEvent.source.villa_id, content, quote ? q : undefined)
						}
					} as SendMessage)
					this.c.logger.info(`recv from: [Villa: ${info.name || "unknown"}(${this.baseEvent.source.villa_id}), Member: ${v.nickname}(${v.from_user_id})] ${msg}`)
					break
				case "CreateRobot":
				case "create_robot":
					rs.push({
						...this.baseEvent
					})
					this.c.logger.info(`机器人 ${this.baseEvent.source.bot.name}(${this.baseEvent.source.bot.id})加入大别野[${info.name || "unknown"}](${this.baseEvent.source.villa_id})`)
					break
				case "DeleteRobot":
				case "delete_robot":
					rs.push({
						...this.baseEvent
					})
					this.c.logger.info(`机器人 ${this.baseEvent.source.bot.name}(${this.baseEvent.source.bot.id})被移出大别野[${info.name || "unknown"}](${this.baseEvent.source.villa_id})`);
					(this.c as Bot).vl.delete(this.baseEvent.source.villa_id)
					break
				case "AddQuickEmoticon":
				case "add_quick_emoticon":
					rs.push({
						...this.baseEvent,
						room_id: Number(v.room_id),
						from_uid: Number(v.uid),
						emoticon_id: Number(v.emoticon_id),
						emoticon: v.emoticon = v.emoticon || v.emoticon_type === 1 && `别野专属表情 ${v.emoticon_id}` || 'unknown',
						msg_id: v.msg_uid,
						bot_msg_id: v.bot_msg_id,
						is_cancel: v.is_cancel,
						reply: (content: Elem | Elem[]): Promise<MessageRet> => {
							return (this.c as Bot).sendMsg(v.room_id, this.baseEvent.source.villa_id, content)
						}
					} as AddQuickEmoticon)
					const member = await (await Villa.get((this.c as Bot), this.baseEvent.source.villa_id))?.getMemberInfo(v.uid)
					this.c.logger.info(`recv from: [Villa: ${info.name || "unknown"}(${this.baseEvent.source.villa_id}), Member: ${member?.basic?.nickname || "unknown"}(${v.uid})] [${v.is_cancel ? '取消' : '回复'}快捷表情]${v.emoticon}`)
					break
				case "AuditCallback":
				case "audit_callback":
					rs.push({
						...this.baseEvent,
						audit_id: v.audit_id,
						bot_id: v.bot_tpl_id,
						room_id: Number(v.room_id),
						user_id: Number(v.user_id),
						pass_through: v.pass_through,
						audit_result: typeof v.audit_result === 'string' ? v.audit_result : (v.audit_result = auditResult[Number(v.audit_result)]),
						reply: (content: Elem | Elem[]): Promise<MessageRet> => {
							return (this.c as Bot).sendMsg(v.room_id, this.baseEvent.source.villa_id, content)
						}
					} as AuditCallback)
					this.c.logger.info(`${v.audit_id}审核结果：${v.audit_result}`);
					(this.c as Bot).handler.get(v.audit_id)?.(v.audit_result)
					break
				case "ClickMsgComponent":
				case "click_msg_component":
					rs.push({
						...this.baseEvent,
						room_id: Number(v.room_id),
						uid: Number(v.uid),
						msg_id: v.msg_uid,
						bot_msg_id: v.bot_msg_id,
						component_id: v.component_id,
						template_id: v.template_id || 0,
						extra: v.extra,
						reply: (content: Elem | Elem[]): Promise<MessageRet> => {
							return (this.c as Bot).sendMsg(v.room_id, this.baseEvent.source.villa_id, content)
						}
					} as ClickMsgComponent)
					const mem = await (await Villa.get((this.c as Bot), this.baseEvent.source.villa_id))?.getMemberInfo(v.uid)
					this.c.logger.info(`recv from: [Villa: ${info.name || "unknown"}(${this.baseEvent.source.villa_id}), Member: ${mem?.basic?.nickname || "unknown"}(${v.uid})] 点击消息组件${v.component_id}`)
					break
			}

		}
		return rs
	}

	doPtParse(proto: any) {
		const obj_name = proto[4]
		if (!obj_name.includes("MHY")) return
		if (/^MHY:((SYS)|(SIG)):.*$/.test(obj_name)) return
		const content = JSON.parse(proto[5])
		let src = proto[13]
		if (src) src = JSON.parse(src)
		const source = proto[18]?.[1]?.split("|")
		const m = proto[16]?.split("：")
		const msg = {
			from_uid: Number(proto[1]) || proto[1],
			obj_name: obj_name,
			user: content.user,
			quote: content.quote ? {
				send_time: content?.quote?.quoted_message_send_time,
				message_id: content?.quote?.quoted_message_id
			} : undefined,
			message: this.parseContent(content.content, content.panel, obj_name),
			send_time: Number(proto[6]),
			msg_id: proto[9],
			src: src.osSrc || "unknown",
			msg: content.content.text || m?.[1] || "",
			nickname: m?.[0] || content.user.name || "unknown"
		} as Message
		if (source && source[0] === "私信通知") {
			msg.isPrivate = true
			msg.reply = async (content: Elem | Elem[], quote?: boolean) => {
				const q = quote ? {
					message_id: msg.msg_id,
					send_time: msg.send_time
				} as Quotable : undefined
				return await (this.c as UClient).sendPrivateMsg(msg.from_uid, content, q)
			}
			this.c.logger.info(`recv from: [Private: ${msg?.nickname || "unknown"}(${msg?.from_uid})] ${msg?.msg}`)
			this.c.em("message.private", msg)
		} else {
			msg.isPrivate = false
			msg.source = {
				villa_id: Number(proto[3]),
				room_id: Number(proto[19]),
				villa_name: source?.[0]?.trim() || "unknown",
				room_name: source?.[1]?.trim() || "unknown",
			}
			msg.reply = async (content: Elem | Elem[], quote?: boolean) => {
				const q = quote ? {
					message_id: msg.msg_id,
					send_time: msg.send_time
				} as Quotable : undefined
				return await (this.c as UClient).sendMsg(msg?.source?.villa_id, msg.source.room_id, content, q)
			}
			this.c.logger.info(`recv from: [Villa: ${msg?.source?.villa_name || "unknown"}(${msg?.source?.villa_id}), Member: ${msg?.nickname}(${msg?.from_uid})] ${msg?.msg}`)
			this.c.em('message.villa', msg)
		}
	}

	doForwardParse(m: any) {
		return {
			uid: Number(m.user.id) || m.user.id,
			nickname: m.user.name,
			message: this.parseContent(m.content, m.panel, m.object_name)
		}
	}

	/** 米游社用户暂时只能对机器人发送MHY:Text类型消息，所以暂时只解析MYH：Text类型消息和组件消息 */
	private parseContent(content: any, panel?: any, obj_name?: string): Elem[] {
		/** 解析MHY:ForwardMsg */
		if (obj_name === "MHY:ForwardMsg") {
			return [{
				type: "forward",
				room_id: content.room_id,
				room_name: content.room_name,
				villa_id: content.villa_id,
				villa_name: content.villa_name,
				summary: content.summary_list
			} as Forward]
		}
		/** 解析MHY：RobotCard */
		if (content.bot_id) {
			return [{
				type: "robot",
				id: content.bot_id,
				name: content.name
			} as RobotCard]
		}
		/** 解析MHY：VillaCard */
		if (content.villa_id) {
			return [{
				type: "villa",
				id: Number(content.villa_id),
				name: content.villa_name
			} as VillaCard]
		}
		/** 解析MHY：Image | MHY: AvatarEmoticon | MHY:HoYomoji | MHY:RandomEmoticon */
		if (content.url) {
			const elem = {
				...content?.size,
				size: content.file_size
			}
			/** MHY: AvatarEmoticon | MHY:HoYomoji | MHY:RandomEmoticon */
			if (content.text || content.target_user_id || content.entities || content.action_id) {
				elem.type = "hoyo"
				elem.content = new Parser(this.c).parseContent({text: content.text, entities: content.entities})
				content.target_user_id && (elem.to_uid = Number(content.target_user_id) || content.target_user_id)
				content.action_id && (elem.id = Number(content.action_id) || content.action_id)
				elem.url = content.url
				elem.show = obj_name === "MHY:HoYomoji"
				return [elem as HoYo]
			}
			/** MHY:CustomEmoticon | MHY:VillaEmoticon */
			const image = {
				type: 'image',
				file: content.url,
				...elem
			}
			if (content.id) {
				image.asface = true
				if (obj_name === "MHY:VillaEmoticon" || content.name) {
					return [{
						...image,
						id: Number(content.id) || content.id,
						name: content.name
					} as Image]
				}
				return [{
					...image,
					id: Number(content.id) || content.id
				} as Image]
			}
			return [image]
		}
		/** 解析MHY：Post */
		if (content.post_id) {
			return [{
				type: 'post',
				id: Number(content.post_id)
			} as Post]
		}
		/** 解析MHY: Emoticon */
		if (content.emoticon) {
			return [{
				type: "face",
				name: content.emoticon,
				id: Number(content.id)
			} as Emoticon]
		}
		/** 解析MHY：Text */
		const rs: Elem[] = []
		const text = content.text
		const entities = content.entities as Array<Entity> || []
		const images = content?.images?.[0]
		const preview = content?.preview_link
		const badge = content?.badge
		let now = 0
		entities?.sort((x, y) => (x?.offset || 0) - (y?.offset || 0))
		for (let i = 0; i < entities.length; i++) {
			const entity = {
				entity: [entities[i].entity],
				offset: entities[i].offset,
				length: entities[i].length
			}
			while (entities[i]?.offset === entities[i + 1]?.offset && entities[i]?.length === entities[i + 1]?.length) {
				entity.entity.push(entities[i + 1].entity)
				i++
			}
			let elem: any = {}
			for (let e of entity.entity) {
				if (now !== (entity.offset || 0)) {
					rs.push({
						...elem, ...{
							type: 'text',
							text: text.substring(now, entity.offset)
						} as Text
					})
					now = entity.offset || 0
				}
				if (e.type === "mentioned_robot") {
					if (e.bot_id === (this.c as Bot)?.config?.bot_id) {
						elem = undefined
						continue
					}
					elem = {
						...elem, ...{
							type: 'at',
							id: e.bot_id,
							scope: 'bot',
							nickname: text.substr((entity?.offset || 0) + 1, entity.length - 2)
						} as At
					}
				} else if (e.type === "mentioned_user") {
					elem = {
						...elem, ...{
							type: 'at',
							id: e.user_id,
							scope: 'user',
							nickname: text.substr((entity?.offset || 0) + 1, entity.length - 2)
						} as At
					}
				} else if (e.type === "mentioned_all") {
					elem = {
						...elem, ...{
							type: 'at',
							scope: 'all'
						} as At
					}
				} else if (e.type === 'villa_room_link') {
					elem = {
						...elem, ...{
							type: 'rlink',
							vid: e.villa_id,
							rid: e.room_id,
							name: text.substr((entity?.offset || 0) + 1, entity.length - 2)
						} as LinkRoom
					}
				} else if (e.type === 'link') {
					elem = {
						...elem, ...{
							type: 'link',
							url: e.url,
							name: text.substr(entity?.offset || 0, entity.length),
							ac_tk: e.requires_bot_access_token
						} as Link
					}
				} else if (e.type === "user") {
					elem = {
						...elem, ...{
							type: 'user',
							id: Number(e.user_id) || e.user_id,
							nickname: text.substr((entity?.offset || 0), entity.length)
						} as User
					}
				} else if (e.type === 'style') {
					if (e.font_style === "bold") {
						//@ts-ignore
						elem.style = (elem.style || "") + "b"
					} else if (e.font_style === 'italic') {
						//@ts-ignore
						elem.style = (elem.style || "") + "i"
					} else if (e.font_style === 'strikethrough') {
						//@ts-ignore
						elem.style = (elem.style || "") + "s"
					} else if (e.font_style === 'underline') {
						//@ts-ignore
						elem.style = (elem.style || "") + "u"
					}
				}
			}
			if (elem) {
				if (!elem.type) {
					elem = {
						...elem, ...{
							type: 'text',
							text: text.substr(entity.offset, entity.length)
						} as Text
					}
				}
				rs.push(elem)
			}
			now += entity.length
		}
		if (now !== text.length) rs.push({
			type: 'text',
			text: text.substr(now)
		})
		if (images) {
			rs.push({
				type: 'image',
				file: images.url,
				width: images?.size?.width,
				height: images?.size?.height,
				size: images?.file_size
			} as Image)
		}
		/** 解析Panel */
		if (panel) {
			if (panel.template_id) rs.push({
				type: 'template',
				id: panel.template_id
			} as Template)
			const gl = panel.group_list || []
			for (let row of gl) {
				let size = ""
				if (row.length === 1) size = 'big'
				else if (row.length === 2) size = 'middle'
				else if (row.length === 3) size = 'small'
				for (let c of row) {
					switch (c.type) {
						case 1:
							rs.push({
								type: 'button',
								size: size,
								id: c.id,
								text: c.text,
								cb: c.need_callback,
								extra: c.extra,
								c_type: CType[c.c_type],
								input: c.input,
								link: c.link,
								token: c.need_token
							} as Button)
							break
					}
				}
			}
		}
		/** 解析Preview_link */
		if (preview) {
			rs.push({
				type: 'plink',
				title: preview.title,
				content: preview.content,
				url: preview.url,
				icon: preview.icon_url,
				source: preview.source_name,
				image: preview.image_url
			} as PreviewLink)
		}
		/** 解析badge */
		if (badge) {
			rs.push({
				type: 'badge',
				icon: badge.icon_url,
				text: badge.text,
				url: badge.url
			} as Badge)
		}
		return rs
	}
}