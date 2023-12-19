import WebSocket from "ws";
import axios from "axios";
import {UClient, UClientRunTimeError} from "../uClient";

export class Network extends WebSocket {
	readonly remote: string

	private constructor(url: string) {
		super(url)
		this.remote = url
	}

	static async new(c: UClient, uid: number, config: any) {
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
		if (info.user_id != uid) throw new UClientRunTimeError(-1, "米游社cookie对应的uid和配置的uid账号不一致")
		if (!info) throw new UClientRunTimeError(-1, `uclient获取连接信息出错，reason ${data.message || 'unknown'}`)
		c.logger.debug("请求info接口成功...")
		await Network.submitConfig(config)
		c.logger.debug("提交config成功...")
		const url = `wss://ws.rong-edge.com/websocket?appId=tdrvipkstcl55&token=${info.token.split("@")[0] + "@"}&sdkVer=5.9.0&pid=&apiVer=browser%7CChrome%7C119.0.0.0&protocolVer=3`
		return new Network(url)
	}

	private static async submitConfig(config: any) {
		const {data} = await axios.post("https://cloudcontrol.rong-edge.com/v1/config", config, {
			headers: {
				"Accept": "*/*",
				"Accept-Encoding": "gzip, deflate, br",
				"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
				"Content-Type": "application/json",
				"Origin": "https://dby.miyoushe.com",
				"Rc-App-Key": "tdrvipkstcl55",
				"Referer": "https://dby.miyoushe.com/",
				"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
			}
		})
		if (data.code != 200) throw new UClientRunTimeError(-1, `提交config失败，reason ${data.message}||unknown`)
	}
}