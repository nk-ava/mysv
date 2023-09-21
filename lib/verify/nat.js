"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Nat = void 0;
const UintSize = 32 << (~0 >>> 63);
const _W = UintSize - 1;
const _MASK = (1 << _W) - 1;
class Nat {
    setBig(n) {
        const requiredLimbs = (n.length * 8 + _W - 1) / _W;
        this.reset(requiredLimbs);
    }
    reset(n) {
        if (this.limbs.length < n) {
            if (UintSize === 64) {
                this.limbs = new BigUint64Array(n);
            }
            else {
                this.limbs = new Uint32Array(n);
            }
            return;
        }
    }
}
exports.Nat = Nat;
