import {UClient} from "../uClient"
import * as crypto from "crypto";
import * as fs from "fs";

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
}

export function genDeviceConfig(): Device {
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

function getUuid(this: UClient) {
	let uuid = this.device?.device_fp
	if (uuid) return uuid
	return uuid = crypto.randomUUID(), this.device.device_fp = uuid,
		fs.writeFileSync(`${this.config.data_dir}/device.json`, JSON.stringify(this.device, null, '\t')),
		uuid
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