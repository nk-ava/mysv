"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPublicKey = exports.verifyPKCS1v15 = void 0;
/**
 * rsa-sha256-pkcs1v15验证签名
 */
const stream_1 = require("stream");
const prefix = [0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00, 0x04, 0x20];
const hashLen = 32;
function verifyPKCS1v15(hashed, signature) {
    const tLen = prefix.length + hashLen;
}
exports.verifyPKCS1v15 = verifyPKCS1v15;
function createPublicKey(raw) {
    const { data, s, e } = formatKey(raw);
    const b = Buffer.from(data.slice(s, e).toString(), "base64");
}
exports.createPublicKey = createPublicKey;
function formatKey(raw) {
    raw = raw.replace("-----BEGIN PUBLIC KEY-----", "")
        .replace("-----END PUBLIC KEY-----", "")
        .replace(/\s/g, "")
        .replace(/\n/g, "")
        .replace(/\r/g, "")
        .replace(/\t/g, "");
    const sl = raw.length;
    let c = Math.floor(sl / 64);
    if (sl % 64 > 0)
        c = c + 1;
    const writer = new stream_1.PassThrough();
    writer.write(Buffer.from("-----BEGIN PUBLIC KEY-----\n"));
    const start = 27;
    for (let i = 0; i < c; i++) {
        let b = i * 64;
        let e = b + 64;
        if (e > sl) {
            writer.write(Buffer.from(raw.slice(b)));
        }
        else {
            writer.write(Buffer.from(raw.slice(b, e)));
        }
        writer.write("\n");
    }
    writer.write("-----END PUBLIC KEY-----");
    const data = writer.read();
    const end = data.length - 25;
    return { data: data, s: start, e: end };
}
