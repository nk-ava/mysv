import { BaseEvent } from "./baseEvent";
/** 用户加入事件 */
export interface JoinVilla extends BaseEvent {
    /** 加入用户id */
    join_uid: number;
    /** 用户昵称 */
    join_nickname: string;
    /** 加入时间 */
    join_time: number;
}
/** 用户发送信息事件 */
export interface SendMessage extends BaseEvent {
    /** 消息内容 */
    content: any;
    /** 文本消息 */
    msg: string;
    /** 发送者 id */
    from_uid: number;
    /** 发送时间的时间戳 */
    send_at: number;
    /** 房间 id */
    room_id: number;
    /** 目前只支持文本类型消息 */
    object_name: number;
    /** 用户昵称 */
    nickname: string;
    /** 消息 id */
    msg_uid: string;
    /** 如果被回复的消息从属于机器人，则该字段不为空字符串 */
    bot_msg_id: string;
}
/** 新增机器人事件 */
export interface CreateBot extends BaseEvent {
}
/** 删除机器人事件 */
export interface DeleteBot extends BaseEvent {
}
export interface AddQuickEmoticon extends BaseEvent {
    /** 房间 id */
    room_id: number;
    /** 发送表情的用户 id */
    from_uid: number;
    /** 表情 id */
    emoticon_id: number;
    /** 表情内容 */
    emoticon: string;
    /** 被回复的消息 id */
    msg_id: string;
    /** 如果被回复的消息从属于机器人，则该字段不为空字符串 */
    bot_msg_id: string;
    /** 是否是取消表情 */
    is_cancel: boolean;
}
export interface AuditCallback extends BaseEvent {
    /** 审核事件 id */
    audit_id: number;
    /** 机器人 id */
    bot_id: string;
    /** 房间 id（和审核接口调用方传入的值一致） */
    room_id: number;
    /** 用户 id（和审核接口调用方传入的值一致） */
    user_id: number;
    /** 透传数据（和审核接口调用方传入的值一致） */
    pass_through: string;
    /** 审核结果，0作兼容，1审核通过，2审核驳回 */
    audit_result: number;
}
