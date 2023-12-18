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
	deviceId: string
	model: string
	platform: string
	timestamp: number
	version: string
}

export function genDeviceConfig(): Device {
	return {
		deviceId: genDeviceId(),
		model: "Web|Chrome|119.0.0.0",
		platform: "web",
		timestamp: 0,
		version: "5.9.0"
	}
}