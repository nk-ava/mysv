import {Serve} from "./serve";
import {lock} from "./common";

class User {
	uid: number;
	c: Serve

	protected constructor(c: Serve, uid: number, private _info: UserInfo) {
		this.uid = uid
		this.c = c

		lock(this, "_info")
	}
}

class Member extends User {

}

export interface UserInfo {
	/** 用户 uid */
	uid: number
	/** 用户呢称 */
	nickname: string
	/** 用户签名 */
	introduce: string
	/** 用户头像链接 */
	avatar_url: string
}

export interface MemberInfo {
	/** 用户基本信息 */
	basic: UserInfo
	/** 用户加入的身份组 id 列表 */
	role_id_list: number[]
	/** 用户加入时间 */
	joined_at: number
	/** 用户已加入的身份组列表 */
	role_list: MemberRole[]
}

/** 身份组可选颜色 */
export type Color = "#6173AB" | "#F485D8" | "#F47884" | "#FFA54B" | "#7BC26F" | "#59A1EA" | "#977EE1"

/** 身份组类型 */
export type RoleType = "MEMBER_ROLE_TYPE_ALL_MEMBER"//所有人身份组
	| "MEMBER_ROLE_TYPE_ADMIN"	//管理员身份组
	| "MEMBER_ROLE_TYPE_OWNER"	//大别野房主身份组
	| "MEMBER_ROLE_TYPE_CUSTOM"	//其他自定义身份组
	| "MEMBER_ROLE_TYPE_UNKNOWN"	//未知

export interface MemberRole {
	/** 身份组 id */
	id: number
	/** 身份组名称 */
	name: string
	/** 大别野 id */
	villa_id: number
	/** 身份组颜色，可选项见颜色 */
	color: Color
	/** 身份组类型 */
	role_type: RoleType
	/** 是否选择全部房间 */
	is_all_room: boolean
	/** 指定的房间列表 */
	room_ids: number[]
}