import {Elem} from "../element";
import {Quotable} from "../message";
import {User} from "../event";

export interface Message {
	/** 消息发送者，可以是机器人或其他用户 */
	from_uid: string | number
	/** 消息类型 */
	obj_name: string
	/** 消息来源 */
	source: {
		villa_id: number
		room_id: number
		villa_name: string
		room_name: string
	}
	/** 用户信息 */
	user: User,
	/** 消息元素 */
	message: Elem[]
	/** 发送时间 */
	send_time: number
	/** 消息ID */
	msg_id: string
	/** 消息发送者设备 */
	src: string
	/** 消息展示 */
	msg: string
	/** 发送者昵称 */
	nickname: string

	/** 引用的消息 */
	quote?: Quotable

	reply: (content: Elem | Elem[], quote?: boolean) => Promise<{ msgId: string }>
}