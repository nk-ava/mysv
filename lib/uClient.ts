import WebSocket from "ws";
import Writer from "./ws/writer";
import axios from "axios";
import {Bot, RobotRunTimeError} from "./bot";
import {lock} from "./common";

export interface UClientConfig {
	/** 用户id */
	uid: string
	/** ws地址 */
	url: string
	token: string
}

const HEARTBEAT = Symbol("HEARTBEAT")
const HANDLER = Symbol("HANDLER")
const FN_SEND = Symbol("FN_SEND")

export class UClient extends WebSocket {
	private readonly uid: string
	private readonly c: Bot
	private readonly info: UClientConfig
	private readonly [HANDLER]: Map<number, Function>
	private [HEARTBEAT]!: NodeJS.Timeout
	private seq: number

	private constructor(c: Bot, info: UClientConfig, cb: Function) {
		super(info.url)
		this.seq = 0
		this.uid = info.uid
		this.info = info
		this.c = c
		this[HANDLER] = new Map
		this.watchEvents(cb)

		lock(this, "info")
		lock(this, "c")
	}

	static async new(c: Bot, cb: Function) {
		const {data} = await axios.get("https://bbs-api.miyoushe.com/vila/wapi/own/member/info", {
			headers: {
				"Accept": "application/json, text/plain, */*",
				"Accept-Encoding": "gzip, deflate, br",
				"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
				"Connection": "keep-alive",
				"Cookie": c.config.mys_ck,
				'Origin': 'https://dby.miyoushe.com',
				'Referer': 'https://dby.miyoushe.com/',
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
				'x-rpc-client_type': 4,
				"x-rpc-device_fp": '98cfc8c7-b24b-45ff-a0e2-19f9e09d5000',
				"x-rpc-device_id": '98cfc8c7-b24b-45ff-a0e2-19f9e09d5000',
				"x-rpc-platform": 4
			}
		})
		const info = data?.data
		if (!info) throw new RobotRunTimeError(-11, `uclient获取连接信息出错，reason ${data.message || 'unknown'}`)
		const url = `wss://ws.rong-edge.com/websocket?appId=tdrvipkstcl55&token=${info.token.split("@")[0] + "@"}&sdkVer=5.9.0&pid=&apiVer=browser%7CChrome%7C119.0.0.0&protocolVer=3`
		return new UClient(c, {
			uid: info.user_id,
			url: url,
			token: info.token
		}, cb)
	}

	async getMsg(msgId: string, villa_id: number, room_id: number) {
		const seq = this.seq & 0xffff
		this.seq++
		const writer = new Writer()
			.writeU8(0x52)
			.writeWithU16Length("qryMsg")
			.writeWithU16Length(String(this.uid))
			.writeU16BE(seq)
			.writeU8(0x0a)
			.writeWithU8Length(String(villa_id))
			.writeBytes(Buffer.from("100a1a2408e0d780bdc53112", "hex"))
			.writeWithU8Length(msgId)
			.writeU8(0x1a)
			.writeWithU8Length(String(room_id))
		return await this[FN_SEND](writer.read(), seq)
	}

	private async [FN_SEND](pkt: Buffer, seq: number) {
		return new Promise((resolve, reject) => {
			this.send(pkt, (err) => {
				if (err) reject(new RobotRunTimeError(-11, `[${this.info.uid}] 数据包发送失败 seq: ${seq}, reason: ${err.message}`))
				const timer = setTimeout(() => {
					this[HANDLER].delete(seq)
					reject(new RobotRunTimeError(-11, `[${this.info.uid}] 数据包接收超时 seq: ${seq}`))
				}, 5000)
				this[HANDLER].set(seq, (r: any) => {
					clearTimeout(timer)
					this[HANDLER].delete(seq)
					resolve(r)
				})
			})
		})
	}

	private watchEvents(cb: Function) {
		this.on("open", () => {
			this.c.logger.info(`[${this.info.uid}]建立连接成功，ws地址：${this.info.url}`)
			this[HEARTBEAT] = setInterval(() => {
				this.send(Buffer.from("c0", 'hex'), () => {
					this.c.logger.debug(`[${this.info.uid}]心跳包发送成功`)
				})
			}, 15000)
			cb()
		})
		this.on("message", data => {
			this.dealMsg(data as Buffer)
		})
	}

	private dealMsg(buf: Buffer) {

	}

	destroy() {
		clearInterval(this[HEARTBEAT])
		this[HANDLER].clear()
	}
}