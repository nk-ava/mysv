import crypto from "crypto";
import stream from "stream";
import {Bot, RobotRunTimeError} from "./bot";
import * as os from "os";
import qr, {Bitmap} from "qr-image"
import {promisify} from "util";
import axios, {AxiosResponse} from "axios";
import fs from "node:fs";
import {UClient} from "./uClient";
import * as readline from "readline";
import FormData from "form-data";
import {genFullDevice} from "./core";

export const UintSize = 32 << (~0 >>> 63)
export const _W = UintSize - 1
export const _MASK = BigInt((1n << BigInt(_W)) - 1n)
export const BUF0 = Buffer.alloc(0)
export const OS_TYPE = os.type()
export const TMP_PATH = os.tmpdir()

/** DX 寄存器 */
let DX: bigint = 0n
/** 进位标志位 */
let CF: boolean

const upperHex = "0123456789ABCDEF"

/** 隐藏并锁定一个属性 */
export function lock(obj: any, prop: string) {
	Reflect.defineProperty(obj, prop, {
		configurable: false,
		enumerable: false,
		writable: false,
	})
}

/** 获取流的MD5值和buffer */
export function md5Stream(readable: stream.Readable): Promise<{ buff: Buffer, md5: Buffer }> {
	let buff = Buffer.alloc(0);
	const md5 = crypto.createHash("md5")
	return new Promise((resolve, reject) => {
		readable.on("error", reject)
		readable.on("data", chunk => {
			buff = Buffer.concat([buff, chunk])
			md5.update(chunk)
		})
		readable.on("end", () => {
			resolve({
				buff: buff,
				md5: md5.digest()
			})
		})
	})
}

/** 将二进制转十进制 */
export function binaryToNumber(b: Buffer): bigint {
	let r = BigInt(0)
	// @ts-ignore
	let str: string = b.map(a => a.toString(2).padStart(4, "0")).join("")
	for (let s of str) {
		r = (r + BigInt(s)) * 2n
	}
	r /= 2n
	return r
}

/** 将有符号的64位整数转无符号 */
export function Uint64(n: bigint): bigint {
	const buff = Buffer.alloc(8)
	buff.writeBigInt64BE(n)
	return buff.readBigUint64BE()
}

/** bits.Sub */
export function bitsSub(a: bigint, b: bigint, borrow: bigint) {
	if (UintSize === 32) throw new RobotRunTimeError(-7, "暂不支持32位系统")
	const d64 = Uint64(a - b - borrow)
	const b64 = ((~a & b) | (~(a ^ b) & d64)) >> 63n
	return [d64, b64]
}

/** ctEq */
export function ctEq(x: bigint, y: bigint): bigint {
	const [_, c1] = bitsSub(x, y, 0n)
	const [__, c2] = bitsSub(y, x, 0n)
	return 1n ^ (c1 | c2)
}

/** bits.ConstantTimeByteEq */
export function ConstantTimeByteEq(x: number, y: number): number {
	return ((x ^ y) - 1) >>> 31
}

/** bits.ConstantTimeCompare */
export function ConstantTimeCompare(x: Buffer, y: Buffer): number {
	if (x.length != y.length) return 0
	let v: number = 0
	for (let i = 0; i < x.length; i++) {
		v |= x[i] ^ y[i]
	}
	return ConstantTimeByteEq(v, 0)
}

/** 蒙哥马利乘法 nat_amd64.s */
export function montgomeryLoop(d: BigUint64Array, a: BigUint64Array, b: BigUint64Array, m: BigUint64Array, m0inv: bigint): bigint {
	const CX = BigInt(d.length)
	const BX = d
	const SI = b
	const DI = m
	const R8 = m0inv
	let R9 = BigInt(0)
	let R10 = 0
	while (1) {
		const R11 = a[R10]
		let AX = b[0]
		AX = mul(AX, R11)
		let R13 = AX
		let R12 = DX
		R13 = add(R13, BX[0])
		R12 = adc(R12, 0x00n)
		let R14 = R8
		R14 = (R13 * R14) & 0xffffffffffffffffn
		R14 = btr(R14, 0x3fn)
		AX = DI[0]
		AX = mul(R14, AX)
		R13 = add(AX, R13)
		R12 = adc(DX, R12)
		R13 = shr(R12, 0x3fn, R13)
		R12 = 0n
		R12 += 1n

		while (CX > R12) {
			AX = SI[Number(R12)]
			AX = mul(R11, AX)
			let BP = AX
			let R15 = DX
			AX = DI[Number(R12)]
			AX = mul(R14, AX)
			BP = add(BP, AX)
			R15 = adc(R15, DX)
			BP = add(BP, BX[Number(R12)])
			R15 = adc(R15, 0x00n)
			BP = add(BP, R13)
			R15 = adc(R15, 0x00n)
			AX = BP
			AX = btr(AX, 0x3fn)
			BX[Number(R12) - 1] = AX
			BP = shr(R15, 0x3fn, BP)
			R13 = BP
			R12 += 1n
		}

		R9 = add(R13, R9)
		AX = R9
		AX = btr(AX, 0x3fn)
		BX[Number(CX) - 1] = AX
		R9 = R9 >> 0x3fn
		R10 += 1
		if (CX <= R10) {
			return R9
		}
	}
	return 0n
}

/** ctSelect */
export function ctSelect(need: bigint, x: bigint, y: bigint): bigint {
	const b = Buffer.alloc(8)
	b.writeBigInt64BE(-1n * need)
	const mask = b.readBigInt64BE()
	return y ^ (mask & (y ^ x))
}

/** Encode */
export function Encode(str: string): string {
	const s = Buffer.from(str)
	let spaceCount = 0, hexCount = 0
	for (let i = 0; i < s.length; i++) {
		const c = s[i]
		if (shouldEscape(String.fromCharCode(c))) {
			if (c === ' '.charCodeAt(0)) {
				spaceCount++
			} else {
				hexCount++
			}
		}
	}
	if (spaceCount === 0 && hexCount === 0) {
		return s.toString()
	}

	const required = s.length + 2 * hexCount
	let t = Buffer.alloc(required)

	if (hexCount == 0) {
		t.write(s.toString())
		for (let i = 0; i < s.length; i++) {
			if (s[i] == ' '.charCodeAt(0)) {
				t[i] = '+'.charCodeAt(0)
			}
		}
		return t.toString()
	}

	let j = 0
	for (let i = 0; i < s.length; i++) {
		const c = s[i]
		if (c == ' '.charCodeAt(0)) {
			t[j] = '+'.charCodeAt(0)
			j++
		} else if (shouldEscape(String.fromCharCode(c))) {
			t[j] = '%'.charCodeAt(0)
			t[j + 1] = upperHex[(c >> 4) & 0xf].charCodeAt(0)
			t[j + 2] = upperHex[(c & 15) & 0xf].charCodeAt(0)
			j += 3
		} else {
			t[j] = s[i]
			j++
		}
	}
	return t.toString()
}

/** 获取本机的IP地址 */
export function localIP(): string | undefined {
	const ifaces = os.networkInterfaces();
	if (OS_TYPE === 'Windows_NT') {
		for (let i in ifaces) {
			if (i === '本地连接' || i === '以太网' || i === 'WLAN') {
				//@ts-ignore
				for (let j of ifaces[i]) {
					if (j.family === "IPv4") return j.address
				}
			}
		}
	} else if (OS_TYPE === "Linux") {
		//@ts-ignore
		return ifaces?.eth0[0]?.address
	}
}

/** 获取二维码 */
export async function fetchQrCode(this: Bot | UClient) {
	let {data} = await axios.post("https://passport-api.miyoushe.com/account/ma-cn-passport/web/createQRLogin", {}, {
		headers: getHeaders.call(this)
	})
	if (data.retcode !== 0) throw new Error(`请求二维码失败, reason: ${data.message || "unknown"}`)
	data = data.data
	if (!data) throw new Error("请求二维码失败")
	const io = qr.image(data.url, {
		type: 'png',
		ec_level: 'H',
		margin: 1,
		size: 1,
		customize: logQrcode
	})
	const f = `${this.config.data_dir}/mysQr.png`
	await promisify(stream.pipeline)(io, fs.createWriteStream(f));
	return {img: f, ticket: data.ticket}
}

/** 控制台输出二维码 */
function logQrcode(img: Bitmap) {
	const color_reset = "\x1b[0m"
	const color_fg_blk = "\x1b[30m"
	const color_bg_blk = "\x1b[40m"
	const color_fg_wht = "\x1b[37m"
	const color_bg_wht = "\x1b[47m"
	for (let i = 0; i < 63; i += 2) {
		let line = ""
		for (let j = 1; j < 64; j++) {
			let r0 = img.data[i * 64 + j]
			let r1 = img.data[i * 64 + j + 64]
			let bgcolor = (r0 === 255) ? color_bg_wht : color_bg_blk
			let fgcolor = (r1 === 255) ? color_fg_wht : color_fg_blk
			line += `${fgcolor + bgcolor}\u2584`
		}
		console.log(line + color_reset)
	}
}

function getHeaders(this: any) {
	return {
		"Content-Type": 'application/json',
		"Origin": 'https://user.miyoushe.com',
		"Referer": 'https://user.miyoushe.com/',
		"X-Rpc-App_id": 'bll8iq97cem8',
		"X-Rpc-Client_type": 4,
		'X-Rpc-Device_model': 'Chrome%20114.0.0.0',
		'X-Rpc-Device_name': 'Chrome',
		'X-Rpc-Device_os': 'Windows%2010%2064-bit',
		'X-Rpc-Game_biz': 'bbs_cn',
		"X-Rpc-Device_fp": this?.device?.bbs?.device_fp || "0000000000",
		"X-Rpc-Device_id": this?.device?.bbs?.device_id || "b1af2490-1261-4258-bfad-ce3b76b1902c"
	}
}

/** 获取米游社cookie */
export async function getMysCk(this: any, cb: Function) {
	if (this.device && !this.device.bbs) {
		this.device.bbs = (await genFullDevice(this.device)).bbs
		fs.writeFile(`${this.config.data_dir}/device.json`, JSON.stringify(this.device, null, "\t"), () => {})
	}
	if (fs.existsSync(`${this.config.data_dir}/cookie`)) {
		const ck = fs.readFileSync(`${this.config.data_dir}/cookie`, "utf-8")
		if (ck && ck !== "") {
			cb(ck)
			return
		}
	}
	if (this.config.account && this.config.password) {
		await passwordLogin.call(this, cb)
		return
	}
	console.log("\x1B[32m请选择一种方式获取cookie:")
	console.log('0.扫码登入')
	console.log('1.手机验证码登入')
	console.log('2.账号密码登入\x1B[0m')
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	})
	rl.on("line", async data => {
		data = data.toString().trim()
		switch (data) {
			case "0":
				rl.close()
				scanQrLogin.call(this, cb)
				break
			case "1":
				rl.close()
				await captchaLogin.call(this, cb)
				break
			case "2":
				rl.close()
				await passwordLogin.call(this, cb)
				break
			default:
				console.log("\x1b[33m请输入正确的序号\x1b[0m")
				break
		}
	})
}

async function captchaLogin(this: Bot | UClient, cb: Function) {
	if (!this.config.account || !Number(this.config.account)) {
		this.config.account = await new Promise((resolve, reject) => {
			const rl = readline.createInterface(process.stdin, process.stdout)
			rl.question("未配置手机号或手机号格式错误，请重新输入手机号: ", account => {
				rl.close()
				account = account.toString().trim()
				if (!Number(account)) reject(new Error("手机号登入account必须为手机号，请检查后重试"))
				resolve(Number(account))
			})
		})
	}
	if (!this.config.account) return
	await isRegister(this.config.account)
	const timestamp = Date.now()
	let {data} = await axios.get(`https://webapi.account.mihoyo.com/Api/create_mmt?scene_type=1&now=${timestamp}&reason=user.mihoyo.com#/login/captcha&action_type=login_by_mobile_captcha&t=${timestamp}`, {
		headers: {
			"Origin": "https://user.mihoyo.com",
			"Referer": "https://user.mihoyo.com/",
			"x-rpc-client_type": 4,
			"x-rpc-mi_referrer": "https://user.mihoyo.com/#/login/captcha",
			"x-rpc-source": "accountWebsite"
		}
	})
	if (data.code !== 200 || data?.data?.status !== 1) throw new Error("密码登入失败，reason " + data?.data?.msg || "unknown")
	data = data?.data?.mmt_data
	if (!data) throw new Error("密码登入失败, reason： mmt_data为空")
	if (data.gt) {
		this.emit("login.geetest", data, login_by_captcha.bind(this, data.mmt_key, cb, data?.use_v4))
		return
	}
	await login_by_captcha.call(this, data.mmt_key, cb)
}

async function login_by_captcha(this: Bot | UClient, mmt_key: string, cb: Function, v4?: boolean, gt?: any) {
	let p = `action_type=login&mmt_key=${mmt_key}&mobile=${this.config.account}`
	if (v4 && gt) p += `&geetest_data=${JSON.stringify(gt)}`
	else if (gt) p += "&" + Object.entries(gt).map(g => `${g[0]}=${g[1]}`).join("&")
	p += `&t=${Date.now()}`
	const {data} = await axios.post("https://webapi.account.mihoyo.com/Api/create_mobile_captcha", p, {
		headers: {
			"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
			"X-Rpc-Mi_referrer": "https://user.mihoyo.com/#/account/home",
			"Origin": "https://user.mihoyo.com",
			"Referer": "https://user.mihoyo.com/"
		}
	})
	if (data.code !== 200 || data?.data?.status !== 1) throw new Error(`发送验证码失败，reason： ${data?.data?.msg || "unknown"}`)
	const rl = readline.createInterface(process.stdin)
	console.log("\x1b[32m请输入验证码：\x1b[0m")
	rl.on("line", async (code) => {
		code = code.toString().trim()
		rl.close()
		const p = `mobile=${this.config.account}&mobile_captcha=${code}&source=user.mihoyo.com&t=${Date.now()}`
		let {data} = await axios.post("https://webapi.account.mihoyo.com/Api/login_by_mobilecaptcha", p, {
			headers: {
				"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
				"X-Rpc-Mi_referrer": "https://user.mihoyo.com/#/account/home",
				"Origin": "https://user.mihoyo.com",
				"Referer": "https://user.mihoyo.com/",
				"X-Rpc-Source": "accountWebsite",
				"X-Rpc-Game_biz": "account_cn",
				"x-rpc-client_type": 4,
				"x-rpc-source": "accountWebsite"
			}
		})
		if (data.code !== 200 || data?.data?.status !== 1) throw new Error(`验证码登入失败，reason：${data?.data?.msg || "unknown"}`)
		data = data?.data?.account_info
		cb(await genToken(data?.weblogin_token || "", data?.account_id || ""))
	})
}

async function isRegister(telephone: string | number) {
	const {data} = await axios.get(`https://webapi.account.mihoyo.com/Api/is_mobile_registrable?mobile=${telephone}&t=${Date.now()}`)
	if (data.code !== 200 || data?.data?.status !== 1) throw new Error(`注册状态查询失败，reason：${data?.data?.msg || "unknown"}`)
	if (data?.data?.is_registable !== 0) throw new Error("此手机号不可登入或注册，请更换手机号")
}

async function passwordLogin(this: Bot | UClient, cb: Function) {
	if (!this.config.account || !this.config.password) {
		await new Promise((resolve => {
			const rl = readline.createInterface(process.stdin, process.stdout)
			rl.question("请输入账号（手机号或邮箱）：", account => {
				account = account.toString().trim()
				this.config.account = account
				rl.question("请输入密码：", pwd => {
					pwd = pwd.toString().trim()
					this.config.password = pwd
					rl.close()
					resolve(undefined)
				})
			})
		}))
	}
	const timestamp = Date.now()
	let {data} = await axios.get(`https://webapi.account.mihoyo.com/Api/create_mmt?scene_type=1&now=${timestamp}&reason=user.mihoyo.com#/login/password&action_type=login_by_password&account=${this.config.account}&t=${timestamp}`)
	if (data.code !== 200 || data?.data?.status !== 1) throw new Error("密码登入失败，reason " + data?.data?.msg || "unknown")
	data = data?.data?.mmt_data
	if (!data) throw new Error("密码登入失败, reason： mmt_data为空")
	if (data.gt) {
		this.emit("login.geetest", data, login_by_pwd.bind(this, data.mmt_key, cb, data?.use_v4))
		return
	}
	await login_by_pwd.call(this, data.mmt_key, cb)
}

async function login_by_pwd(this: Bot | UClient, mmt_key: string, cb: Function, v4?: boolean, gt?: any) {
	let param = `account=${this.config.account}&password=${this.config.password}&is_crypto=false&mmt_key=${mmt_key}`
	if (v4 && gt) param += `&geetest_data=${JSON.stringify(gt)}`
	else if (gt) param += "&" + Object.entries(gt).map(g => `${g[0]}=${g[1]}`).join("&")
	param += `&source=user.mihoyo.com&t=${Date.now()}`
	let {data} = await axios.post("https://webapi.account.mihoyo.com/Api/login_by_password", param, {
		headers: {
			"Origin": "https://user.mihoyo.com",
			"Referer": "https://user.mihoyo.com/",
			"x-rpc-mi_referrer": "https://user.mihoyo.com/",
			"x-rpc-source": "accountWebsite",
			"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
			"x-rpc-client_type": 4
		}
	})
	if (data.code !== 200 || data?.data?.status !== 1) throw new Error(`密码登入失败，reason: ${data?.data?.msg}||"unknown"`)
	data = data?.data?.account_info
	cb(await genToken(data?.weblogin_token || "", data?.account_id || ""))
}

async function genToken(login_ticket: string, login_uid: string) {
	let url = "https://api-takumi.mihoyo.com/auth/api/getMultiTokenByLoginTicket";
	let query = `login_ticket=${login_ticket}&token_types=3&uid=${login_uid}`;
	let {data} = await axios.get(url + "?" + query)
	if (data.retcode !== 0) throw new Error(`请求stoken失败，reason：${data.message || "unknown"}`)
	data = data?.data?.list
	const ckMap: { [key: string]: string } = {
		"account_id": login_uid
	}
	for (let t of data) {
		ckMap[t.name] = t.token
		ckMap[`${t.name.substr(0, 2)}uid`] = login_uid
	}
	let res = (await axios.get(`https://api-takumi.mihoyo.com/auth/api/getCookieAccountInfoBySToken?stoken=${data[0].token}&uid=${login_uid}`)).data
	if (res.retcode !== 0) throw new Error(`请求cookie_token失败，reason：${res.message || "unknown"}`)
	res = res?.data
	ckMap.cookie_token = res.cookie_token
	return Object.entries(ckMap).map(a => `${a[0]}=${a[1]}`).join("; ") + "; "
}

function scanQrLogin(this: any, cb: Function) {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	})
	rl.on("line", () => {
		clearInterval(this.interval)
		_QrCodeLogin.call(this).then()
	})
	this.on("qrLogin.success", (ck: any) => {
		this.logger.info("二维码扫码登入成功")
		rl.close()
		cb(ck)
	})
	this.on("qrLogin.error", (e: any) => {
		this.logger.error("登入失败：reason " + e)
	})
	_QrCodeLogin.call(this).then()
}

async function _QrCodeLogin(this: Bot | UClient) {
	const {img, ticket} = await fetchQrCode.call(this);
	console.log("请用米游社扫描二维码，回车刷新二维码")
	console.log(`二维码已保存到${img}`)
	this.interval = setInterval(async () => {
		this.logger.debug('请求二维码状态...')
		const res: AxiosResponse = await axios.post("https://passport-api.miyoushe.com/account/ma-cn-passport/web/queryQRLoginStatus?ticket=" + ticket, {}, {
			headers: getHeaders.call(this)
		})
		let status = res?.data
		if (!status) return
		if (status.message !== 'OK') {
			this.emit("qrLogin.error", status?.message || "unknown")
			clearInterval(this.interval)
			return
		}
		status = status?.data?.status
		if (!status) return
		if (status === 'Confirmed') {
			const set_cookie = res.headers["set-cookie"]
			if (!set_cookie) {
				this.emit("qrLogin.error", "没有获取到cookie, 请刷新重试")
				clearInterval(this.interval)
				return
			}
			let cookie = ""
			for (let ck of set_cookie) cookie += ck.split("; ")[0] + "; "
			if (cookie === "") this.emit("qrLogin.error", "获取到的cookie为空，请刷新二维码重新获取")
			else this.emit("qrLogin.success", cookie)
			clearInterval(this.interval)
		}
	}, 2000)
}

/** clientUniqueId */
export function ZO(Un = 0) {
	let e = ((4294967295 & Date.now()) >>> 0).toString(2)
		, t = Math.floor(Math.random() * (Math.pow(2, 20) - 1))
		, n = e + Un.toString(2).padStart(11, "0") + t.toString(2).padStart(20, "0");
	return Un = 2047 & ++Un,
		parseInt(n, 2)
}

/** 使用cookie上传图片 */
export async function uploadImageWithCk(this: Bot | UClient, readable: stream.Readable, e: string | undefined): Promise<string> {
	if (!this.config.mys_ck) throw new Error("未配置mys_ck，无法调用上传接口")
	if (!readable.readable) throw new Error("The first argument is not readable stream")
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
	if (!data.data) throw new Error(data.message)
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
	if (!result.data) throw new Error(result.message)
	return result.data.url
}

function shouldEscape(s: string): boolean {
	return /[^a-zA-Z0-9\-_\.~]/.test(s)
}

function btr(a: bigint, w: bigint): bigint {
	const mask = BigInt(1) << w
	return a & (~mask)
}

function shr(a: bigint, w: bigint, padding: bigint): bigint {
	return (a << (64n - w)) | (padding >> w)
}

function mul(a: bigint, b: bigint): bigint {
	DX = 0n
	const res = a * b
	DX = res >> 64n
	return res & 0xffffffffffffffffn
}

function add(a: bigint, b: bigint): bigint {
	const res = a + b
	CF = !!(res >> 64n);
	return res & 0xffffffffffffffffn
}

function adc(a: bigint, b: bigint): bigint {
	const res = a + b
	if (CF) return (res + 1n) & 0xffffffffffffffffn
	return res & 0xffffffffffffffffn
}