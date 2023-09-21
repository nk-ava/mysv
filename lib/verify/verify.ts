/**
 * rsa-sha256-pkcs1v15验证签名
 */
import {PassThrough} from "stream";

const prefix = [0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00, 0x04, 0x20]
const hashLen = 32

export function verifyPKCS1v15(hashed: Buffer, signature: Buffer) {
	const tLen = prefix.length + hashLen
}

export function createPublicKey(raw: string) {
	const {data, s, e} = formatKey(raw)
	const b = Buffer.from(data.slice(s, e).toString(), "base64")

}

function formatKey(raw: string): { data: Buffer, s: number, e: number } {
	raw = raw.replace("-----BEGIN PUBLIC KEY-----", "")
		.replace("-----END PUBLIC KEY-----", "")
		.replace(/\s/g, "")
		.replace(/\n/g, "")
		.replace(/\r/g, "")
		.replace(/\t/g, "")
	const sl = raw.length
	let c = Math.floor(sl / 64)
	if (sl % 64 > 0) c = c + 1
	const writer = new PassThrough()
	writer.write(Buffer.from("-----BEGIN PUBLIC KEY-----\n"))
	const start = 27
	for (let i = 0; i < c; i++) {
		let b = i * 64
		let e = b + 64
		if (e > sl) {
			writer.write(Buffer.from(raw.slice(b)))
		} else {
			writer.write(Buffer.from(raw.slice(b, e)))
		}
		writer.write("\n")
	}
	writer.write("-----END PUBLIC KEY-----")
	const data = writer.read()
	const end = data.length - 25
	return {data: data, s: start, e: end}
}