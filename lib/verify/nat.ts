import {UintSize, binaryToNumber, _W, _MASK, BUF0, Uint64, ctEq, montgomeryLoop, ctSelect} from "../common"
import {ServeRunTimeError} from "../serve";

export class Nat {
	bits: Buffer
	limbs: BigUint64Array

	constructor() {
		this.bits = BUF0
		this.limbs = new BigUint64Array(0)
	}

	setBig(n: Buffer): Nat {
		const requiredLimbs = Math.floor((n.length * 8 + _W - 1) / _W)
		this.reset(requiredLimbs)
		const nLimbs = Math.floor((n.length * 8 + UintSize - 1) / UintSize)
		let limbs
		if (UintSize === 64) limbs = new BigUint64Array(nLimbs)
		else throw new ServeRunTimeError(-7, "暂不支持32位系统")
		for (let i = nLimbs - 1; i >= 0; i--) {
			try {
				limbs[i] = n.readBigUint64BE((nLimbs - i - 1) * 8)
			} catch {
				limbs[i] = binaryToNumber(n.slice((nLimbs - i - 1) * 8))
			}
		}
		let outI = 0
		let shift = 0
		for (let li of limbs) {
			this.limbs[outI] |= (BigInt(li) << BigInt(shift)) & _MASK
			outI++
			if (outI === requiredLimbs) {
				return this
			}
			this.limbs[outI] = li >> (BigInt(_W) - BigInt(shift))
			shift++ // this assumes bits.UintSize - _W = 1
			if (shift == _W) {
				shift = 0
				outI++
			}
		}
		return this
	}

	reset(n: number) {
		this.bits = BUF0
		this.limbs = new BigUint64Array(n)
	}

	setSize(m: number): Nat {
		this.limbs = new BigUint64Array(m)
		return this
	}

	bytes(m: Modules): Buffer {
		const s = Math.floor(((m.nat.limbs.length * _W - m.leading) + 7) / 8)
		const bytes = Buffer.alloc(s)
		let shift = 0
		let outI = bytes.length - 1
		for (let limb of this.limbs) {
			let remainingBits = _W
			while (remainingBits >= 8) {
				bytes[outI] |= Number(limb & 0xffn) << shift
				const consumed = 8 - shift
				limb >>= BigInt(consumed)
				remainingBits -= consumed
				shift = 0
				outI--
				if (outI < 0) return bytes
			}
			bytes[outI] = Number(limb & 0xffn)
			shift = remainingBits
		}
		return bytes
	}

	Bits(): Array<string> {
		return Array.from(this.limbs).map(a => a.toString())
	}

	setBytes(b: Buffer, m: Nat): Nat {
		// x.setBytes(b, m)
		let outI = 0
		let shift = 0
		this.setSize(m.limbs.length)
		for (let i = b.length - 1; i >= 0; i--) {
			const bi = b[i]
			this.limbs[outI] |= BigInt(bi) << BigInt(shift)
			shift += 8
			if (shift >= _W) {
				shift -= _W
				this.limbs[outI] &= _MASK
				const overflow = bi >> (8 - shift)
				outI++
				if (outI >= this.limbs.length) {
					if (overflow > 0 || i > 0) {
						throw new ServeRunTimeError(-8, "pkcs1v15 verify signature error")
					}
					break
				}
				this.limbs[outI] = BigInt(overflow)
			}
		}
		// x.cmpGeq(m.nat)
		if (this.cmpGeq(m) === 1n) throw new ServeRunTimeError(-8, "pkcs1v15 verify signature error")
		return this
	}

	set(x: Nat): Nat {
		this.limbs = x.limbs
		return this
	}

	montgomeryRepresentation(m: Modules): Nat {
		return this.montgomeryMul(new Nat().set(this), m.rr, m);
	}

	exp(x: Nat, e: Buffer, m: Modules): Nat {
		const table = [
			new Nat(), new Nat(), new Nat(), new Nat(), new Nat(),
			new Nat(), new Nat(), new Nat(), new Nat(), new Nat(),
			new Nat(), new Nat(), new Nat(), new Nat(), new Nat()
		]
		table[0].set(x).montgomeryRepresentation(m)
		for (let i = 1; i < table.length; i++) {
			table[i].montgomeryMul(table[i - 1], table[0], m)
		}
		this.limbs = new BigUint64Array(m.nat.limbs.length)
		this.limbs[0] = 1n
		this.montgomeryRepresentation(m)
		const t0 = new Nat().setSize(m.nat.limbs.length)
		const t1 = new Nat().setSize(m.nat.limbs.length)
		for (let b of e) {
			for (let j of [4, 0]) {
				t1.montgomeryMul(this, this, m)
				this.montgomeryMul(t1, t1, m)
				t1.montgomeryMul(this, this, m)
				this.montgomeryMul(t1, t1, m)

				const k = BigInt((b >> j) & 0b1111)
				for (let i in table) {
					t0.assign(ctEq(k, BigInt(i + 1)), table[i])
				}

				t1.montgomeryMul(this, t0, m)
				this.assign(1n ^ ctEq(k, 0n), t1)
			}
		}

		return this.montgomeryReduction(m)
	}

	montgomeryMul(a: Nat, b: Nat, m: Modules): Nat {
		this.limbs = new BigUint64Array(m.nat.limbs.length)
		if (a.limbs.length != m.nat.limbs.length || b.limbs.length != m.nat.limbs.length) {
			throw new ServeRunTimeError(-8, "invalid montgomeryMul input")
		}
		const overflow = montgomeryLoop(this.limbs, a.limbs, b.limbs, m.nat.limbs, m.m0inv)
		const underflow = 1n ^ this.cmpGeq(m.nat)
		const needSubtraction = ctEq(overflow, underflow)
		this.sub(needSubtraction, m.nat)

		return this
	}

	montgomeryReduction(m: Modules): Nat {
		const t0 = new Nat().set(this)
		const t1 = new Nat().setSize(m.nat.limbs.length)
		t1.limbs[0] = 1n
		return this.montgomeryMul(t0, t1, m)
	}

	sub(on: bigint, y: Nat) {
		let c = 0n
		const size = this.limbs.length
		for (let i = 0; i < size; i++) {
			const res = Uint64(this.limbs[i] - y.limbs[i] - c)
			this.limbs[i] = ctSelect(on, res & _MASK, this.limbs[i])
			c = res >> BigInt(_W)
		}
		return
	}

	cmpGeq(y: Nat): bigint {
		const size = this.limbs.length
		let c = BigInt(0)
		for (let i = 0; i < size; i++) {
			c = Uint64(this.limbs[i] - y.limbs[i] - c) >> BigInt(_W)
		}
		return 1n ^ c
	}

	assign(on: bigint, y: Nat): Nat {
		const size = this.limbs.length
		for (let i = 0; i < size; i++) {
			this.limbs[i] = ctSelect(on, y.limbs[i], this.limbs[i])
		}
		return this
	}
}

export interface Modules {
	nat: Nat
	leading: number
	m0inv: bigint
	rr: Nat
}