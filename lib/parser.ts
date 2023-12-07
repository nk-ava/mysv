import {
	JoinVilla,
	SendMessage,
	CreateBot,
	DeleteBot,
	AddQuickEmoticon,
	AuditCallback,
	BaseEvent,
	ClickMsgComponent
} from "./event";
import {MessageRet} from "./event/baseEvent";
import {Quotable, Serve} from "./serve";
import {Villa, VillaInfo} from "./villa";
import {At, Button, CType, Elem, Image, Link, LinkRoom, Template, Text} from "./element";
import {Entity} from "./message";
import {User} from "./event/cbEvents";

export type Events = JoinVilla | SendMessage | CreateBot | DeleteBot | AddQuickEmoticon | AuditCallback
const et: string[] = ['', 'joinVilla', 'sendMessage', 'createRobot', 'deleteRobot', 'addQuickEmoticon', 'auditCallback', "clickMsgComponent"]

export default class Parser {
	public event_type: string
	private readonly baseEvent: BaseEvent
	private readonly event_data: any
	private readonly c: Serve

	constructor(c: Serve, event: any) {
		this.c = c
		this.event_type = et[event.type]
		this.baseEvent = {
			source: {
				villa_id: event.robot.villa_id,
				bot: event.robot.template
			},
			id: event.id,
			created_time: event.created_at,
			send_time: event.send_at
		}
		this.event_data = event.extend_data.EventData
	}

	async doParse(): Promise<Array<Events>> {
		const es: [string, any][] = Object.entries(this.event_data)
		const rs = new Array<Events>()
		let info = await Villa.getInfo(this.c, this.baseEvent.source.villa_id) as VillaInfo
		this.baseEvent.source.villa_name = info.name
		for (let [k, v] of es) {
			switch (k) {
				case "JoinVilla":
					rs.push({
						...this.baseEvent,
						join_uid: v.join_uid,
						join_nickname: v.join_user_nickname,
						join_time: v.join_at
					} as JoinVilla)
					this.c.logger.info(`用户 ${v.join_nickname}(${v.join_uid})加入大别野[${info.name || "unknown"}](${this.baseEvent.source.villa_id})`)
					break
				case "SendMessage":
					const content = JSON.parse(v.content)
					const msg = content.content.text.replace(`@${this.baseEvent.source.bot.name} `, "")
					rs.push({
						...this.baseEvent,
						message: this.parseContent(content.content, content.panel),
						user: content.user as User,
						msg: msg,
						from_uid: v.from_user_id,
						send_time: v.send_at,
						room_id: v.room_id,
						object_name: v.object_name,
						nickname: v.nickname,
						msg_id: v.msg_uid,
						bot_msg_id: v.bot_msg_id,
						quote_msg: v.quote_msg,
						reply: (content: Elem | Elem[], quote: boolean = false): Promise<MessageRet> => {
							const q: Quotable = {
								message_id: v.msg_uid,
								send_time: v.send_at
							}
							return this.c.sendMsg(v.room_id, this.baseEvent.source.villa_id, content, quote ? q : undefined)
						}
					} as SendMessage)
					this.c.logger.info(`recv from: [Villa: ${info.name || "unknown"}(${this.baseEvent.source.villa_id}), Member: ${v.nickname}(${v.from_user_id})] ${msg}`)
					break
				case "CreateRobot":
					rs.push({
						...this.baseEvent
					})
					this.c.logger.info(`机器人 ${this.baseEvent.source.bot.name}(${this.baseEvent.source.bot.id})加入大别野[${info.name || "unknown"}](${this.baseEvent.source.villa_id})`)
					break
				case "DeleteRobot":
					rs.push({
						...this.baseEvent
					})
					this.c.logger.info(`机器人 ${this.baseEvent.source.bot.name}(${this.baseEvent.source.bot.id})被移出大别野[${info.name || "unknown"}](${this.baseEvent.source.villa_id})`)
					this.c.vl.delete(this.baseEvent.source.villa_id)
					break
				case "AddQuickEmoticon":
					rs.push({
						...this.baseEvent,
						room_id: v.room_id,
						from_uid: v.uid,
						emoticon_id: v.emoticon_id,
						emoticon: v.emoticon,
						msg_id: v.msg_uid,
						bot_msg_id: v.bot_msg_id,
						is_cancel: v.is_cancel,
						reply: (content: Elem | Elem[], quote: boolean = false): Promise<MessageRet> => {
							const q: Quotable = {
								message_id: v.msg_uid,
								send_time: v.send_at
							}
							return this.c.sendMsg(v.room_id, this.baseEvent.source.villa_id, content, quote ? q : undefined)
						}
					} as AddQuickEmoticon)
					const member = await (await Villa.get(this.c, this.baseEvent.source.villa_id))?.getMemberInfo(v.uid)
					this.c.logger.info(`recv from: [Villa: ${info.name || "unknown"}(${this.baseEvent.source.villa_id}), Member: ${member?.basic?.nickname || "unknown"}(${v.uid})] [回复快捷表情]${v.emoticon}`)
					break
				case "AuditCallback":
					rs.push({
						...this.baseEvent,
						audit_id: v.audit_id,
						bot_id: v.bot_tpl_id,
						room_id: v.room_id,
						user_id: v.user_id,
						pass_through: v.pass_through,
						audit_result: v.audit_result,
						reply: (content: Elem | Elem[], quote: boolean = false): Promise<MessageRet> => {
							return this.c.sendMsg(v.room_id, this.baseEvent.source.villa_id, content)
						}
					} as AuditCallback)
					this.c.logger.info(`${v.audit_id}审核结果：${v.audit_result}`)
					break
				case "ClickMsgComponent":
					rs.push({
						...this.baseEvent,
						room_id: v.room_id,
						uid: v.uid,
						msg_id: v.msg_uid,
						bot_msg_id: v.bot_msg_id,
						component_id: v.component_id,
						template_id: v.template_id || 0,
						extra: v.extra,
						reply: (content: Elem | Elem[], quote: boolean = false): Promise<MessageRet> => {
							return this.c.sendMsg(v.room_id, this.baseEvent.source.villa_id, content)
						}
					} as ClickMsgComponent)
					const mem = await (await Villa.get(this.c, this.baseEvent.source.villa_id))?.getMemberInfo(v.uid)
					this.c.logger.info(`recv from: [Villa: ${info.name || "unknown"}(${this.baseEvent.source.villa_id}), Member: ${mem?.basic?.nickname || "unknown"}(${v.uid})] 点击消息组件${v.component_id}`)
					break
			}

		}
		return rs
	}

	/** 米游社用户暂时只能对机器人发送MHY:Text类型消息，所以暂时只解析MYH：Text类型消息和组件消息 */
	private parseContent(content: any, panel?: any): Elem[] {
		const rs: Elem[] = []
		const text = content.text
		const entities = content.entities as Array<Entity>
		const images = content?.images?.[0]
		let now = 0
		entities.sort((x, y) => (x?.offset || 0) - (y?.offset || 0))
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
					if (e.bot_id === this.c.config.bot_id) {
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
							name: text.substr(entity.offset, entity.length),
							ac_tk: e.requires_bot_access_token
						} as Link
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
		if (!panel) return rs
		if (panel.template_id) rs.push({
			type: 'template',
			id: panel.template_id
		} as Template)
		const gl = panel.group_list
		if(!gl) return rs
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
		return rs
	}
}