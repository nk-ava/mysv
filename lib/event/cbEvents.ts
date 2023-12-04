import {BaseEvent, MessageRet} from "./baseEvent";
import {Elem} from "../element";

/** 用户加入事件 */
export interface JoinVilla extends BaseEvent {
	/** 加入用户id */
	join_uid: number
	/** 用户昵称 */
	join_nickname: string
	/** 加入时间 */
	join_time: number
}

/** 回调函数中的用户信息 */
export interface User {
	/** 用户id */
	id: string
	/** 用户头像 */
	portraitUri: string
	alias: string
	extra: string
	/** 用户头像 */
	portrait: string
	/** 用户昵称 */
	name: string
}

/** 用户发送信息事件 */
export interface SendMessage extends BaseEvent {
	/** 消息内容 */
	message: Elem[]
	/** 发送者信息 */
	user: User
	/** 文本消息 */
	msg: string
	/** 发送者 id */
	from_uid: number
	/** 发送时间的时间戳 */
	send_at: number
	/** 房间 id */
	room_id: number
	/** 目前只支持文本类型消息 */
	object_name: number
	/** 用户昵称 */
	nickname: string
	/** 消息 id */
	msg_id: string
	/** 如果被回复的消息从属于机器人，则该字段不为空字符串 */
	bot_msg_id: string
	/** 回调消息引用消息的基础信息 */
	quote_msg?: QuoteMsg
}

export interface QuoteMsg {
	/** 消息摘要，如果是文本消息，则返回消息的文本内容。如果是图片消息，则返回"[图片]" */
	content: string
	/** 消息 id */
	msg_uid: string
	/** 如果消息从属于机器人，则该字段不为空字符串 */
	bot_msg_id: string
	/** 发送时间的时间戳 */
	send_at: number
	/** 消息类型，包括"文本"，"图片"，"帖子卡片"等 */
	msg_type: string
	/** 发送者 id（整型） */
	from_user_id: number
	/** 发送者昵称 */
	from_user_nickname: string
	/** 发送者 id（字符串）可携带机器人发送者的id */
	from_user_id_str: string
}

/** 新增机器人事件 */
export interface CreateBot extends BaseEvent {

}

/** 删除机器人事件 */
export interface DeleteBot extends BaseEvent {

}

export interface AddQuickEmoticon extends BaseEvent {
	/** 房间 id */
	room_id: number
	/** 发送表情的用户 id */
	from_uid: number
	/** 表情 id */
	emoticon_id: number
	/** 表情内容 */
	emoticon: string
	/** 被回复的消息 id */
	msg_id: string
	/** 如果被回复的消息从属于机器人，则该字段不为空字符串 */
	bot_msg_id: string
	/** 是否是取消表情 */
	is_cancel: boolean
}

export interface AuditCallback extends BaseEvent {
	/** 审核事件 id */
	audit_id: number
	/** 机器人 id */
	bot_id: string
	/** 房间 id（和审核接口调用方传入的值一致） */
	room_id: number
	/** 用户 id（和审核接口调用方传入的值一致） */
	user_id: number
	/** 透传数据（和审核接口调用方传入的值一致） */
	pass_through: string
	/** 审核结果，0作兼容，1审核通过，2审核驳回 */
	audit_result: number
}

/** 组件点击事件 */
export interface ClickMsgComponent extends BaseEvent {
	/** 房间 id */
	room_id: number
	/** 用户 id */
	uid: number
	/** 消息 id */
	msg_id: string
	/** 如果消息从属于机器人，则该字段不为空字符串 */
	bot_msg_id: string
	/** 机器人自定义的组件id */
	component_id: string
	/** 如果该组件模板为已创建模板，则template_id不为0 */
	template_id: number
	/** 机器人自定义透传信息 */
	extra: string
}