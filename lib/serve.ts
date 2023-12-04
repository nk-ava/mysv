import * as log4js from "log4js";
import crypto from "crypto";
import axios from "axios";
import {Encode, lock, md5Stream} from "./common"
import express, {Application} from "express";
import EventEmitter from "node:events";
import Parser, {Events} from "./parser"
import bodyParse from "body-parser";
import {verifyPKCS1v15} from "./verify";
import {AddQuickEmoticon, AuditCallback, CreateBot, DeleteBot, JoinVilla, SendMessage} from "./event";
import {C, Color} from "./user";
import {MsgContentInfo, QuoteInfo} from "./message";
import {MessageRet} from "./event/baseEvent";
import stream from "stream";
import FormData from "form-data";
import fs from "fs";
import {Msg} from "./element";
import {Perm, Villa, VillaInfo} from "./villa";

const pkg = require("../package.json")

export class ServeRunTimeError {
	constructor(public code: number, public message: string = "unknown") {
		this.code = code
		this.message = message
	}
}

export interface Quotable {
	/** 引用消息的消息id */
	message_id: string
	/** 引用消息发送的时间 */
	send_time: number
}

export interface Serve {
	logger: log4js.Logger
	config: Config
	mhyHost: string

	/** 服务启动成功 */
	on(name: 'online', listener: (this: this) => void): this

	/** 新成员加入 */
	on(name: 'joinVilla', listener: (this: this, e: JoinVilla) => void): this

	/** 用户at发送消息 */
	on(name: 'sendMessage', listener: (this: this, e: SendMessage) => void): this

	/** 新增机器人 */
	on(name: 'createRobot', listener: (this: this, e: CreateBot) => void): this

	/** 移除机器人 */
	on(name: 'deleteRobot', listener: (this: this, e: DeleteBot) => void): this

	/** 审核回调 */
	on(name: 'auditCallback', listener: (this: this, e: AuditCallback) => void): this

	/** 机器人发送的消息表情快捷回复 */
	on(name: 'addQuickEmoticon', listener: (this: this, e: AddQuickEmoticon) => void): this
}

export type LogLevel = 'all' | 'mark' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'off'

export interface Config {
	/** 机器人的唯一标志 */
	bot_id: string
	/** 机器人鉴权唯一标志，密文传输 */
	secret: string
	/** 公钥，对secret进行加密 */
	pub_key: string

	/** logger配置，默认info */
	level?: LogLevel

	/** 启动的端口号，默认8081 */
	port?: number
	/** 启动的主机地址，默认localhost */
	host?: string

	/**
	 * 米游社上传图片需要ck，因为不是调用的官方开发api，后续补上官方开发api
	 * 如果配置了mys_ck会优先使用ck进行图片上传，不配置就走官方接口
	 */
	mys_ck?: string

	/** 配置的回调地址 */
	callback_url: string

	/** 是否开启签名验证，默认开启，若验证影响性能可关闭 */
	is_verify?: boolean
}

export class Serve extends EventEmitter {
	private readonly port: number
	private readonly host: string
	private readonly application: Application
	private readonly pubKey: crypto.KeyObject
	private readonly enSecret: string
	private readonly jwkKey: crypto.JsonWebKey
	private readonly state = {
		start_time: Date.now()
	}

	readonly vl = new Map<number, VillaInfo>()

	constructor(props: Config) {
		super();
		this.config = {
			level: 'info',
			port: 8081,
			host: 'localhost',
			is_verify: true,
			...props
		}
		this.mhyHost = "https://bbs-api.miyoushe.com"
		this.application = express()
		this.host = props.host || 'localhost'
		this.port = props.port || 8081
		this.pubKey = crypto.createPublicKey(props.pub_key)
		this.jwkKey = this.pubKey.export({format: "jwk"})
		this.enSecret = this.encryptSecret()
		this.logger = log4js.getLogger(`[BOT_ID:${this.config.bot_id}]`)
		this.logger.level = this.config.level as LogLevel
		this.configApplication()
		this.startServe()

		lock(this, "enSecret")
		lock(this, "config")
	}

	/** 配置application */
	configApplication() {
		/** 解析json */
		this.application.use(bodyParse.json())
		this.application.use(express.urlencoded({extended: true}))
		/** 解决跨域 */
		this.application.all("*", (req, res, next) => {
			res.header("Access-Control-Allow-Origin", "*")
			res.header("Access-Control-Allow-Headers", "Content-Type")
			res.header("Access-Control-Allow-Method", "*")
			res.header("Content-Type", "application/json; charset=utf-8")
			next()
		})
	}

	/** 启动服务 */
	private startServe(): any {
		this.application.listen(this.port, this.host, () => {
			this.logger.mark("---------------")
			this.logger.mark(`Package Version: ${pkg.name}@${pkg.version} (Released on ${pkg.update})`)
			this.logger.mark(`Repository Url: ${pkg.repository}`)
			this.logger.mark("---------------")
			this.logger.info(`服务已成功启动，服务地址：http://${this.host}:${this.port}`)
			this.watchPath()
			this.emit("online")
		})
	}

	/** 加密secret */
	encryptSecret(): string {
		const hmac = crypto.createHmac("sha256", Buffer.from(this.config.pub_key))
		hmac.update(this.config.secret)
		return hmac.digest("hex")
	}

	/** 签名验证 */
	verifySign(body: any, sign: string): boolean {
		if (!this.config.is_verify) return true
		if (!(body instanceof String)) {
			body = JSON.stringify(body)
		}
		const str = `body=${Encode(body.trim())}&secret=${Encode(this.config.secret)}`
		const d = crypto.createHash("SHA256").update(str).digest()
		return verifyPKCS1v15(this.jwkKey, d, Buffer.from(sign.trim(), "base64"))
	}

	/** 返回当前已加载的别野列表 */
	getVillaList() {
		return this.vl
	}

	/** 增加别野信息 */
	addVillaInfo(villa_id: number, info: VillaInfo) {
		this.vl.set(villa_id, info)
	}

	/** 删除别野信息 */
	deleteVillaInfo(villa_id: number): boolean {
		return this.vl.delete(villa_id)
	}

	/** 选择一个别野 */
	async pickVilla(vid: number) {
		return await Villa.get(this, vid)
	}

	/** 获取大别野信息 */
	async getVillaInfo(villa_id: number) {
		return (await this.pickVilla(villa_id))?.getVillaInfo();
	}

	/** 获取别野用户信息 */
	async getMemberInfo(villa_id: number, uid: number) {
		return (await this.pickVilla(villa_id))?.getMemberInfo(uid)
	}

	/** 获取大别野成员列表 */
	async getVillaMembers(villa_id: number, size: number, offset_str: string = "") {
		return (await this.pickVilla(villa_id))?.getVillaMembers(size, offset_str)
	}

	/** 提出大别野用户 */
	async kickUser(villa_id: number, uid: number) {
		return (await this.pickVilla(villa_id))?.kickUser(uid)
	}

	/** 置顶消息 */
	async pinMessage(villa_id: number, msg_id: string, is_cancel: boolean, room_id: number, send_time: number) {
		const path = "/vila/api/bot/platform/pinMessage"
		return await this.fetchResult(villa_id, path, 'post', "", {
			msg_id: msg_id,
			is_cancel: is_cancel,
			room_id: room_id,
			send_time: send_time
		})
	}

	/** 撤回消息 */
	async recallMessage(villa_id: number, msg_id: string, room_id: number, msg_time: number) {
		const path = "/vila/api/bot/platform/recallMessage"
		return await this.fetchResult(villa_id, path, 'get', `?msg_id=${msg_id}&room_id=${room_id}&msg_time=${msg_time}`)
	}

	/** 创建分组 */
	async createGroup(villa_id: number, group_name: string) {
		return (await this.pickVilla(villa_id))?.createGroup(group_name)
	}

	/** 编辑分组，只允许编辑分组名称 */
	async editGroup(villa_id: number, group_id: number, group_name: string) {
		return (await this.pickVilla(villa_id))?.editGroup(group_id, group_name)
	}

	/** deleteGroup，删除分组 */
	async deleteGroup(villa_id: number, group_id: number) {
		return (await this.pickVilla(villa_id))?.deleteGroup(group_id)
	}

	/** 获取分组列表 */
	async getGroupList(villa_id: number) {
		return (await this.pickVilla(villa_id))?.getGroupList()
	}

	/** 编辑房间，只支持编辑名称 */
	async editRoom(villa_id: number, room_id: number, room_name: string) {
		return (await this.pickVilla(villa_id))?.editRoom(room_id, room_name)
	}

	/** 删除房间 */
	async deleteRoom(villa_id: number, room_id: number) {
		return (await this.pickVilla(villa_id))?.deleteRoom(room_id)
	}

	/** 获取房间信息 */
	async getRoom(villa_id: number, room_id: number) {
		return (await this.pickVilla(villa_id))?.getRoom(room_id)
	}

	/** 获取别野房间列表信息 */
	async getVillaRoomList(villa_id: number, f = false) {
		return (await this.pickVilla(villa_id))?.getVillaRoomList(f)
	}

	/** 向身份组操作用户 */
	async operateMember(villa_id: number, role_id: number, uid: number, is_add: boolean) {
		return (await this.pickVilla(villa_id))?.operateMember(role_id, uid, is_add)
	}

	/** 创建身份组 */
	async createRole(villa_id: number, name: string, color: C, permissions: Perm[]) {
		return (await this.pickVilla(villa_id))?.createRole(name, color, permissions)
	}

	/** 编辑身份组 */
	async editRole(villa_id: number, id: number, name: string, color: C, permissions: Perm[]) {
		return (await this.pickVilla(villa_id))?.editRole(id, name, color, permissions)
	}

	/** 删除身份组 */
	async deleteRole(villa_id: number, id: number) {
		return (await this.pickVilla(villa_id))?.deleteRole(id)
	}

	/** 获取身份组 */
	async getRole(villa_id: number, role_id: number) {
		return (await this.pickVilla(villa_id))?.getRole(role_id)
	}

	/** 获取大别野所有身份组 */
	async getVillaRoles(villa_id: number) {
		return (await this.pickVilla(villa_id))?.getVillaRoles()
	}

	/** 获取全部表情信息 */
	async getAllEmoticon(villa_id: number) {
		return this.fetchResult(villa_id, "/vila/api/bot/platform/getAllEmoticons", "get", "")
	}

	/** 提交审核，如果送审图片，需先调用转存接口，将转存后的URL填充到audit_content中 */
	async submitAudit(villa_id: number, content: string, room_id: number, uid: number, text: boolean, pt: string = "") {
		const {data} = await axios.post(`${this.mhyHost}/vila/api/bot/platform/audit`, {
			audit_content: content,
			pass_through: pt,
			room_id: room_id,
			uid: uid,
			content_type: text ? "AuditContentTypeText" : "AuditContentTypeImage"
		}, {
			headers: {
				"x-rpc-bot_id": this.config.bot_id,
				"x-rpc-bot_secret": this.enSecret,
				"x-rpc-bot_villa_id": villa_id,
				"Content-Type": "application/json"
			}
		})
		return data.data
	}

	/** 图片转存，只能转存有网络地址的图片，上传图片请配置mys_ck调用上传接口 */
	async transferImage(url: string, villa_id?: number) {
		if (!villa_id) throw new ServeRunTimeError(-1, '图片转存缺少参数villa_id')
		return this.fetchResult(villa_id, "/vila/api/bot/platform/transferImage", "post", "", {
			url: url
		})
	}

	/** 发送消息 */
	async sendMsg(room_id: number, villa_id: number, content: any, quote?: Quotable): Promise<MessageRet> {
		const {message, obj_name} = await this._convert(content, villa_id)
		if (quote) {
			message.quote = {
				quoted_message_id: quote.message_id,
				quoted_message_send_time: quote.send_time,
				original_message_id: quote.message_id,
				original_message_send_time: quote.send_time
			} as QuoteInfo
		}
		this.logger.debug("message:", message, "obj_name:", obj_name)
		const path = "/vila/api/bot/platform/sendMessage"
		const body = {
			"room_id": room_id,
			"object_name": obj_name,
			"msg_content": JSON.stringify(message)
		}
		const {data} = await axios.post(`${this.mhyHost}${path}`, body, {
			headers: {
				"x-rpc-bot_id": this.config.bot_id,
				"x-rpc-bot_secret": this.enSecret,
				"x-rpc-bot_villa_id": villa_id,
				"Content-Type": "application/json"
			}
		})
		const r = data.data
		if (!r) throw new ServeRunTimeError(-8, `消息发送失败：${data.message}`)
		return r
	}

	private async _convert(msg: any, villa_id: number): Promise<{ message: MsgContentInfo, obj_name: string | undefined }> {
		if (!Array.isArray(msg)) msg = [msg]
		return (await new Msg(this, villa_id).parse(msg)).gen();
	}

	private watchPath() {
		if (!this.config.callback_url) throw new ServeRunTimeError(-6, "未配置回调地址")
		const url = new URL(this.config.callback_url)
		this.application.post(url.pathname, async (req, res) => {
			const event = req.body
			if (this.verifySign(event, req.header("x-rpc-bot_sign") || "")) {
				const parser = new Parser(this, event.event)
				const events: Array<Events> = await parser.doParse();
				for (let e of events) {
					this.emit(parser.event_type, e)
				}
			}
			res.status(200)
			res.setHeader("Content-Type", "application/json")
			res.send({"message": "", "retcode": 0})
			res.end()
		})
	}

	async fetchResult(villa_id: number, path: string, method: string, query: string, body: any = undefined) {
		const {data} = await axios(
			`${this.mhyHost}${path}${query}`
			, {
				method: method,
				data: body,
				headers: {
					"x-rpc-bot_id": this.config.bot_id,
					"x-rpc-bot_secret": this.enSecret,
					"x-rpc-bot_villa_id": villa_id,
					"Content-Type": "application/json"
				}
			})
		const r = data.data
		if (!r) throw new ServeRunTimeError(-7, `接口调用出错：${data.message}`)
		return r
	}

	async uploadImage(url: string, villa_id?: number): Promise<any> {
		if (url.startsWith("https://") || url.startsWith("http://")) {
			if (/^https?:\/\/(webstatic.mihoyo.com)|(upload-bbs.miyoushe.com)/.test(url)) return url
			else return this.transferImage(url, villa_id)
		}
		try {
			const readable = fs.createReadStream(url);
			const ext = url.match(/\.\w+$/)?.[0]?.slice(1)
			if (this.config.mys_ck) var {message, data} = await this._uploadImageWithCk(readable, ext)
			else var {message, data} = await this._uploadImageApi(readable, ext, villa_id)
			if (!data) throw new ServeRunTimeError(-4, message)
			return data.url
		} catch (e: any) {
			throw new ServeRunTimeError(e.code || -5, e.message)
		}
	}

	private async _uploadImageWithCk(readable: stream.Readable, e: string | undefined): Promise<{ recode: number, message: string, data: any }> {
		if (!this.config.mys_ck) throw new ServeRunTimeError(-3, "未配置mys_ck，无法调用上传接口")
		if (!readable.readable) throw new ServeRunTimeError(-1, "The first argument is not readable stream")
		/** 支持jpg,jpeg,png,gif,bmp **/
		const ext = e || 'png';
		const file = await md5Stream(readable);
		const md5 = file.md5.toString("hex");
		const {data} = await axios.get(
			`https://bbs-api.miyoushe.com/apihub/sapi/getUploadParams?md5=${md5}&ext=${ext}&support_content_type=1&upload_source=1`, {
				headers: {
					"cookie": this.config.mys_ck
				}
			})
		if (!data.data) return data
		const param = data.data
		const form = new FormData();
		form.append("x:extra", param.params['callback_var']['x:extra']);
		form.append("OSSAccessKeyId", param.params.accessid);
		form.append("signature", param.params.signature);
		form.append("success_action_status", '200');
		form.append("name", param.file_name);
		form.append("callback", param.params.callback);
		form.append("x-oss-content-type", param.params.x_oss_content_type);
		form.append("key", param.file_name);
		form.append("policy", param.params.policy);
		form.append("file", file.buff, {filename: param.params.name});
		return (await axios.post(param.params.host, form, {
			headers: {...form.getHeaders(), "Connection": 'Keep-Alive', "Accept-Encoding": "gzip"}
		})).data
	}

	private async _uploadImageApi(readable: stream.Readable, e: string | undefined, villa_id?: number): Promise<{ recode: number, message: string, data: any }> {
		if (!villa_id) throw new ServeRunTimeError(-1, '上传图片缺少参数villa_id')
		const path = "/vila/api/bot/platform/getUploadImageParams"
		const ext = e || 'png';
		const file = await md5Stream(readable);
		const md5 = file.md5.toString("hex");
		const {params} = await this.fetchResult(villa_id, path, "get", `?md5=${md5}&ext=${ext}`)
		if (!params) throw new ServeRunTimeError(-9, "上传图片获取参数失败")
		const form = new FormData()
		form.append("x:extra", params["callback_var"]["x:extra"])
		form.append("OSSAccessKeyId", params.accessid)
		form.append("signature", params.signature)
		form.append("success_action_status", params.success_action_status)
		form.append("name", params.name)
		form.append("callback", params.callback)
		form.append("x-oss-content-type", params.x_oss_content_type)
		form.append("key", params.key)
		form.append("policy", params.policy)
		form.append("Content-Disposition", params.content_disposition)
		form.append("file", file.buff)
		return (await axios.post(params.host, form, {
			headers: {
				...form.getHeaders()
			}
		})).data
	}
}

/** 创建一个服务 */
export function createServe(props: Config) {
	return new Serve(props)
}