export interface MsgContentInfo {
	/** 消息的提及信息 */
	mentionedInfo?: MentionedInfo
	/** 引用消息的信息 */
	quote?: QuoteInfo
	/** 消息内容 */
	content: MsgContent
	/** 组件 */
	panel?: Panel
	/** 网页端用户登入 */
	trace?: any
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


export interface Quotable {
	/** 引用消息的消息id */
	message_id: string
	/** 引用消息发送的时间 */
	send_time: number
}

export interface PreviewLinkMsg {
	title: string
	content: string
	url: string
	icon_url: string
	source_name: string
	image_url: string
}

export interface BadgeMsg {
	"icon_url": string
	"text": string
	"url": string
}

export interface HoYomoji {
	size?: {
		width: number
		height: number
	}
	action_id: string
	entities: Array<Entity>
	target_user_id: string
	text: string
	file_size: number
	url: string
}

type MsgContent = TextMsg | ImageMsg | SMsg

/** 不能组合发的消息 */
export type SMsg = PostMsg | VillaCardMsg | RobotCardMsg | EmoticonMsg | HoYomoji | CVEmoticonMsg | ForwardMsg

/** 文本消息 */
export interface TextMsg {
	text: string
	entities?: Array<Entity>
	images?: ImageMsg[]
	preview_link?: PreviewLinkMsg
	badge?: BadgeMsg
}

/** 分享别野卡片 */
export interface VillaCardMsg {
	villa_id: string
	villa_name?: string
}

/** 分享机器人卡片 */
export interface RobotCardMsg {
	bot_id: string
	name?: string
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

export interface CVEmoticonMsg extends ImageMsg {
	name?: string
	id: string
}

/** 分享米游社帖子 */
export interface PostMsg {
	/** 米游社帖子链接 https://www.miyoushe.com/ys/article/39872279 最后一个/后的字符串 39872279即帖子 id */
	post_id: string
}

export interface Entity {
	/** 具体的实体信息 */
	entity: AtRobot | AtUser | AtAll | LinkRoomMsg | LinkMsg | FontStyle | UserMsg
	/** 表示UTF-16编码下对应实体在 text 中的起始位置 */
	offset?: number
	/** 表示UTF-16编码下对应实体的长度 */
	length: number
}

export interface UserMsg {
	type: 'user'
	user_id: string
}

export interface ForwardMsg {
	room_id?: string
	room_name: string
	villa_id?: string
	villa_name: string
	id?: string
	summary_list: {
		uid?: string
		nickname: string
		content: string
	}[]
}

export interface AtRobot {
	type: "mentioned_robot"
	/** at的机器人id */
	bot_id: string
}

/** 发送表情包消息 */
export interface EmoticonMsg {
	id: string
	emoticon?: string
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

export interface BaseComponent {
	/** 组件id，由机器人自定义，不能为空字符串。面板内的id需要唯一 */
	id: string
	/** 组件展示文本, 不能为空 */
	text: string
	/** 组件类型，目前支持 type=1 按钮组件，未来会扩展更多组件类型 */
	type: number
	/** 是否订阅该组件的回调事件 */
	need_callback: boolean
	/** 组件回调透传信息，由机器人自定义 */
	extra?: string
}

export interface ButtonComponent extends BaseComponent {
	/** 组件交互类型，包括：1回传型，2输入型，3跳转型 */
	c_type: number
	/** 如果交互类型为输入型，则需要在该字段填充输入内容，不能为空 */
	input?: string
	/** 如果交互类型为跳转型，需要在该字段填充跳转链接，不能为空 */
	link?: string
	/** 对于跳转链接来说，如果希望携带用户信息token，则need_token设置为true */
	need_token?: boolean
}

export type Component = ButtonComponent

export type Component_group = Component[]

export interface Panel {
	/** 模板id，通过创建消息组件模板接口，可以提前将组件面板保存，使用 template_id来快捷发送消息 */
	template_id?: number
	/** 定义小型组件，即一行摆置3个组件，每个组件最多展示2个中文字符或4个英文字符 */
	small_component_group_list?: Component_group[]
	/** 定义中型组件，即一行摆置2个组件，每个组件最多展示4个中文字符或8个英文字符 */
	mid_component_group_list?: Component_group[]
	/** 定义大型组件，即一行摆置1个组件，每个组件最多展示10个中文字符或20个英文字符 */
	big_component_group_list?: Component_group[]
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