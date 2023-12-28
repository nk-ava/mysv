import {Villa} from "../villa";

export interface BaseEvent {
	/** 事件来源 */
	source: Source,
	/** 事件id */
	id: string
	/** 事件创建时间 */
	created_at: number
	/** 回调时间 */
	send_at: number
	/** villa对象 */
	villa?: Villa
}

export interface Source {
	/** 实践所属的大别野id */
	villa_id: number
	/** 大别野名称 */
	villa_name?: string
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
	/** 机器人功能配置 */
	custom_settings: Array<{ name: string, url: string }>
}

export interface MessageRet {
	bot_msg_id: string
}