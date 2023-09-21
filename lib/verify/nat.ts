const UintSize = 32 << (~0 >>> 63)
const _W = UintSize - 1
const _MASK = (1 << _W) - 1

export interface Nat {
	limbs: Uint32Array | BigUint64Array
}

export class Nat {

	setBig(n: Buffer) {
		const requiredLimbs = (n.length * 8 + _W - 1) / _W
		this.reset(requiredLimbs)
	}

	reset(n: number) {
		if (this.limbs.length < n) {
			if (UintSize === 64) {
				this.limbs = new BigUint64Array(n)
			} else {
				this.limbs = new Uint32Array(n)
			}
			return
		}

	}
}