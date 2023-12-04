export interface BaseEvent {
	/** 事件来源 */
	source: Source,
	/** 事件id */
	id: string
	/** 事件创建时间 */
	created_time: number
	/** 回调时间 */
	send_time: number

	/** 回复消息 */
	reply?: (content: any, quote?: boolean) => Promise<MessageRet>
}

export interface Source {
	/** 实践所属的大别野id */
	villa_id: number
	/** 机器人信息 */
	bot: Bot
}

export interface Bot {
	/** 机器人id */
	id: string
	/** 机器人名称 */
	name: string
	/** 机器人描述 */
	desc: string
	/** 机器人图标 */
	icon: string
	/** 机器人配置的指令 */
	command: Array<{ name: string, desc: string }>
}

export interface MessageRet {
	bot_msg_id: string
}