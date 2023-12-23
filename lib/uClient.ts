import EventEmitter from "node:events";
import * as log4js from "log4js"
import fs from "fs";
import {BUF0, getMysCk, lock, TMP_PATH, uploadImageWithCk, ZO} from "./common";
import * as pb from "./core/protobuf";
import Parser from "./parser";
import {Device, genShortDevice, getRequestAndMessageParams, Message, Network, Writer} from "./core";
import crypto from "crypto";
import axios from "axios";
import {Readable} from "node:stream";
import {Elem, Forward, Msg, Quotable, QuoteInfo} from "./message";

const pkg = require("../package.json")

export class UClientRunTimeError {
	constructor(public code: number, public message: string = "unknown") {
		this.code = code
		this.message = message
	}
}

export interface UClientConfig {
	/** 米游社cookie,可手动配置也可扫码获取 */
	mys_ck?: string
	/** 登入账号的uid */
	uid: number
	/** 数据储存路径 */
	data_dir?: string
	/** 日志级别 */
	log_level?: LogLevel
	/** 忽略自己的消息 */
	ignore_self?: boolean
	/** 登入账号，手机号或者邮箱 */
	account?: string | number
	/** 密码 */
	password?: string
}

enum CMD_NUMBER {
	"qryMsg" = 0x52,
	"pullSeAtts" = 0x50,
	"pullUS" = 0x50,
	"reportsdk" = 0x50,
	"pullMsg" = 0x50,
	"pullUgMsg" = 0x50,
	"ppMsgP" = 0x32,
	"qryRelationR" = 0x50,
	"pullUgSes" = 0x50,
	"ugMsg" = 0x32,
	"qryMsgChange" = 0x52
}

type CMD =
	"qryMsg" | "pullSeAtts" | "pullUS" | "reportsdk" | "pullMsg" | "pullUgMsg"
	| "ppMsgP" | "qryRelationR" | "pullUgSes" | "ugMsg" | "qryMsgChange"

export type LogLevel = 'all' | 'mark' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'off'

export interface UClient {
	/** 服务启动成功 */
	on(name: 'online', listener: (this: this) => void): this

	on(name: "message", listener: (this: this, e: Message) => void): this

	on(name: string, listener: (this: this, ...args: any[]) => void): this
}

const NET = Symbol("NET")
const INTERVAL = Symbol("INTERVAL")
const FN_SEND = Symbol("FN_SEND")
const HANDLER = Symbol("HANDLER")
const HEARTBEAT = Symbol("HEARTBEAT")
const INTERVAL_PULL_UG_MSG = Symbol("INTERVAL_PULL_UG_MSG")

export class UClient extends EventEmitter {
	private keepAlive: boolean
	private [NET]!: Network
	private [INTERVAL]!: NodeJS.Timeout
	private [HANDLER]: Map<number, Function>
	private [HEARTBEAT]!: NodeJS.Timeout | number
	private readonly trace: any
	private [INTERVAL_PULL_UG_MSG]!: NodeJS.Timeout
	readonly logger: log4js.Logger
	readonly uid: number
	readonly config: UClientConfig
	readonly device: Device
	readonly sig = {
		seq: 1,
		timestamp_pullUgMsg: 0,
		timestamp_lastSend: Date.now()
	}

	constructor(config: UClientConfig) {
		super()
		this.config = {
			log_level: "info",
			ignore_self: true,
			...config
		}
		if (!this.config.uid) throw new UClientRunTimeError(-1, "未配置uid，请配置后重启")
		this.uid = this.config.uid
		if (!fs.existsSync("./data")) fs.mkdirSync("./data")
		if (!this.config.data_dir) this.config.data_dir = `./data/${this.config.uid}`
		if (!fs.existsSync(this.config.data_dir)) fs.mkdirSync(this.config.data_dir)
		if (!fs.existsSync(`${this.config.data_dir}/device.json`)) this.device = genShortDevice()
		else this.device = JSON.parse(fs.readFileSync(`${this.config.data_dir}/device.json`, "utf-8"))
		this.trace = {
			report: {
				challenge: "",
				...getRequestAndMessageParams.call(this)
			}
		}
		this.keepAlive = true
		this[HANDLER] = new Map
		this.logger = log4js.getLogger(`[${this.uid}]`)
		this.logger.level = this.config.log_level as LogLevel
		this.printPkgInfo()
		if (!this.config.mys_ck) getMysCk.call(this, (ck: string) => {
			if (!ck) throw new UClientRunTimeError(-3, "cookie获取失败")
			this.config.mys_ck = ck
			fs.writeFileSync(`${this.config.data_dir}/cookie`, ck)
			this.newUClient().then()
		}).then()
		else this.newUClient().then()

		lock(this, "config")
		lock(this, "sig")
		lock(this, "trace")
		lock(this, "device")
	}

	get interval() {
		return this[INTERVAL]
	}

	set interval(i: NodeJS.Timeout) {
		this[INTERVAL] = i
	}

	setKeepAlive(s: boolean) {
		this.keepAlive = s
	}

	/** 输出包信息 */
	private printPkgInfo() {
		this.logger.mark("---------------")
		this.logger.mark(`Package Version: ${pkg.name}@${pkg.version} (Released on ${pkg.update})`)
		this.logger.mark(`Repository Url: ${pkg.repository}`)
		this.logger.mark("---------------")
	}

	private async newUClient() {
		try {
			this[NET] = await Network.new(this, this.uid, this.device.config)
			this[NET].on("close", async (code, reason) => {
				this.clear()
				if (!this.keepAlive) return
				this.logger.error(`uclient连接已断开，reason ${reason.toString() || 'unknown'}(${code})，5秒后将自动重连...`)
				setTimeout(async () => {
					await this.newUClient()
				}, 5000)
			})
			this[NET].on("open", () => {
				this.logger.info(`建立连接成功，ws地址：${this[NET].remote}`)
				this[HEARTBEAT] = setInterval((function heartbeat(this: UClient): Function {
					this[NET].send(Buffer.from("c0", 'hex'), () => {
						this.logger.debug(`心跳包发送成功`)
					})
					return heartbeat.bind(this) as Function
				}).call(this), 15000)
				this[INTERVAL_PULL_UG_MSG] = setInterval(() => {
					if (Date.now() - this.sig.timestamp_lastSend >= 180000)
						this._fn().then()
				}, 60000)
			})
			this[NET].on("message", (data) => {
				this.packetListener(data as Buffer)
			})
		} catch (err) {
			if ((err as Error).message.includes("not login")) {
				this.logger.error("mys_ck已失效，请重新删除cookie后扫码登入")
				fs.unlinkSync(`${this.config.data_dir}/cookie`)
				return
			}
			if ((err as Error).message.includes("账号不一致")) {
				this.logger.error((err as Error).message)
				return
			}
			this.logger.error(`${(err as Error).message || "uclient建立连接失败"}, 5秒后将自动重连...`)
			setTimeout(async () => {
				await this.newUClient()
			}, 5000)
		}
	}

	async getMsg(msgId: string, time: number, villa_id: number, room_id: number) {
		const body = {
			1: String(villa_id),
			2: 10,
			3: {
				1: time,
				2: msgId,
				3: String(room_id)
			}
		}
		const {pkt, seq} = this.buildPkt(pb.encode(body), "qryMsg", this.uid)
		let payload = (await this[FN_SEND](pkt, seq))?.[1]
		if (!payload) return
		return new Parser(this).doPtParse(payload)
	}

	async sendMsg(villa_id: number, room_id: number, elem: Elem | Elem[], quote?: Quotable): Promise<{ msgId: string }> {
		if (!Array.isArray(elem)) elem = [elem]
		const {message, obj_name, brief, panel} = await (await (new Msg(this, villa_id)).parse(elem)).gen()
		message.trace = this.trace
		message.panel = panel
		if (quote) message.quote = {
			original_message_send_time: quote.send_time,
			original_message_id: quote.message_id,
			quoted_message_send_time: quote.send_time,
			quoted_message_id: quote.message_id
		} as QuoteInfo
		this.logger.debug("message:", message, "obj_name:", obj_name)
		const body = {
			1: 67,
			2: obj_name,
			3: JSON.stringify(message),
			9: 0,
			10: ZO(),
			13: String(room_id)
		}
		const {pkt, seq} = this.buildPkt(pb.encode(body), "ugMsg", villa_id)
		const id = await this[FN_SEND](pkt, seq)
		const villa: any = {} // 获取别野信息
		if (id) this.logger.info(`succeed to send: [Villa: ${villa?.name || "unknown"}](${villa_id})] ${brief}`)
		return {
			msgId: id
		}
	}

	async sendPrivateMsg(uid: number | string, content: Elem | Elem[], quote?: Quotable): Promise<{ msgId: string }> {
		if (!Array.isArray(content)) content = [content]
		const {message, obj_name, brief, panel} = await (await (new Msg(this, 0)).parse(content)).gen()
		message.trace = this.trace
		message.panel = panel
		if (quote) message.quote = {
			original_message_send_time: quote.send_time,
			original_message_id: quote.message_id,
			quoted_message_send_time: quote.send_time,
			quoted_message_id: quote.message_id
		} as QuoteInfo
		this.logger.debug("message:", message, "obj_name:", obj_name)
		const body = {
			1: 67,
			2: obj_name,
			3: JSON.stringify(message),
			9: 0,
			10: ZO(),
			13: ""
		}
		const {pkt, seq} = this.buildPkt(pb.encode(body), "ugMsg", uid)
		const id = await this[FN_SEND](pkt, seq)
		const villa: any = {} // 获取别野信息
		if (id) this.logger.info(`succeed to send: [Private: (${uid})] ${brief}`)
		return {
			msgId: id
		}
	}

	async getForwardMsg(id: number, villa_id: number) {
		const {data} = await axios.get(`https://bbs-api.miyoushe.com/vila/api/forwardMsgGetDetails?id=${id}&view_villa_id=${villa_id}`, {
			headers: this.getHeaders()
		})
		if (data.retcode !== 0) throw new UClientRunTimeError(data.retcode, `获取转发消息失败，reason ${data.message || "unknown"}`)
		const info = data.data.info
		const elem = []
		for (let msg of info.msg_content_list || []) {
			msg = JSON.parse(msg, (k, v) => {
				let vv
				try {
					vv = JSON.parse(v)
				} catch {
					return v
				}
				return vv
			})
			elem.push(new Parser(this).doForwardParse(msg.msg_content))
		}
		return elem
	}

	async makeForwardMsg(content: string[], villa_id: number, room_id: number): Promise<string | number> {
		const {data} = await axios.post("https://bbs-api.miyoushe.com/vila/api/forwardMsgCreate", {
			msg_uid_list: content,
			room_id: String(room_id),
			villa_id: String(villa_id)
		}, {
			headers: this.getHeaders()
		})
		if (data.retcode !== 0) throw new UClientRunTimeError(data.retcode, `制作转发消息失败，reason：${data.message || "unknown"}`)
		return Number(data.data.id) || data.data.id
	}

	async recallMsg(villa_id: number, room_id: number, msg: Quotable) {
		const {data} = await axios.post("https://bbs-api.miyoushe.com/vila/wapi/chat/recall/message", {
			channelId: String(room_id),
			msg_uid: msg.message_id,
			room_id: String(room_id),
			send_time: msg.send_time,
			targetId: String(villa_id),
			villa_id: String(villa_id)
		}, {
			headers: this.getHeaders()
		})
		if (data.retcode !== 0) throw new UClientRunTimeError(data.retcode, `撤回消息失败, reason ${data.message || "unknown"}`)
	}

	async sendForwardMsg(villa_id: number, room_id: number, msg: Message[]) {
		const msg_uid: string[] = []
		const summary: {
			uid: string | number
			nickname: string
			content: string
		}[] = []
		let rid!: number | string, vid!: number | string, vname: string = "", rname: string = ""
		msg.forEach(m => {
			!rid && (rid = m?.source?.room_id)
			!rname && (rname = m?.source?.room_name)
			!vid && (vid = m?.source?.villa_id)
			!vname && (vname = m?.source?.villa_name)
			msg_uid.push(m.msg_id)
			summary.push({
				uid: m.from_uid,
				nickname: m.nickname,
				content: m.msg
			})
		})
		const id = await this.makeForwardMsg(msg_uid, villa_id, room_id)
		const forward = {
			type: 'forward',
			id: id,
			room_name: rname,
			villa_name: vname,
			summary: summary
		} as Forward
		rid && (forward.room_id = rid)
		vid && (forward.villa_id = vid)
		return await this.sendMsg(villa_id, room_id, forward)
	}

	private buildPkt(body: Uint8Array | Buffer, cmd: CMD, id: string | number) {
		const seq = this.sig.seq & 0xffff
		this.sig.seq++
		const writer = new Writer().writeU8(CMD_NUMBER[cmd])
			.writeWithU16Length(cmd)
			.writeWithU16Length(String(id))
			.writeU16BE(seq)
			.writeBytes(body)
		return {pkt: writer.read(), seq}
	}

	private async [FN_SEND](pkt: Buffer, seq: number): Promise<any> {
		return new Promise((resolve, reject) => {
			this[NET].sent(pkt, (err) => {
				if (err) reject(new UClientRunTimeError(-1, `数据包发送失败 seq: ${seq}, reason: ${err.message}`))
				const timer = setTimeout(() => {
					this[HANDLER].delete(seq)
					reject(new UClientRunTimeError(-1, `数据包接收超时 seq: ${seq}`))
				}, 5000)
				this[HANDLER].set(seq, (r: any) => {
					clearTimeout(timer)
					this[HANDLER].delete(seq)
					resolve(r)
				})
			})
		})
	}

	private async packetListener(buf: Buffer) {
		const t = buf.readUint8()
		const type = t >> 4 & 15
		switch (type) {
			case 0x2: //CONN_ACK
				const seq = buf.readUint16BE(1)
				this.sig.seq = seq + 1
				await this.sendInitPkt()
				break
			case 0x6: //QUERY_ACK
				this.listener0x6(buf.slice(1))
				break
			case 0x3: //PUBLISH
				await this.listener0x3(buf.slice(1))
				break
			case 0x4: //PUB_ACK
				this.listener0x4(buf.slice(1))
				break
			case 0x9: //SUB_ACK
			case 0xb: //UNSUB_ACK
			case 0xd: //PING_RESP
				break
			case 0xe: //DISCONNECT
				break
		}
	}

	private async sendInitPkt() {
		this[NET].sent(this.buildPkt(pb.encode({
			1: 0
		}), "pullSeAtts", this.uid).pkt)
		this[NET].sent(this.buildPkt(pb.encode({
			1: Date.now()
		}), "pullUS", this.uid).pkt)
		this[NET].sent(this.buildPkt(pb.encode({
			1: Date.now(),
			2: 0,
			4: 1,
			6: Date.now(),
			7: 1
		}), "pullMsg", this.uid).pkt)
		// 发送pullUgMsg
		await this._fn()
		this[NET].sent(this.buildPkt(pb.encode({
			1: 1,
			2: 100,
			3: 0,
			4: 0
		}), "qryRelationR", this.uid).pkt)
		this[NET].sent(this.buildPkt(pb.encode({
			1: `{"engine":"5.9.0","imlib-next":"5.9.0"}`
		}), "reportsdk", this.uid).pkt)
		this[NET].sent(this.buildPkt(pb.encode({
			1: 0,
			2: "RC:SRSMsg",
			3: `{"lastMessageSendTime":${Date.now()}}`,
			6: String(this.uid),
			9: 0,
			10: ZO(),
			13: BUF0
		}), "ppMsgP", "SIG").pkt)
		this[NET].sent(this.buildPkt(pb.encode({
			1: 0,
			2: 0
		}), "pullUgSes", this.uid).pkt)
		this.emit("online")
	}

	private listener0x6(buf: Buffer) {
		const seq = buf.readUint16BE()
		const time = buf.readUint32BE(2)
		const status = buf.readUint16BE(6)
		let body: any = buf.slice(8)
		if (!this[HANDLER].has(seq)) return
		body = pb.deepDecode(body, {
			1: {
				1: "string", 3: "string", 4: "string", 5: "string", 9: "string",
				13: "string", 15: "string", 16: "string", 18: {
					1: "string"
				}, 19: "string"
			}
		})
		this[HANDLER].get(seq)?.(body)
	}

	private async listener0x3(buf: Buffer) {
		const time = buf.readUint32BE()
		const cmdL = buf.readUint16BE(4)
		const cmd = buf.slice(6, 6 + cmdL).toString()
		const uL = buf.readUint16BE(6 + cmdL)
		const from_uid = buf.slice(8 + cmdL, 8 + cmdL + uL).toString()
		const seq = buf.slice(8 + cmdL + uL, 10 + cmdL + uL)
		let body: any = buf.slice(10 + cmdL + uL)
		switch (cmd) {
			case "s_cmd":
				body = pb.decode(body)
				switch (body[1]) {
					case 0x06:
						var payload = await this._fn()
						if (!payload[1]) return
						payload = payload[1]
						!Array.isArray(payload) && (payload = [payload])
						for (let pkt of payload) {
							if (Number(pkt[1]) === this.uid && this.config.ignore_self) continue
							new Parser(this).doPtParse(pkt)
						}
						break
					case 0x07:
						// 发送qryMsgChange
						// var {pkt, seq} = this.buildPkt(pb.encode({
						// 	1: 0
						// }), "qryMsgChange", this.uid)
						// var payload = await this[FN_SEND](pkt, seq)
						break
				}
				break
			case "s_msg":
				console.log(body)
				body = pb.deepDecode(body, {
					1: "string", 3: "string", 4: "string", 5: "string", 9: "string",
					13: "string", 15: "string", 16: "string", 18: {
						1: "string"
					}, 19: "string"
				})
				new Parser(this).doPtParse(body)
				this[NET].send(Buffer.concat([Buffer.from([0x40]), seq]))
				break
			case "s_ntf":
				console.log(body)

				break
		}
	}

	private listener0x4(buf: Buffer) {
		const seq = buf.readUint16BE()
		const date = buf.readUint32BE(2)
		const status = buf.readUint16BE(6)
		const millisecond = buf.readUint16BE(8)
		const timestamp = 1e3 * date + millisecond
		const msgIdL = buf.readUint16BE(10)
		if (!this[HANDLER].has(seq)) return
		this[HANDLER].get(seq)?.(buf.slice(12, 12 + msgIdL)?.toString() || "")
	}

	private clear() {
		clearInterval(this[HEARTBEAT])
		clearInterval(this[INTERVAL_PULL_UG_MSG])
		clearInterval(this[INTERVAL])
		this[HANDLER].clear()
	}

	async uploadImage(file: string, villa_id?: number, headers?: any) {
		if (file.startsWith("https://") || file.startsWith("http://")) {
			if (/^https?:\/\/(webstatic.mihoyo.com)|(upload-bbs.miyoushe.com)/.test(file)) return file
			else {
				const tmpFile = TMP_PATH + `/${crypto.randomUUID()}-${Date.now()}`
				try {
					const body = (await axios.get(file, {
						headers: headers,
						responseType: 'stream'
					})).data as Readable
					await new Promise(resolve => {
						body.pipe(fs.createWriteStream(tmpFile))
						body.on("end", resolve)
					})
					return await this._uploadLocalImage(tmpFile)
				} catch (e) {
					throw e
				} finally {
					fs.unlink(tmpFile, () => {})
				}
			}
		}
		return await this._uploadLocalImage(file)
	}

	private async _uploadLocalImage(file: string) {
		const readable = fs.createReadStream(file)
		const ext = file.match(/\.\w+$/)?.[0]?.slice(1)
		return await uploadImageWithCk.call(this, readable, ext)
	}

	async _fn() {
		const {pkt, seq} = this.buildPkt(pb.encode({
			1: this.sig.timestamp_pullUgMsg
		}), "pullUgMsg", this.uid)
		const payload: any = await this[FN_SEND](pkt, seq)
		this.sig.timestamp_pullUgMsg = payload[2]
		return payload
	}

	getHeaders() {
		return {
			"Accept": "application/json, text/plain, */*",
			"Accept-Encoding": "gzip, deflate, br",
			"Cookie": this.config.mys_ck,
			'Referer': 'https://app.mihoyo.com',
			'x-rpc-client_type': 2,
			"x-rpc-device_fp": this.device.bbs?.device_fp || "0000000000",
			"x-rpc-device_id": this.device.bbs?.device_id || this.device.device_fp,
		}
	}

	logout() {
		this.keepAlive = false
		this[NET].close()
	}

	em(name: string, data?: any) {
		while (name) {
			this.emit(name, data)
			let index = name.lastIndexOf(".")
			name = name.substring(0, index)
		}
	}
}

export function createUClient(config: UClientConfig) {
	return new UClient(config)
}