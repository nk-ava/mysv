import WebSocket from "ws";
import axios from "axios";
import {UClient, UClientRunTimeError} from "../uClient";
import {getDbyHeaders, lock} from "../common";
import * as fs from "fs";

export class Network extends WebSocket {
	readonly remote: string
	private readonly c: UClient

	private constructor(c: UClient, url: string) {
		super(url)
		this.remote = url
		this.c = c

		lock(this, "c")
	}

	static async new(c: UClient, uid: number, config: any) {
		const {data} = await axios.get("https://bbs-api.miyoushe.com/vila/wapi/own/member/info", {
			headers: getDbyHeaders.call(c)
		})
		if (data.retcode !== 0) throw new UClientRunTimeError(data.recode, `请求info失败，reason：${data.message || "unknown"}`)
		const info = data?.data
		if (info.user_id != uid) {
			fs.unlink(`${c.config.data_dir}/cookie`, () => {})
			throw new UClientRunTimeError(-1, "米游社cookie对应的uid和配置的uid账号不一致")
		}
		if (!info) throw new UClientRunTimeError(-1, `uclient获取连接信息出错，reason ${data.message || 'unknown'}`)
		c.logger.debug("请求info接口成功...")
		await Network.submitConfig(c, config)
		c.logger.debug("提交config成功...")
		const url = `wss://ws.rong-edge.com/websocket?appId=tdrvipkstcl55&token=${info.token.split("@")[0] + "@"}&sdkVer=5.9.0&pid=&apiVer=browser%7CChrome%7C119.0.0.0&protocolVer=3`
		return new Network(c, url)
	}

	private static async submitConfig(c: UClient, config: any) {
		const {data} = await axios.post("https://cloudcontrol.rong-edge.com/v1/config", config, {
			headers: getDbyHeaders.call(c)
		})
		if (data.code != 200) throw new UClientRunTimeError(data.code, `提交config失败，reason ${data.message}||unknown`)
	}

	sent(pkt: Buffer, cb?: (err?: (Error | undefined)) => void) {
		super.send(pkt, cb)
		this.c.sig.timestamp_lastSend = Date.now()
	}
}