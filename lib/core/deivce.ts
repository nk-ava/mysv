import {UClient} from "../uClient"
import * as crypto from "crypto";
import * as fs from "fs";
import axios from "axios";

function genDeviceId() {
	let e = Sr();
	if (e = "".concat(e.replace(/-/g, ""), "a"),
		e = function (r) {
			let i = "0123456789abcdefghigklmnopqrstuvwxyzABCDEFGHIGKLMNOPQRSTUVWXYZa0".split("")
				, o = i.length + 1
				, s = +r
				, a = [];
			do {
				let c = s % o;
				s = (s - c) / o,
					a.unshift(i[c])
			} while (s);
			return a.join("")
		}(parseInt(e, 16)),
	e.length > 22 && (e = e.slice(0, 22)),
	e.length < 22)
		for (let t = 22 - e.length, n = 0; n < t; n++)
			e += "0";
	return e
}

function Sr() {
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (e) {
		const t = 16 * Math.random() | 0;
		return (e === "x" ? t : 3 & t | 8).toString(16)
	})
}

export interface Device {
	config: {
		deviceId: string
		model: string
		platform: string
		timestamp: number
		version: string
	}
	device_fp: string
	bbs?: {
		device_fp: string
		device_id: string
	}
}

export function genShortDevice(): Device {
	return {
		config: {
			deviceId: genDeviceId(),
			model: "Web|Chrome|119.0.0.0",
			platform: "web",
			timestamp: 0,
			version: "5.9.0"
		},
		device_fp: crypto.randomUUID()
	}
}

export async function genFullDevice(d: Device): Promise<Device> {
	const bbs = {} as any
	bbs.device_fp = await getFp(d)
	bbs.device_id = d.device_fp
	d.bbs = bbs
	return d
}

async function getFp(d: Device) {
	const {data} = await axios.post("https://public-data-api.mihoyo.com/device-fp/api/getFp", {
		app_name: "bbs_cn",
		device_fp: getRandomNumber10Radix(10),
		device_id: d.device_fp,
		ext_fields: JSON.stringify({
				userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
				browserScreenSize: '1008108',
				maxTouchPoints: '0',
				isTouchSupported: '0',
				browserLanguage: 'zh-CN',
				browserPlat: 'Win32',
				browserTimeZone: 'Asia/Shanghai',
				webGlRender: 'ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00003EA0) Direct3D11 vs_5_0 ps_5_0, D3D11)',
				webGlVendor: 'Google Inc. (Intel)',
				numOfPlugins: '5',
				listOfPlugins: [
					'PDF Viewer',
					'Chrome PDF Viewer',
					'Chromium PDF Viewer',
					'Microsoft Edge PDF Viewer',
					'WebKit built-in PDF'
				],
				screenRatio: '1',
				deviceMemory: '8',
				hardwareConcurrency: '8',
				cpuClass: 'unknown',
				ifNotTrack: 'unknown',
				ifAdBlock: '0',
				hasLiedLanguage: '0',
				hasLiedResolution: '1',
				hasLiedOs: '0',
				hasLiedBrowser: '0',
				canvas: 'unknown',
				webDriver: '0',
				colorDepth: '24',
				pixelRatio: '1',
				packageName: 'unknown',
				packageVersion: '2.21.0',
				webgl: 'unknown'
			}
		),
		platform: "4",
		seed_id: getRandomNumber(16),
		seed_time: `${Date.now()}`
	}, {
		headers: {
			"Origin": "https://www.miyoushe.com",
			"Referer": "https://www.miyoushe.com/"
		}
	})
	if (data.retcode !== 0 || data?.data?.code !== 200) throw new Error(`获取device_fp失败，reason：${data.message || data?.data?.msg || "unknown"}`)
	return data.data.device_fp
}

function getUuid(this: UClient) {
	let uuid = this.device?.device_fp
	if (uuid) return uuid
	return uuid = crypto.randomUUID(), this.device.device_fp = uuid,
		fs.writeFileSync(`${this.config.data_dir}/device.json`, JSON.stringify(this.device, null, '\t')),
		uuid
}

function getRandomNumber(e: number) {
	let t, n
	for (t = "", n = e; n > 0; --n)
		t += "0123456789abcdef"[Math.floor(16 * Math.random())];
	return t
}

function getRandomNumber10Radix(e: number) {
	let t, n
	for (t = "", n = e; n > 0; --n)
		t += "0123456789"[Math.floor(10 * Math.random())];
	return t
}

export function getRequestAndMessageParams(this: UClient, e?: any) {
	const t = getUuid.call(this), n = e ? "x-rpc-" : "";
	return {
		[`${n}client_type`]: "4",
		[`${n}platform`]: "4",
		[`${n}device_id`]: t,
		[`${n}device_fp`]: t
	}
}