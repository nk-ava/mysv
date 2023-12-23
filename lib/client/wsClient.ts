import {Bot, RobotRunTimeError} from "../bot";
import WebSocket from "ws"
import * as pb from "../core/protobuf"
import {Writer} from "../core";
import PbJs, {Type} from "protobufjs"
import Parser, {Events} from "../parser";
import {lock} from "../common";
import * as Path from "path";

export interface WSInfo {
	/** Websocket 接入地址 */
	websocket_url: string
	/** Websocket 连接使用的 uid 参数 */
	uid: bigint
	/** Websocket 接入使用的 app_id 参数 */
	app_id: number
	/** Websocket 接入使用的 platform 参数 */
	platform: number
	/** Websocket 接入使用的 device_id 参数 */
	device_id: string
}

let botEventType: Type | undefined

const HANDLER = Symbol("HANDLER")
const FN_SEND = Symbol("FN_SEND")
const HEARTBEAT = Symbol("HEARTBEAT")

async function loadTypes() {
	return new Promise((resolve, reject) => {
		new PbJs.Root().load(Path.resolve(__dirname, "../core/protobuf/proto/model.proto"), {keepCase: true}, (error, root) => {
			if (error) reject(new RobotRunTimeError(-11, '加载model.proto文件出错'))
			botEventType = root?.lookupType("RobotEvent")
			resolve(undefined)
		})
	})
}

loadTypes().then()

export class WsClient extends WebSocket {
	private readonly info: WSInfo;
	private readonly c: Bot;
	private seq: bigint
	private [HANDLER]: Map<bigint, Function>
	private [HEARTBEAT]!: NodeJS.Timeout

	private constructor(c: Bot, info: WSInfo, cb: Function) {
		if (!info.websocket_url) throw new RobotRunTimeError(-10, 'ws接入信息websocket_url缺失')
		super(info.websocket_url)
		this.c = c
		this.info = info
		this.seq = 0n
		this[HANDLER] = new Map
		this.watchEvents(cb)

		lock(this, "info")
		lock(this, "c")
	}

	static async new(c: Bot, cb: Function): Promise<WsClient> {
		const info = await c.fetchResult(0, "/vila/api/bot/platform/getWebsocketInfo", "get", "")
		if (!info) throw new RobotRunTimeError(-10, "未获取到ws接入信息，请稍后重试...")
		return new WsClient(c, info, cb)
	}

	startSendHeart() {
		this[HEARTBEAT] = setInterval(async () => {
			const res = await this.sendDataSync(6, pb.encode({
				1: String(Math.floor(Date.now() / 1000))
			}))
			if (typeof res[1] !== 'undefined' && res[1] !== 0) {
				this.c.logger.warn(`心跳数据异常`)
				return
			}
			this.c.logger.debug('心跳包发送成功')
		}, 30000)
	}

	private watchEvents(cb: Function) {
		this.on("open", async () => {
			this.c.logger.info(`连接已建立，ws地址：${this.info.websocket_url}`)
			cb()
			await this.doPLogin()
		})
		this.on("message", async (buf) => {
			await this.unPackaging(buf as Buffer)
		})
		this.on("error", err => {
			this.c.logger.error(`ws报错：${err.message}`)
		})
	}

	private async doPLogin() {
		const body = {
			/** 长连接侧唯一id，uint64格式 */
			1: BigInt(this.info.uid),
			/** 用于业务后端验证的token */
			2: `${this.c.config.villa_id}.${this.c.config.secret}.${this.c.config.bot_id}`,
			/** 客户端操作平台枚举 */
			3: this.info.platform,
			/** 业务所在客户端应用标识，用于在同一个客户端隔离不同业务的长连接通道。 */
			4: this.info.app_id,
			5: this.info.device_id,
			/** 区域划分字段，通过uid+app_id+platform+region四个字段唯一确定一条长连接 */
			6: "",
			/** 长连内部的扩展字段，是个map */
			7: undefined
		}
		const payload = await this.sendDataSync(7, pb.encode(body))
		if (typeof payload[1] !== "undefined" && payload[1] !== 0) {
			this.c.setKeepAlive(false)
			this.close()
			throw new RobotRunTimeError(-11, `登入ws服务器失败，请检查villa_id是否配置正确后再重试 code: ${payload[1]}`)
		}
		this.startSendHeart()
	}

	async doPLogout() {
		const body = {
			// 长连接侧唯一id，uint64格式
			1: BigInt(this.info.uid),
			// 客户端操作平台枚举
			2: this.info.platform,
			// 业务所在客户端应用标识，用于在同一个客户端隔离不同业务的长连接通道。
			3: this.info.app_id,
			// 客户端设备唯一标识
			4: this.info.device_id
			// 区域划分字段，通过uid+app_id+platform+region四个字段唯一确定一条长连接
			// string region = 5
		}
		const payload = await this.sendDataSync(8, pb.encode(body))
		if (typeof payload[1] !== "undefined" && payload[1] !== 0) {
			this.c.logger.error(`登出ws服务器失败， code: ${payload[1]} reason: ${payload[2] || 'unknown'}`)
			return false
		}
		this.c.setKeepAlive(false)
		this.close()
		return true
	}

	private [FN_SEND](pkt: Buffer, seq: bigint) {
		return new Promise((resolve, reject) => {
			this.send(pkt, (err) => {
				if (err) reject(new RobotRunTimeError(-11, `数据包发送失败 seq: ${seq}, reason: ${err.message}`))
				this.c.stat.pkt_send_cnt++
				const timer = setTimeout(() => {
					this[HANDLER].delete(seq)
					this.c.stat.pkt_lost_cnt++
					reject(new RobotRunTimeError(-11, `数据包接收超时 seq: ${seq}`))
				}, 5000)
				this[HANDLER].set(seq, (r: any) => {
					clearTimeout(timer)
					this[HANDLER].delete(seq)
					resolve(r)
				})
			})
		})
	}

	private packaging(bizType: number, body: Buffer | Uint8Array, seq: bigint): Buffer {
		const fixed = new Writer()
			.writeU32(0xBABEFACE)  // Magic
		let dynamic = new Writer()
			.writeU32(24)       // HeaderLen
			.writeU64(seq)    // 协议包序列ID
			.writeU32(1)        // 1代表主动发到服务端的request包,2代表针对某个request包回应的response包
			.writeU32(bizType)
			.writeU32(104)      // 应用标识。固定为 104
			.writeBytes(body)       // bodyData
			.read()
		fixed.writeWithLength(dynamic)
		return fixed.read()
	}

	async sendDataSync(bizType: number, body: Buffer | Uint8Array): Promise<any> {
		const seq = this.seq
		this.seq += 1n
		const pkt = this.packaging(bizType, body, seq)
		return await this[FN_SEND](pkt, seq)
	}

	private async unPackaging(pkt: Buffer) {
		const magic = pkt.readUint32LE()
		const dynamicLen = pkt.readUint32LE(4)
		const seq = pkt.readBigUint64LE(12)
		const bizType = pkt.readUint32LE(24)
		const appId = pkt.readUint32LE(28)
		if (magic !== 0xBABEFACE || appId !== 104 || dynamicLen + 8 !== pkt.length) return
		let body: Buffer = pkt.slice(32)
		let data: pb.Proto
		try {
			data = pb.decode(body)
		} catch {
			//@ts-ignore
			this.c.logger.debug(`数据包pb解码失败，bizType: ${bizType}, body: ${body?.toString("hex") || "null"}`)
			return
		}
		if (this[HANDLER].has(seq)) {
			this[HANDLER].get(seq)?.(data)
			return
		}
		switch (bizType) {
			case 53:
				this.c.logger.error(`当前设备已被踢下线, code: ${data[1] || 0}, reason: ${data[2]?.toString() || 'unknown'}`)
				this.c.setKeepAlive(false)
				this.close()
				break
			case 52:
				this.c.logger.warn('当前连接的服务端即将关机...')
				this.close()
				break
			case 30001:
				await this.handlerEvents(body)
				break
		}
	}

	destroy() {
		clearInterval(this[HEARTBEAT])
		this[HANDLER].clear()
	}

	async handlerEvents(data: any) {
		if (!botEventType) {
			this.c.logger.error("未加载model.proto文件，正在加载...")
			await loadTypes()
		}
		if (!botEventType) {
			this.c.logger.error("model.proto文件加载未成功，请更换回调方式")
			this.c.setKeepAlive(false)
			this.close()
			return
		}
		const event = botEventType.decode(data).toJSON()
		const parser = new Parser(this.c, event)
		const events: Array<Events> = await parser.doParse();
		for (let e of events) {
			this.c.stat.recv_event_cnt++
			this.c.emit(parser.event_type, e)
		}
	}
}