import express, {Application} from "express";
import Parser, {Events} from "../parser";
import {Bot, Config, RobotRunTimeError} from "../bot";
import bodyParse from "body-parser";
import {localIP} from "../common";

export class HttpClient {
	private readonly config: Config;
	private readonly c: Bot;
	private readonly application: Application
	private readonly host: string
	private readonly port: number

	constructor(c: Bot, config: Config, cb: Function) {
		this.application = express()
		this.config = config
		this.c = c
		this.host = config.host || localIP() || 'localhost'
		this.port = config.port || 8081
		this.configApplication()
		this.startServe(cb)
	}

	private watchPath() {
		if (!this.config.callback_path) throw new RobotRunTimeError(-6, "未配置回调地址路径")
		let pathname = this.config.callback_path
		if (!pathname.startsWith("/")) pathname = "/" + pathname
		this.c.logger.debug(`开始监听回调路径：${pathname}`)
		this.application.post(pathname, async (req, res) => {
			const event = req.body
			if (this.c.verifySign(event, req.header("x-rpc-bot_sign") || "")) {
				const parser = new Parser(this.c, event.event)
				const events: Array<Events> = await parser.doParse();
				for (let e of events) {
					this.c.stat.recv_event_cnt++
					this.c.emit(parser.event_type, e)
				}
			}
			res.status(200)
			res.setHeader("Content-Type", "application/json")
			res.send({"message": "", "retcode": 0})
			res.end()
		})
	}

	/** 配置application */
	private configApplication() {
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

	/** 启动http服务 */
	private startServe(cb: Function) {
		this.application.listen(this.port, this.host, () => {
			this.watchPath()
			this.c.logger.info(`服务已成功启动，服务地址：http://${this.host}:${this.port}`)
			cb()
		})
	}
}