export interface MsgContentInfo {
	/** 消息的提及信息 */
	mentionedInfo?: MentionedInfo
	/** 引用消息的信息 */
	quote?: QuoteInfo
	/** 消息内容 */
	content: MsgContent
}

export interface MentionedInfo {
	/** 提及类型: 值为1: @全员，值为2: @部分成员 */
	type: number
	/** 如果不是提及全员，应该填写被提及的用户 id 列表 */
	userIdList: string[]
}

export interface QuoteInfo {
	/** 引用消息 id */
	quoted_message_id: string
	/** 引用消息发送时间戳 */
	quoted_message_send_time: number
	/** 引用树初始消息 id，和 quoted_message_id 保持一致即可 */
	original_message_id: string
	/** 引用树初始消息发送时间戳，和 quoted_message_send_time 保持一致即可 */
	original_message_send_time: number
}

export interface MsgContent extends TextMsg, ImageMsg, PostMsg, TextImageMsg {

}

/** 文本消息 */
export interface TextMsg {
	text: string
	entities?: Array<Entity>
}

/** 图片消息 */
export interface ImageMsg {
	url: string
	size?: {
		width: number
		height: number
	}
	file_size?: number
}

/** 图文消息 **/
export interface TextImageMsg extends TextMsg {
	images: ImageMsg[]
}

/** 分享米游社帖子 */
export interface PostMsg {
	/** 米游社帖子链接 https://www.miyoushe.com/ys/article/39872279 最后一个/后的字符串 39872279即帖子 id */
	post_id: string
}

export interface Entity {
	/** 具体的实体信息 */
	entity: AtRobot | AtUser | AtAll | LinkRoomMsg | LinkMsg | FontStyle
	/** 表示UTF-16编码下对应实体在 text 中的起始位置 */
	offset?: number
	/** 表示UTF-16编码下对应实体的长度 */
	length?: number
}

export interface AtRobot {
	type: "mentioned_robot"
	/** at的机器人id */
	bot_id: string
}

export interface FontStyle {
	type: "style"
	font_style: "bold" | "italic" | "strikethrough" | "underline"
}

export interface AtUser {
	type: "mentioned_user"
	/** at的用户id */
	user_id: string
}

export interface AtAll {
	type: "mentioned_all"
}

/** 房间标签，点击会跳转到指定房间（仅支持跳转本大别野的房间） */
export interface LinkRoomMsg {
	type: "villa_room_link"
	villa_id: string
	room_id: string
}

export interface LinkMsg {
	type: "link"
	url: string
	/** 字段为true时，跳转链接会带上含有用户信息的token */
	requires_bot_access_token: boolean
}

/** @oicq (https://github.com/takayama-lily/oicq/blob/main/lib/message/elements.ts#L300C27-L300C27) */
export function fromMCode(str: string): any[] {
	const e = []
	const res = str.matchAll(/\[M:[^\]]+\]/g)
	let prev_index = 0
	for (let v of res) {
		const text = str.slice(prev_index, v.index).replace(/&#91;|&#93;|&amp;/g, unescapeM)
		if (text) e.push({type: "text", text})
		const element = v[0]
		let ms = element.replace("[M:", "type=")
		ms = ms.substr(0, ms.length - 1)
		e.push(qs(ms))
		prev_index = v.index as number + element.length
	}
	if (prev_index < str.length) {
		const text = str.slice(prev_index).replace(/&#91;|&#93;|&amp;/g, unescapeM)
		if (text) e.push({type: "text", text})
	}
	return e
}

function unescapeM(s: string) {
	if (s === "&#91;") return "["
	if (s === "&#93;") return "]"
	if (s === "&amp;") return "&"
	return ""
}

function unescapeMInside(s: string) {
	if (s === "&#44;") return ","
	if (s === "&#91;") return "["
	if (s === "&#93;") return "]"
	if (s === "&amp;") return "&"
	return ""
}

function qs(s: string, sep = ",", equal = "=") {
	const ret: any = {}
	const split = s.split(sep)
	for (let v of split) {
		const i = v.indexOf(equal)
		if (i === -1) continue
		ret[v.substring(0, i)] = v.substr(i + 1).replace(/&#44;|&#91;|&#93;|&amp;/g, unescapeMInside)
	}
	for (let k in ret) {
		try {
			if (k !== "text") ret[k] = JSON.parse(ret[k])
		} catch {
		}
	}
	return ret
}