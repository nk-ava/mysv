import * as log4js from "log4js";
import crypto from "crypto";
import axios, {AxiosResponse} from "axios";
import {Encode, fetchQrCode, getHeaders, lock, md5Stream, TMP_PATH} from "./common"
import EventEmitter from "node:events";
import {verifyPKCS1v15} from "./verify";
import {
	AddQuickEmoticon,
	AuditCallback,
	ClickMsgComponent,
	CreateBot,
	DeleteBot,
	JoinVilla,
	SendMessage
} from "./event";
import {C} from "./user";
import {MsgContentInfo, Panel, QuoteInfo} from "./message";
import {MessageRet} from "./event/baseEvent";
import stream from "stream";
import FormData from "form-data";
import fs from "fs";
import {Elem, Msg} from "./element";
import {Perm, Villa, VillaInfo} from "./villa";
import {Readable} from "node:stream";
import {WsClient} from "./ws";
import {HttpClient} from "./http";
import {UClient} from "./uClient";

const pkg = require("../package.json")

export class RobotRunTimeError {
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

export interface Bot {
	logger: log4js.Logger
	config: Config
	mhyHost: string

	/** 服务启动成功 */
	on(name: 'online', listener: (this: this) => void): this

	/** 新成员加入 */
	on(name: 'JoinVilla', listener: (this: this, e: JoinVilla) => void): this

	/** 用户at发送消息 */
	on(name: 'SendMessage', listener: (this: this, e: SendMessage) => void): this

	/** 新增机器人 */
	on(name: 'CreateRobot', listener: (this: this, e: CreateBot) => void): this

	/** 移除机器人 */
	on(name: 'DeleteRobot', listener: (this: this, e: DeleteBot) => void): this

	/** 审核回调 */
	on(name: 'AuditCallback', listener: (this: this, e: AuditCallback) => void): this

	/** 机器人发送的消息表情快捷回复 */
	on(name: 'AddQuickEmoticon', listener: (this: this, e: AddQuickEmoticon) => void): this

	/** 点击消息组件事件 */
	on(name: 'ClickMsgComponent', listener: (this: this, e: ClickMsgComponent) => void): this

	on(name: string, listener: (this: this, ...args: any[]) => void): this
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
	/** 启动的主机地址，默认为本机ip */
	host?: string

	/** 是否通过WS建连,若ws为true，则优先使用ws，不用再配置回调地址路径 */
	ws?: boolean

	/** 测试别野id，如果机器人未上线，则需要填入测试别野id，否则无法使用ws */
	villa_id?: number

	/** 是否用户登入 */
	user_login?: boolean

	/**
	 * 米游社上传图片需要ck，因为不是调用的官方开发api，后续补上官方开发api
	 * 优先使用官方接口进行图片上传，此上传接口仅在官方接口不可用时自动调用
	 */
	mys_ck?: string

	/** 配置的回调地址路径，不用写域名 */
	callback_path?: string

	/** 是否开启签名验证，默认开启，若验证影响性能可关闭 */
	is_verify?: boolean

	/** 存放机器人数据路径 */
	data_dir?: string
}

const INTERVAL = Symbol("INTERVAL")

export class Bot extends EventEmitter {
	private readonly pubKey: crypto.KeyObject
	private readonly enSecret: string
	private readonly jwkKey: crypto.JsonWebKey | undefined
	private [INTERVAL]!: NodeJS.Timeout
	private uClient!: UClient
	private statistics = {
		start_time: Date.now(),
		send_msg_cnt: 0,
		send_img_cnt: 0,
		recv_event_cnt: 0,
		pkt_lost_cnt: 0,
		pkt_send_cnt: 0,
		call_api_cnt: 0
	}

	readonly vl = new Map<number, VillaInfo>()
	private client: HttpClient | WsClient | undefined;
	private keepAlive: boolean
	private keepUseAlive: boolean

	public handler: Map<string, Function>

	constructor(props: Config) {
		super();
		this.config = {
			level: 'info',
			is_verify: true,
			villa_id: 0,
			user_login: false,
			...props
		}
		if (!this.config?.pub_key?.length) throw new RobotRunTimeError(-1, '未配置公钥，请配置后重试')
		if (!fs.existsSync("./data")) fs.mkdirSync("./data")
		if (!this.config.data_dir) this.config.data_dir = `./data/${this.config.bot_id}`
		if (!fs.existsSync(this.config.data_dir)) fs.mkdirSync(this.config.data_dir)
		this.mhyHost = "https://bbs-api.miyoushe.com"
		this.handler = new Map
		this.pubKey = crypto.createPublicKey(props.pub_key)
		if (!this.config.ws) this.jwkKey = this.pubKey.export({format: "jwk"})
		this.enSecret = this.encryptSecret()
		this.logger = log4js.getLogger(`[BOT_ID:${this.config.bot_id}]`)
		this.logger.level = this.config.level as LogLevel
		this.keepAlive = true
		this.keepUseAlive = true
		this.printPkgInfo()
		if (this.config.mys_ck === "" || this.config.user_login) this.getMysCk((ck: string) => {
			this.config.mys_ck = ck
			fs.writeFile(`${this.config.data_dir}/cookie`, ck, () => {})
			this.run().then(() => this.emit("online"))
		})
		else this.run().then(() => this.emit("online"))

		lock(this, "enSecret")
		lock(this, "config")
		lock(this, "handler")
		lock(this, 'statistics')
		lock(this, "jwkKey")
		lock(this, "pubKey")

	}

	get stat() {
		return this.statistics
	}

	private run() {
		return new Promise(resolve => {
			const runs = () => {
				if (this.config.ws) {
					this.newWsClient(resolve).then()
				} else {
					this.client = new HttpClient(this, this.config, resolve)
				}
			}
			if (this.config.user_login) {
				this.newUClient(runs).then()
			} else runs()
		})
	}

	setKeepAlive(k: boolean) {
		this.keepAlive = k
	}

	setUseAlive(s: boolean) {
		this.keepUseAlive = s
	}

	private async newWsClient(cb: Function) {
		try {
			this.client = await WsClient.new(this, cb)
			this.client.on("close", async (code, reason) => {
				(this.client as WsClient).destroy()
				if (!this.keepAlive) return
				this.logger.error(`连接已断开，reason ${reason.toString() || 'unknown'}(${code})，5秒后将自动重连...`)
				setTimeout(async () => {
					await this.newWsClient(cb)
				}, 5000)
			})
		} catch (err) {
			this.logger.error(`${(err as Error).message || "建立连接失败"}, 5秒后将自动重连...`)
			setTimeout(async () => {
				await this.newWsClient(cb)
			}, 5000)
		}
	}

	private async newUClient(cb: Function) {
		try {
			this.uClient = await UClient.new(this, cb)
			this.uClient.on("close", async (code, reason) => {
				this.uClient.destroy()
				if (!this.keepUseAlive) return
				this.logger.error(`uclient连接已断开，reason ${reason.toString() || 'unknown'}(${code})，5秒后将自动重连...`)
				setTimeout(async () => {
					await this.newUClient(cb)
				}, 5000)
			})
		} catch (err) {
			if ((err as Error).message.includes("not login")) {
				this.logger.error("mys_ck已失效，请重新删除cookie后扫码登入")
				fs.unlinkSync(`${this.config.data_dir}/cookie`)
				return
			}
			this.logger.error(`${(err as Error).message || "uclient建立连接失败"}, 5秒后将自动重连...`)
			setTimeout(async () => {
				await this.newUClient(cb)
			}, 5000)
		}
	}

	private getMysCk(cb: Function) {
		if (!fs.existsSync(`${this.config.data_dir}/cookie`)) fs.writeFileSync(`${this.config.data_dir}/cookie`, "")
		let ck: string = fs.readFileSync(`${this.config.data_dir}/cookie`, "utf-8")
		if (ck && ck !== "") {
			cb(ck)
			return
		}
		const handler = async (data: Buffer) => {
			clearInterval(this[INTERVAL])
			this._QrCodeLogin().then()
		}
		process.stdin.on("data", handler)
		this.on("qrLogin.success", ck => {
			this.logger.info("二维码扫码登入成功")
			process.stdin.off("data", handler)
			cb(ck)
		})
		this.on("qrLogin.error", e => {
			this.logger.error("登入失败：reason " + e)
		})
		this._QrCodeLogin().then()
	}

	private async _QrCodeLogin() {
		const {img, ticket} = await fetchQrCode.call(this);
		console.log("请用米游社扫描二维码，回车刷新二维码")
		console.log(`二维码已保存到${img}`)
		this[INTERVAL] = setInterval(async () => {
			this.logger.debug('请求二维码状态...')
			const res: AxiosResponse = await axios.post("https://passport-api.miyoushe.com/account/ma-cn-passport/web/queryQRLoginStatus?ticket=" + ticket, {}, {
				headers: getHeaders()
			})
			let status = res?.data
			if (!status) return
			if (status.message !== 'OK') {
				this.emit("qrLogin.error", status?.message || "unknown")
				clearInterval(this[INTERVAL])
				return
			}
			status = status?.data?.status
			if (!status) return
			if (status === 'Confirmed') {
				const set_cookie = res.headers["set-cookie"]
				if (!set_cookie) {
					this.emit("qrLogin.error", "没有获取到cookie, 请刷新重试")
					clearInterval(this[INTERVAL])
					return
				}
				let cookie = ""
				for (let ck of set_cookie) cookie += ck.split("; ")[0] + "; "
				if (cookie === "") this.emit("qrLogin.error", "获取到的cookie为空，请刷新二维码重新获取")
				else this.emit("qrLogin.success", cookie)
				clearInterval(this[INTERVAL])
			}
		}, 1000)
	}

	/** 输出包信息 */
	private printPkgInfo() {
		this.logger.mark("---------------")
		this.logger.mark(`Package Version: ${pkg.name}@${pkg.version} (Released on ${pkg.update})`)
		this.logger.mark(`Repository Url: ${pkg.repository}`)
		this.logger.mark("---------------")
	}

	/** 加密secret */
	encryptSecret(): string {
		const hmac = crypto.createHmac("sha256", Buffer.from(this.config.pub_key))
		hmac.update(this.config.secret)
		return hmac.digest("hex")
	}

	/** 签名验证 */
	verifySign(body: any, sign: string): boolean {
		if (!this.jwkKey) throw new RobotRunTimeError(-1, '公钥配置错误，请检查后重试')
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

	/** 选择一个别野 */
	async pickVilla(vid: number) {
		return await Villa.get(this, vid)
	}

	/** 获取大别野信息 */
	async getVillaInfo(villa_id: number) {
		return (await this.pickVilla(villa_id))?.getInfo();
	}

	/** 获取别野用户信息 */
	async getMemberInfo(villa_id: number, uid: number, force?: boolean) {
		return (await this.pickVilla(villa_id))?.getMemberInfo(uid, force)
	}

	/** 获取大别野成员列表 */
	async getVillaMembers(villa_id: number, size: number, offset_str: string = "") {
		return (await this.pickVilla(villa_id))?.getMembers(size, offset_str)
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
	async getGroupList(villa_id: number, force?: boolean) {
		return (await this.pickVilla(villa_id))?.getGroups(force)
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
	async getRoom(villa_id: number, room_id: number, force?: boolean) {
		return (await this.pickVilla(villa_id))?.getRoom(room_id, force)
	}

	/** 获取别野房间列表信息 */
	async getVillaRoomList(villa_id: number, f?: boolean) {
		return (await this.pickVilla(villa_id))?.getRooms(f)
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
	async getRole(villa_id: number, role_id: number, detail?: boolean) {
		return (await this.pickVilla(villa_id))?.getRole(role_id, detail)
	}

	/** 获取大别野所有身份组 */
	async getVillaRoles(villa_id: number, force?: boolean) {
		return (await this.pickVilla(villa_id))?.getRoles(force)
	}

	/** 获取全部表情信息 */
	async getAllEmoticon(villa_id: number) {
		return this.fetchResult(villa_id, "/vila/api/bot/platform/getAllEmoticons", "get", "")
	}

	/** 提交审核，如果送审图片，需先调用转存接口，将转存后的URL填充到audit_content中 */
	async submitAudit(villa_id: number, content: string, room_id: number, uid: number, text: boolean = true, pt: string = "") {
		if (!text) content = await this.uploadImage(content, villa_id)
		return await this.fetchResult(villa_id, "/vila/api/bot/platform/audit", "post", "", {
			audit_content: content,
			pass_through: pt,
			room_id: room_id,
			uid: uid,
			content_type: text ? "AuditContentTypeText" : "AuditContentTypeImage"
		})
	}

	/** 提交审核，并获取结果 */
	async submitAuditSync(villa_id: number, content: string, room_id: number, uid: number, text: boolean = true, pt: string = "") {
		const audit_id = (await this.submitAudit(villa_id, content, room_id, uid, text, pt))?.audit_id
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.handler.delete(audit_id)
				reject(new RobotRunTimeError(-12, `审核id：${audit_id}获取审核结果超时`))
			}, 10000)
			this.handler.set(audit_id, (result: any) => {
				clearTimeout(timer)
				this.handler.delete(audit_id)
				resolve(result)
			})
		})
	}

	/** ws退出登入，只有回调是ws才有用 */
	async logout() {
		if (this.client instanceof WsClient) {
			if (this.config.user_login) {
				this.keepUseAlive = false
				this.uClient.close()
			}
			if (!(await (this.client as WsClient).doPLogout())) {
				this.logger.warn("本地将直接关闭连接...")
				this.keepAlive = false
				this.client.close()
			}
		} else return false
		return true
	}

	/** 图片转存，只能转存有网络地址的图片，上传图片请配置mys_ck调用上传接口 */
	async transferImage(url: string, villa_id?: number) {
		if (!villa_id) throw new RobotRunTimeError(-1, '图片转存缺少参数villa_id')
		return (await this.fetchResult(villa_id, "/vila/api/bot/platform/transferImage", "post", "", {
			url: url
		})).new_url
	}

	/** 创建消息组件模板，创建成功后会返回 template_id，发送消息时，可以使用 template_id 填充 component_board */
	async createComponentTemplate(villa_id: number, components: Elem[]) {
		if (Array.isArray(components)) {
			const {panel} = await (await new Msg(this, villa_id).parse(components)).gen()
			//@ts-ignore
			components = JSON.stringify(panel)
		}
		return await this.fetchResult(villa_id, "/vila/api/bot/platform/createComponentTemplate", "post", "", {
			panel: components
		})
	}

	/** 发送消息 */
	async sendMsg(room_id: number, villa_id: number, content: Elem | Elem[], quote?: Quotable): Promise<MessageRet> {
		const {message, obj_name, panel, brief, imgMsg} = await this._convert(content, villa_id)
		if (quote) {
			message.quote = {
				quoted_message_id: quote.message_id,
				quoted_message_send_time: quote.send_time,
				original_message_id: quote.message_id,
				original_message_send_time: quote.send_time
			} as QuoteInfo
		}
		message.panel = panel
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
		if (!r) throw new RobotRunTimeError(-8, `消息发送失败：${data.message}`)
		const villa = await Villa.getInfo(this, villa_id)
		this.logger.info(`succeed to send: [Villa: ${villa?.name || "unknown"}](${villa_id})] ${brief}`)
		this.statistics.send_msg_cnt++
		if (imgMsg) this.statistics.send_img_cnt++
		return r
	}

	private async _convert(msg: Elem | Elem[], villa_id: number): Promise<{ message: MsgContentInfo, obj_name: string | undefined, panel: Panel, brief: string, imgMsg: boolean }> {
		if (!Array.isArray(msg)) msg = [msg]
		return (await new Msg(this, villa_id).parse(msg)).gen();
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
		this.logger.debug(`axios请求参数：{host: ${this.mhyHost}${path}${query}, method: ${method}, body: ${JSON.stringify(body)}}`)
		const r = data.data
		if (!r) throw new RobotRunTimeError(-7, `${path}返回错误：${data.message}`)
		this.statistics.call_api_cnt++
		return r
	}

	async uploadImage(url: string, villa_id?: number, headers?: any): Promise<string> {
		try {
			if (url.startsWith("https://") || url.startsWith("http://")) {
				if (/^https?:\/\/(webstatic.mihoyo.com)|(upload-bbs.miyoushe.com)/.test(url)) return url
				else return await this.transferImage(url, villa_id)
			}
		} catch (err) {
			this.logger.mark(`图片(${url})转存失败(${(err as Error).message || "unknown"})，将使用本地上传`)
			const tmpFile = TMP_PATH + `/${crypto.randomUUID()}-${Date.now()}`
			try {
				const body = (await axios.get(url, {
					headers: headers,
					responseType: 'stream'
				})).data as Readable
				await new Promise(resolve => {
					body.pipe(fs.createWriteStream(tmpFile))
					body.on("end", resolve)
				})
				return await this._uploadLocalImage(tmpFile, villa_id)
			} catch (e) {
				throw e
			} finally {
				fs.unlink(tmpFile, () => {})
			}
		}
		return await this._uploadLocalImage(url, villa_id)
	}

	private async _uploadLocalImage(file: string, villa_id?: number): Promise<string> {
		let url: string
		let readable = fs.createReadStream(file)
		const ext = file.match(/\.\w+$/)?.[0]?.slice(1)
		try {
			url = await this._uploadImageApi(readable, ext, villa_id)
		} catch (e: any) {
			this.logger.error(`官方上传接口调用失败 reason: ${e.message || "unknown"}`)
			this.logger.mark('将使用米游社上传接口，请确定已配置mys_ck')
			if (!readable.closed) readable.close(() => {})
			readable = fs.createReadStream(file)
			url = await this._uploadImageWithCk(readable, ext)
		} finally {
			if (!readable.closed) readable.close(() => {})
		}
		return url
	}

	private async _uploadImageWithCk(readable: stream.Readable, e: string | undefined): Promise<string> {
		if (!this.config.mys_ck) throw new RobotRunTimeError(-3, "未配置mys_ck，无法调用上传接口")
		if (!readable.readable) throw new RobotRunTimeError(-1, "The first argument is not readable stream")
		/** 支持jpg,jpeg,png,gif,bmp **/
		const ext = e || 'png';
		const file = await md5Stream(readable);
		const md5 = file.md5.toString("hex");
		const {data} = await axios.post(
			`https://bbs-api.miyoushe.com/apihub/wapi/getUploadParams`, {
				biz: 'community',
				ext: ext,
				md5: md5,
				extra: {
					upload_source: "UPLOAD_SOURCE_COMMUNITY"
				},
				support_content_type: true
			}, {
				headers: {
					"cookie": this.config.mys_ck
				}
			})
		if (!data.data) throw new RobotRunTimeError(-3, data.message)
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
		const result = (await axios.post(param.params.host, form, {
			headers: {...form.getHeaders(), "Connection": 'Keep-Alive', "Accept-Encoding": "gzip"}
		})).data
		if (!result.data) throw new RobotRunTimeError(-3, result.message)
		return result.data.url
	}

	private async _uploadImageApi(readable: stream.Readable, e: string | undefined, villa_id?: number): Promise<string> {
		if (!villa_id) throw new RobotRunTimeError(-1, '上传图片缺少参数villa_id')
		if (!readable.readable) throw new RobotRunTimeError(-1, "The first argument is not readable stream")
		const path = "/vila/api/bot/platform/getUploadImageParams"
		const ext = e || 'png';
		const file = await md5Stream(readable);
		const md5 = file.md5.toString("hex");
		const {params} = await this.fetchResult(villa_id, path, "get", `?md5=${md5}&ext=${ext}`)
		if (!params) throw new RobotRunTimeError(-9, "上传图片获取参数失败")
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
		const result = (await axios.post(params.host, form, {
			headers: {
				...form.getHeaders()
			}
		})).data
		if (!result.data) throw new RobotRunTimeError(-9, result.message)
		return result.data.url
	}
}

/** 创建一个服务 */
export function createBot(props: Config) {
	return new Bot(props)
}