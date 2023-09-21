/// <reference types="node" />
import * as log4js from "log4js";
import EventEmitter from "node:events";
import { AddQuickEmoticon, AuditCallback, CreateBot, DeleteBot, JoinVilla, SendMessage } from "./event";
import { MessageRet } from "./event/baseEvent";
/** 身份组可选颜色 */
export type Color = "#6173AB" | "#F485D8" | "#F47884" | "#FFA54B" | "#7BC26F" | "#59A1EA" | "#977EE1";
/** 身份组可添加权限 */
export type Perm = "mention_all" | "recall_message" | "pin_message" | "manage_member_role" | "edit_villa_info" | "manage_group_and_room" | "villa_silence" | "black_out" | "handle_apply" | "manage_chat_room" | "view_data_board" | "manage_custom_event" | "live_room_order" | "manage_spotlight_collection";
export declare class ServeRunTimeError {
    code: number;
    message: string;
    constructor(code: number, message?: string);
}
export interface Quotable {
    /** 引用消息的消息id */
    message_id: string;
    /** 引用消息发送的时间 */
    send_time: number;
}
export interface Serve {
    logger: log4js.Logger;
    config: Config;
    mhyHost: string;
    /** 服务启动成功 */
    on(name: 'online', listener: (this: this) => void): this;
    /** 新成员加入 */
    on(name: 'joinVilla', listener: (this: this, e: JoinVilla) => void): this;
    /** 用户at发送消息 */
    on(name: 'sendMessage', listener: (this: this, e: SendMessage) => void): this;
    /** 新增机器人 */
    on(name: 'createRobot', listener: (this: this, e: CreateBot) => void): this;
    /** 移除机器人 */
    on(name: 'deleteRobot', listener: (this: this, e: DeleteBot) => void): this;
    /** 审核回调 */
    on(name: 'auditCallback', listener: (this: this, e: AuditCallback) => void): this;
    /** 机器人发送的消息表情快捷回复 */
    on(name: 'addQuickEmoticon', listener: (this: this, e: AddQuickEmoticon) => void): this;
}
export type LogLevel = 'all' | 'mark' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'off';
export interface Config {
    /** 机器人的唯一标志 */
    bot_id: string;
    /** 机器人鉴权唯一标志，密文传输 */
    secret: string;
    /** 公钥，对secret进行加密 */
    pub_key: string;
    /** logger配置，默认info */
    level?: LogLevel;
    /** 启动的端口号，默认8081 */
    port?: number;
    /** 启动的主机地址，默认localhost */
    host?: string;
    /** 米游社上传图片需要ck，因为不是调用的官方开发api，后续补上官方开发api */
    mys_ck?: string;
    /** 配置的回调地址 */
    callback_url: string;
}
export declare class Serve extends EventEmitter {
    private readonly port;
    private readonly host;
    private readonly application;
    private readonly pubKey;
    private readonly enSecret;
    constructor(props: Config);
    /** 配置application */
    configApplication(): void;
    /** 启动服务 */
    private startServe;
    /** 加密secret */
    encryptSecret(): string;
    /** 签名验证 */
    verifySign(body: any, sign: string): boolean;
    /** 获取大别野信息 */
    getVillaInfo(villa_id: number): Promise<any>;
    /** 获取用户信息 */
    getUserInfo(villa_id: number, uid: number): Promise<any>;
    /** 获取大别野成员列表 */
    getVillaUsers(villa_id: number, size: number, offset_str?: string): Promise<any>;
    /** 提出大别野用户 */
    kickUser(villa_id: number, uid: number): Promise<any>;
    /** 置顶消息 */
    pinMessage(villa_id: number, msg_id: string, is_cancel: boolean, room_id: number, send_time: number): Promise<any>;
    /** 撤回消息 */
    recallMessage(villa_id: number, msg_id: string, room_id: number, msg_time: number): Promise<any>;
    /** 创建分组 */
    createGroup(villa_id: number, group_name: string): Promise<any>;
    /** 编辑分组，只允许编辑分组名称 */
    editGroup(villa_id: number, group_id: number, group_name: string): Promise<any>;
    /** deleteGroup，删除分组 */
    deleteGroup(villa_id: number, group_id: number): Promise<any>;
    /** 获取分组列表 */
    getGroupList(villa_id: number): Promise<any>;
    /** 编辑房间，只支持编辑名称 */
    editRoom(villa_id: number, room_id: number, room_name: string): Promise<any>;
    /** 删除房间 */
    deleteRoom(villa_id: number, room_id: number): Promise<any>;
    /** 获取房间信息 */
    getRoom(villa_id: number, room_id: number): Promise<any>;
    /** 获取别野房间列表信息 */
    getVillaRoomList(villa_id: number): Promise<any>;
    /** 向身份组操作用户 */
    operateMember(villa_id: number, role_id: number, uid: number, is_add: boolean): Promise<any>;
    /** 创建身份组 */
    createRole(villa_id: number, name: string, color: Color, permissions: Perm[]): Promise<any>;
    /** 编辑身份组 */
    editRole(villa_id: number, id: number, name: string, color: Color, permissions: Perm[]): Promise<any>;
    /** 删除身份组 */
    deleteRole(villa_id: number, id: number): Promise<any>;
    /** 获取身份组 */
    getRole(villa_id: number, role_id: number): Promise<any>;
    /** 获取大别野所有身份组 */
    getVillaRoles(villa_id: number): Promise<any>;
    /** 获取全部表情信息 */
    getAllEmoticon(villa_id: number): Promise<any>;
    /** 提交审核，如果送审图片，需先调用转存接口，将转存后的URL填充到audit_content中 */
    submitAudit(villa_id: number, content: string, room_id: number, uid: number, text: boolean, pt?: string): Promise<any>;
    /** 图片转存，只能转存又网络地址的图片，上传图片请配置mys_ck调用上传接口 */
    transferImage(villa_id: number, url: string): Promise<any>;
    /** 发送消息 */
    sendMsg(room_id: number, villa_id: number, content: any, quote?: Quotable): Promise<MessageRet>;
    private _convert;
    private watchPath;
    private fetchResult;
    uploadImage(url: string): Promise<any>;
    private _uploadImage;
}
/** 创建一个服务 */
export declare function createServe(props: Config): Serve;
