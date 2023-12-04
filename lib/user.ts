import {Perm} from "./villa";

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
export enum Color {
	"DarkBlue" = "#6173AB",
	"Pink" = "#F485D8",
	"Red" = "#F47884",
	"Orange" = "#FFA54B",
	"Green" = "#7BC26F",
	"Blue" = "#59A1EA",
	"Purple" = "#977EE1"
}

export type C = "DarkBlue" | "Pink" | "Red" | "Orange" | "Green" | "Blue" | "Purple"

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
	/** 身分组人数 */
	member_num: number
	/** 身分组权限 */
	permissions: []
	web_color: string
	font_color: string
	bg_color: string
	priority: number
	/** 是否详细 */
	is_detail: boolean
}