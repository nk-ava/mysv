"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.md5Stream = exports.lock = void 0;
const crypto_1 = __importDefault(require("crypto"));
/** 隐藏并锁定一个属性 */
function lock(obj, prop) {
    Reflect.defineProperty(obj, prop, {
        configurable: false,
        enumerable: false,
        writable: false,
    });
}
exports.lock = lock;
/** 获取流的MD5值和buffer */
function md5Stream(readable) {
    let buff = Buffer.alloc(0);
    const md5 = crypto_1.default.createHash("md5");
    return new Promise((resolve, reject) => {
        readable.on("error", reject);
        readable.on("data", chunk => {
            buff = Buffer.concat([buff, chunk]);
            md5.update(chunk);
        });
        readable.on("end", () => {
            resolve({
                buff: buff,
                md5: md5.digest()
            });
        });
    });
}
exports.md5Stream = md5Stream;
