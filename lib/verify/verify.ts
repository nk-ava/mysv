/**
 * rsa-sha256-pkcs1v15验证签名
 */
import {PassThrough} from "stream";
import {Modules, Nat} from "./nat";
import {_MASK, _W, Uint64, ctEq, ctSelect, ConstantTimeByteEq, ConstantTimeCompare} from "../common";
import {RobotRunTimeError} from "../bot";
import crypto from "crypto";

const prefix = [0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00, 0x04, 0x20]
const hashLen = 32

export function verifyPKCS1v15(pub: crypto.JsonWebKey, hashed: Buffer, signature: Buffer): boolean {
	const tLen = prefix.length + hashLen
	const pKey: { e: Buffer, n: Buffer } = {
		n: Buffer.from(pub.n || "", "base64"),
		e: Buffer.from(pub.e || "", "base64")
	}
	const k = pKey.n.length
	if (k < tLen + 11) {
		throw new RobotRunTimeError(-8, "pkcs1v15 verify signature error")
	}
	if (k !== signature.length) {
		throw new RobotRunTimeError(-8, "pkcs1v15 verify signature error")
	}
	const em = encrypt(pKey, signature)
	let ok = ConstantTimeByteEq(em[0], 0)
	ok &= ConstantTimeByteEq(em[1], 1)
	ok &= ConstantTimeCompare(em.slice(k - hashLen, k), hashed)
	ok &= ConstantTimeCompare(em.slice(k - tLen, k - hashLen), Buffer.from(prefix))
	ok &= ConstantTimeByteEq(em[k - tLen - 1], 0)

	for (let i = 2; i < k - tLen - 1; i++) {
		ok &= ConstantTimeByteEq(em[i], 0xff)
	}

	return ok == 1;
}

function encrypt(pub: { n: Buffer, e: Buffer } | any, plaintext: Buffer) {
	const N: Modules = newModulesFromBig(pub.n)

	const m: Nat = new Nat().setBytes(plaintext, N.nat)
	const buff = Buffer.alloc(8)
	const E = pub.e
	for (let i = 0; i < E.length; i++) buff.writeUint8(E[i], 8 - E.length + i)
	let i = 0
	while (i < buff.length && buff[i] === 0x00) i++
	const e = buff.slice(i)

	return new Nat().exp(m, e, N).bytes(N)
}

function newModulesFromBig(b: Buffer): Modules {
	const nt = new Nat().setBig(b)
	return {
		nat: nt,
		leading: _W - nt.limbs[nt.limbs.length - 1].toString(2).length,
		m0inv: minusInverseModW(nt.limbs[0]),
		rr: rr(nt)
	} as Modules
}

function rr(m: Nat): Nat {
	const rr = new Nat().setSize(m.limbs.length)
	const n = rr.limbs.length
	rr.limbs[n - 1] = 1n
	for (let i = n - 1; i < 2 * n; i++) {
		// shiftIn(0,m)
		const y = 0n
		const d = new Nat().setSize(m.limbs.length)
		const size = m.limbs.length
		let needSubtraction = BigInt(0)
		for (let i = _W - 1; i >= 0; i--) {
			let carry = (y >> BigInt(i)) & 1n
			let borrow = BigInt(0)
			for (let j = 0; j < size; j++) {
				let l = ctSelect(needSubtraction, d.limbs[j], rr.limbs[j])
				let res = (l << 1n) + carry
				rr.limbs[j] = res & _MASK
				carry = res >> BigInt(_W)

				res = Uint64(rr.limbs[j] - m.limbs[j] - borrow)
				d.limbs[j] = res & _MASK
				borrow = res >> BigInt(_W)
			}
			needSubtraction = ctEq(carry, borrow)
		}
		const sz = rr.limbs.length
		for (let i = 0; i < sz; i++) {
			rr.limbs[i] = ctSelect(needSubtraction, d.limbs[i], rr.limbs[i])
		}
	}
	return rr
}

function minusInverseModW(x: bigint): bigint {
	let y = BigInt(x)
	for (let i = 0; i < 5; i++) {
		y = y * (2n - x * y)
	}
	return (1n << BigInt(_W)) - (y & _MASK)
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