import crypto from "crypto";
import stream from "stream";

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