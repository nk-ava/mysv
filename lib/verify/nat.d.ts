/// <reference types="node" />
export interface Nat {
    limbs: Uint32Array | BigUint64Array;
}
export declare class Nat {
    setBig(n: Buffer): void;
    reset(n: number): void;
}
