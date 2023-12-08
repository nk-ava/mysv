import {PassThrough} from "stream"

export default interface Writer {
	read(size?: number): Buffer
}

export default class Writer extends PassThrough {
	writeU8(v: number) {
		const buf = Buffer.allocUnsafe(1)
		buf.writeUInt8(v)
		this.write(buf)
		return this
	}

	writeU16(v: number) {
		const buf = Buffer.allocUnsafe(2)
		buf.writeUInt16LE(v)
		this.write(buf)
		return this
	}

	writeU32(v: number) {
		const buf = Buffer.allocUnsafe(4)
		buf.writeUInt32LE(v)
		this.write(buf)
		return this
	}

	writeU64(v: number | bigint) {
		const buf = Buffer.allocUnsafe(8)
		buf.writeBigUInt64LE(BigInt(v))
		this.write(buf)
		return this
	}

	writeBytes(v: string | Uint8Array) {
		if (typeof v === "string") v = Buffer.from(v)
		this.write(v)
		return this
	}

	writeWithLength(v: string | Uint8Array) {
		return this.writeU32(Buffer.byteLength(v)).writeBytes(v)
	}

}
