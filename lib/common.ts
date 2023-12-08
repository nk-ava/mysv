import crypto from "crypto";
import stream from "stream";
import {RobotRunTimeError} from "./bot";
import * as os from "os";

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