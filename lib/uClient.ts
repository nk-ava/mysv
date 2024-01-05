import EventEmitter from "node:events";
import * as log4js from "log4js"
import fs from "fs";
import {BUF0, getClientHeaders, getDbyHeaders, getMysCk, lock, TMP_PATH, uploadImageWithCk, ZO} from "./common";
import * as pb from "./core/protobuf";
import Parser from "./parser";
import {Device, genShortDevice, getRequestAndMessageParams, Message, Network, Writer} from "./core";
import crypto from "crypto";
import axios from "axios";
import {Readable} from "node:stream";
import {Elem, Forward, Msg, Quotable, QuoteInfo} from "./message";
import {uVilla, uVillaInfo} from "./core/uVilla";

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
	"qryMsgChange" = 0x52,
	"modifyMsg" = 0x52
}

type CMD =
	"qryMsg" | "pullSeAtts" | "pullUS" | "reportsdk" | "pullMsg" | "pullUgMsg"
	| "ppMsgP" | "qryRelationR" | "pullUgSes" | "ugMsg" | "qryMsgChange" | "modifyMsg"

export type LogLevel = 'all' | 'mark' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'off'

export interface UClient {
	/** 服务启动成功 */
	on(name: 'online', listener: (this: this) => void): this

	on(name: "message.villa", listener: (this: this, e: Message) => void): this

	on(name: "message.private", listener: (this: this, e: Message) => void): this

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
	readonly vl = new Map<number, uVillaInfo>()
	readonly sig = {
		seq: 1,
		timestamp_pullUgMsg: 0,
		timestamp_lastSend: Date.now(),
		timestamp_pullMsg: Date.now()
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
		getMysCk.call(this, (ck: string | boolean) => {
			if (!ck) throw new UClientRunTimeError(-3, "cookie获取失败")
			if (typeof ck === "string") {
				this.config.mys_ck = ck
				fs.writeFile(`${this.config.data_dir}/cookie`, ck, () => {})
			}
			this.newUClient().then()
		}).then()

		lock(this, "config")
		lock(this, "sig")
		lock(this, "trace")
		lock(this, "device")
		lock(this, "vl")
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

	/** 刷新加入的别野 */
	async refreshVillaList() {
		const {data} = await axios.get("https://bbs-api.miyoushe.com/vila/wapi/home/list", {
			headers: getDbyHeaders.call(this)
		})
		if (data.retcode !== 0) throw new UClientRunTimeError(data.retcode, `获取大别野信息失败, reason: ${data.message}`)
		const list = data.data.villa_home_list
		this.vl.clear()
		for (let villa_home of list) {
			const villa = villa_home.villa_info
			villa.villa_id = Number(villa.villa_id)
			this.vl.set(villa.villa_id, {
				villa_id: villa.villa_id,
				name: villa.name,
				villa_avatar_url: villa.villa_avatar_url,
				owner_uid: Number(villa.owner_uid),
				is_official: villa.is_official,
				introduce: villa.introduce,
				category_id: villa.category_id,
				tags: villa.tags,
				outer_id: villa.outer_id,
				villa_created_at: Number(villa.villa_created_at),
			} as uVillaInfo)
		}
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
			await this.refreshVillaList()
			this[NET] = await Network.new(this, this.uid, this.device.config)
			this[NET].on("close", async (code, reason) => {
				this.clear()
				if (!this.keepAlive) return
				this.logger.error(`uclient连接已断开，reason ${reason.toString() || 'unknown'}(${code})，5秒后将自动重连...`)
				setTimeout(async () => {
					await this.newUClient()
				}, 5000)
			})
			this[NET].on("open", async () => {
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
			this[NET].on("message", async (data) => {
				await this.packetListener(data as Buffer)
			})
		} catch (err) {
			if ((err as Error).message.includes("not login")) {
				this.logger.error("mys_ck已失效，请重新删除cookie后重新登入")
				fs.unlink(`${this.config.data_dir}/cookie`, () => {})
				return
			}
			if ((err as Error).message.includes("账号不一致") || (err as Error).message.includes("获取大别野信息失败")) {
				this.logger.error((err as Error).message)
				return
			}
			this.logger.error(`${(err as Error).message || "uclient建立连接失败"}, 5秒后将自动重连...`)
			setTimeout(async () => {
				await this.newUClient()
			}, 5000)
		}
	}

	async getMsg(villa_id: number, room_id: number, quote: Quotable) {
		const body = {
			1: String(villa_id),
			2: 10,
			3: {
				1: quote.send_time,
				2: quote.message_id,
				3: String(room_id)
			}
		}
		const {pkt, seq} = this.buildPkt(pb.encode(body), "qryMsg", this.uid)
		let payload = (await this[FN_SEND](pkt, seq))?.[1]
		if (!payload) return
		return new Parser(this).doPtParse(payload, true)
	}

	async sendMsg(villa_id: number, room_id: number, elem: Elem | Elem[], quote?: Quotable): Promise<{ msgId: string }> {
		if (!Array.isArray(elem)) elem = [elem]
		const {message, obj_name, brief, panel} = (await (new Msg(this, villa_id)).parse(elem)).gen()
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
		const villa = uVilla.get(this, villa_id) as uVilla // 获取别野信息
		if (id) this.logger.info(`succeed to send: [Villa: ${villa.info?.name || "unknown"}(${villa_id})] ${brief}`)
		return {
			msgId: id
		}
	}

	/** 退出大别野 */
	async exitVilla(villa_id: number) {
		await this.fetchHttp("https://bbs-api.miyoushe.com/vila/wapi/villa/member/exit", "post", {
			villa_id: String(villa_id)
		})
		const villa = this.vl.get(Number(villa_id))
		this.vl.delete(Number(villa_id))
		this.logger.mark(`已退出大别野 ${villa?.name || "unknown"}(${villa_id})`)
	}

	/** 加入大别野 */
	async joinVilla(villa_id: number, reason: string = "") {
		const {villa_full_info} = await this.fetchHttp(`https://bbs-api.miyoushe.com/vila/wapi/villa/v2/getVillaFull?villa_id=${villa_id}`, "get")
		await this.fetchHttp("https://bbs-api.miyoushe.com/vila/wapi/villa/join/apply", "post", {
			villa_id: String(villa_id),
			reason: reason
		})
		this.logger.mark(`提交加入别野 (${villa_id}) 申请成功`)
		if (villa_full_info.join_type === "JoinTypeAllowAny") {
			await this.refreshVillaList()
			const villa = this.vl.get(Number(villa_id))
			this.logger.mark(`新加入别野 ${villa?.name || "unknown"}(${villa_id})`)
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
		const {pkt, seq} = this.buildPkt(pb.encode(body), "ppMsgP", uid)
		const id = await this[FN_SEND](pkt, seq)
		if (id) this.logger.info(`succeed to send: [Private: (${uid})] ${brief}`)
		return {
			msgId: id
		}
	}

	/**
	 * required string fromUserId = 1;//（谁发的）
	 * required string targetId = 2;// 目标Id(超级群Id)
	 * required ChannelType type = 3;//发送类型如：（P2P,GROUP,ULTRAGROUP）
	 * required string msgUID = 4; // 扩展消息的内容体
	 * required int64 msgTime = 5; //原始消息时间
	 * optional string busChannel = 6; // 该消息所属会话的业务标识，限制20字符以内
	 * optional string content = 7; // 即extraContent消息扩展内容,下表格说明
	 *
	 * enum ChannelType {
	 * 		PERSON = 1;
	 * 		PERSONS = 2;
	 * 		GROUP = 3;
	 * 		TEMPGROUP = 4;
	 * 		CUSTOMERSERVICE = 5;
	 * 		NOTIFY = 6;
	 * 		MC=7;
	 * 		MP=8;
	 * 		ULTRAGROUP = 10;
	 * }
	 */
	async modifyMsg(villa_id: number, room_id: number, content: Elem | Elem[], quote: Quotable) {
		if (!Array.isArray(content)) content = [content]
		const {message} = (await new Msg(this, villa_id).parse(content)).gen()
		const body = {
			1: String(this.uid),
			2: String(villa_id),
			3: 10,
			4: quote.message_id,
			5: quote.send_time,
			6: String(room_id),
			7: JSON.stringify(message)
		}
		const {seq, pkt} = this.buildPkt(pb.encode(body), "modifyMsg", villa_id)
		const payload = await this[FN_SEND](pkt, seq)
		return payload[1] === 0
	}

	async getForwardMsg(id: number, villa_id: number) {
		const {data} = await axios.get(`https://bbs-api.miyoushe.com/vila/api/forwardMsgGetDetails?id=${id}&view_villa_id=${villa_id}`, {
			headers: getClientHeaders.call(this)
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

	async makeForwardMsg(content: string[], villa_id: string | number, room_id: string | number): Promise<string | number> {
		const {data} = await axios.post("https://bbs-api.miyoushe.com/vila/api/forwardMsgCreate", {
			msg_uid_list: content,
			room_id: String(room_id),
			villa_id: String(villa_id)
		}, {
			headers: getClientHeaders.call(this)
		})
		if (data.retcode !== 0) throw new UClientRunTimeError(data.retcode, `制作转发消息失败，reason：${data.message || "unknown"}`)
		return Number(data.data.id) || data.data.id
	}

	async recallMsg(villa_id: number | string, room_id: number | string, msg: Quotable) {
		const {data} = await axios.post("https://bbs-api.miyoushe.com/vila/wapi/chat/recall/message", {
			channelId: String(room_id),
			msg_uid: msg.message_id,
			room_id: String(room_id),
			send_time: msg.send_time,
			targetId: String(villa_id),
			villa_id: String(villa_id)
		}, {
			headers: {
				"Cookie": this.config.mys_ck,
				"Origin": "https://dby.miyoushe.com",
				"Referer": "https://dby.miyoushe.com/",
				'x-rpc-client_type': 4,
				"x-rpc-device_fp": this.device.device_fp,
				"x-rpc-device_id": this.device.device_fp
			}
		})
		if (data.retcode !== 0) throw new UClientRunTimeError(data.retcode, `撤回消息失败, reason ${data.message || "unknown"}`)
	}

	async sendForwardMsg(villa_id: number, room_id: number, msg: Message[]) {
		const msg_uid: string[] = []
		const summary: {
			uid?: string | number
			nickname: string
			content: string
		}[] = []
		let rid!: number | string, vid!: number | string, vname!: string, rname!: string, t: any
		msg.forEach(m => {
			!rid && (rid = m?.source?.room_id)
			!rname && (rname = m?.source?.room_name)
			!vid && (vid = m?.source?.villa_id)
			!vname && (vname = m?.source?.villa_name)
			msg_uid.push(m.msg_id)
			t = {
				nickname: m.nickname,
				content: m.msg
			}
			m.from_uid && (t.uid = m.from_uid)
			summary.push(t)
		})
		const id = await this.makeForwardMsg(msg_uid, vid || villa_id, rid || room_id)
		const forward = {
			type: 'forward',
			id: id,
			rname: rname,
			vname: vname,
			summary: summary.slice(0, 4)
		} as Forward
		rid && (forward.rid = rid)
		vid && (forward.vid = vid)
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

	private [FN_SEND](pkt: Buffer, seq: number): Promise<any> {
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
		const param = {
			_retain: (1 & t) > 0,
			qos: (6 & t) >> 1,
			_dup: (8 & t) > 0,
			syncMsg: (8 & t) == 8
		}
		switch (type) {
			case 0x2: //CONN_ACK
				const seq = buf.readUint16BE(1)
				this.sig.seq = seq + 1
				await this.sendInitPkt()
				break
			case 0x6: //QUERY_ACK
				this.listener0x6(buf.slice(1), param)
				break
			case 0x3: //PUBLISH
				await this.listener0x3(buf.slice(1), param)
				break
			case 0x4: //PUB_ACK
				this.listener0x4(buf.slice(1), param)
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
		// 发送pullMsg
		await this._fnPullMsg()
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

	private listener0x6(buf: Buffer, param: any) {
		const seq = buf.readUint16BE()
		const time = buf.readUint32BE(2)
		const status = buf.readUint16BE(6)
		let body = pb.deepDecode(buf.slice(8), {
			1: {
				1: "string", 3: "string", 4: "string", 5: "string", 9: "string",
				13: "string", 15: "string", 16: "string", 18: {
					1: "string"
				}, 19: "string"
			}
		})
		if (param.qos === 1) this[NET].send(Buffer.concat([Buffer.from([0x70]), buf.slice(0, 2)]))
		if (!this[HANDLER].has(seq)) return
		this[HANDLER].get(seq)?.(body)
	}

	private async listener0x3(buf: Buffer, param: any) {
		const time = buf.readUint32BE()
		const cmdL = buf.readUint16BE(4)
		const cmd = buf.slice(6, 6 + cmdL).toString()
		const oL = buf.readUint16BE(6 + cmdL)
		const o = buf.slice(8 + cmdL, 8 + cmdL + oL).toString()
		const seq = buf.slice(8 + cmdL + oL, 10 + cmdL + oL)
		let body: any = buf.slice(10 + cmdL + oL)
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
							const msg = await new Parser(this).doPtParse(pkt)
							if (!msg) continue
							this.logger.info(`recv from: [Villa: ${msg?.source?.villa_name || "unknown"}(${msg?.source?.villa_id}), Member: ${msg?.nickname}(${msg?.from_uid})] ${msg?.msg}`)
							this.em('message.villa', msg)
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
				body = pb.deepDecode(body, {
					1: "string", 3: "string", 4: "string", 5: "string", 9: "string",
					13: "string", 15: "string", 16: "string", 18: {
						1: "string"
					}, 19: "string"
				})
				const msg = await new Parser(this).doPtParse(body)
				this.sig.timestamp_pullMsg = Math.max(msg?.send_time || 0, this.sig.timestamp_pullMsg)
				this[NET].send(Buffer.concat([Buffer.from([0x40]), seq]))
				if (!msg) return
				this.logger.info(`recv from: [Private: ${msg?.nickname || "unknown"}(${msg?.from_uid})发来一条私信] ${msg?.msg}`)
				this.em("message.private", msg)
				break
			case "s_ntf":
				if (seq.readUint16BE() % 2 == 0) return
				var payload = await this._fnPullMsg()
				if (!payload?.[1]) return
				payload = payload[1]
				if (!Array.isArray(payload)) payload = [payload]
				for (let pkt of payload) {
					const msg = await new Parser(this).doPtParse(pkt)
					if (!msg) continue
					this.logger.info(`recv from: [Private: ${msg?.nickname || "unknown"}(${msg?.from_uid})发来一条私信] ${msg?.msg}`)
					this.em('message.private', msg)
				}
				break
		}
	}

	private listener0x4(buf: Buffer, param: any) {
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

	private async _fn() {
		const {pkt, seq} = this.buildPkt(pb.encode({
			1: this.sig.timestamp_pullUgMsg
		}), "pullUgMsg", this.uid)
		const payload: any = await this[FN_SEND](pkt, seq)
		this.sig.timestamp_pullUgMsg = Math.max(payload[2], this.sig.timestamp_pullUgMsg)
		return payload
	}

	private async _fnPullMsg() {
		const {pkt, seq} = this.buildPkt(pb.encode({
			1: this.sig.timestamp_pullMsg,
			2: 0,
			4: 1,
			6: this.sig.timestamp_pullMsg,
			7: 1
		}), "pullMsg", this.uid)
		const payload: any = await this[FN_SEND](pkt, seq)
		this.sig.timestamp_pullMsg = Math.max(this.sig.timestamp_pullMsg, payload[2])
		return payload
	}

	logout() {
		this.keepAlive = false
		this[NET].close()
	}

	em(name: string, ...data: any) {
		while (name) {
			this.emit(name, ...data)
			let index = name.lastIndexOf(".")
			name = name.substring(0, index)
		}
	}

	async fetchHttp(url: string, method: "post" | "get", body?: any) {
		const {data} = await axios({
			method: method,
			url: url,
			data: body,
			headers: getDbyHeaders.call(this)
		})
		if (data.retcode !== 0) throw new UClientRunTimeError(data.retcode, `${url}请求失败，reason：${data.message || "unknown"}`)
		return data.data
	}
}

export function createUClient(config: UClientConfig) {
	return new UClient(config)
}