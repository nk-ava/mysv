import {JoinVilla, SendMessage, CreateBot, DeleteBot, AddQuickEmoticon, AuditCallback, BaseEvent} from "./event";
import {MessageRet} from "./event/baseEvent";
import {Quotable, Serve} from "./serve";

export type Events = JoinVilla | SendMessage | CreateBot | DeleteBot | AddQuickEmoticon | AuditCallback
const et: string[] = ['', 'joinVilla', 'sendMessage', 'createRobot', 'deleteRobot', 'addQuickEmoticon', 'auditCallback']

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

	doParse(): Array<Events> {
		const es: [string, any][] = Object.entries(this.event_data)
		const rs = new Array<Events>()
		for (let [k, v] of es) {
			switch (k) {
				case "JoinVilla":
					rs.push({
						...this.baseEvent,
						join_uid: v.join_uid,
						join_nickname: v.join_user_nickname,
						join_time: v.join_at
					} as JoinVilla)
					this.c.logger.mark(`用户 ${v.join_nickname}(${v.join_uid})加入大别野(${this.baseEvent.source.villa_id})`)
					break
				case "SendMessage":
					const content = JSON.parse(v.content)
					const msg = content.content.text.replace(`@${this.baseEvent.source.bot.name} `, "")
					rs.push({
						...this.baseEvent,
						content: content,
						msg: msg,
						from_uid: v.from_user_id,
						send_time: v.send_at,
						room_id: v.room_id,
						object_name: v.object_name,
						nickname: v.nickname,
						msg_uid: v.msg_uid,
						bot_msg_id: v.bot_msg_id,
						reply: (content: any, quote: boolean = false): Promise<MessageRet> => {
							const q: Quotable = {
								message_id: v.msg_uid,
								send_time: v.send_at
							}
							return this.c.sendMsg(v.room_id, this.baseEvent.source.villa_id, content, quote ? q : undefined)
						}
					} as SendMessage)
					this.c.logger.mark(`别野[${this.baseEvent.source.villa_id}] recv from ${v.nickname}: ${msg}`)
					break
				case "CreateRobot":
					rs.push({
						...this.baseEvent
					})
					this.c.logger.mark(`机器人 ${this.baseEvent.source.bot.name}(${this.baseEvent.source.bot.id})加入大别野(${this.baseEvent.source.villa_id})`)
					break
				case "DeleteRobot":
					rs.push({
						...this.baseEvent
					})
					this.c.logger.mark(`机器人 ${this.baseEvent.source.bot.name}(${this.baseEvent.source.bot.id})被移出大别野(${this.baseEvent.source.villa_id})`)
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
						reply: (content: any, quote: boolean = false): Promise<MessageRet> => {
							const q: Quotable = {
								message_id: v.msg_uid,
								send_time: v.send_at
							}
							return this.c.sendMsg(v.room_id, this.baseEvent.source.villa_id, content, quote ? q : undefined)
						}
					} as AddQuickEmoticon)
					this.c.logger.mark(`别野[${this.baseEvent.source.villa_id}] recv from unknown(${v.uid}): [表态表情]${v.emoticon}`)
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
						reply: (content: any, quote: boolean = false): Promise<MessageRet> => {
							return this.c.sendMsg(v.room_id, this.baseEvent.source.villa_id, content)
						}
					} as AuditCallback)
					this.c.logger.mark(`${v.audit_id}审核结果：${v.audit_result}`)
					break
			}

		}
		return rs
	}
}