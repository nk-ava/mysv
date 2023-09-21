const {createServe} = require("./lib")

const app = createServe({
    bot_id: 'bot_OoObYUgxaD3FatXxR2GC',
    secret: 'lDjzsC3E9wM3V5ZaRYs0mAAKKB6AYc8CdyjMrv2M56ADt',
    pub_key: '-----BEGIN PUBLIC KEY-----\n' +
        'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDOVNSS6YQZGYQdKf00pId0r74T\n' +
        'k14mmNybdxO1RbwsVjHtQ8zGyLpWuEXQUOoR6bdvyRWG5qB6BpGkl/g8zAZ2E4QI\n' +
        'LLugiR3jEiPRisYGIP8fhb/n7H2c9NqfQ/e3HkJtViWGym8oMtAtiRu09dpsbRre\n' +
        '8gUDOiUOK11RszlkVQIDAQAB\n' +
        '-----END PUBLIC KEY-----',
    mys_ck: 'stuid=288321425; stoken=3ahiLVLqpV4NxyRjBcKdiwtoED5Pr8DVN3fJ6FSG;',
    callback_url: "http://ua4abx.natappfree.cc/events"
})

app.on("online", async () => {
    app.logger.info("上线成功！！！")
    // console.log(await app.sendMsg(120248, 6770, [{
    //     type: "image",
    //     url: "https://www.fwrdcn888.com/images/up/2023/September/091823_f_hp_01_r.jpg"
    // }]))
    // console.log(await app.kickUser(6770, 288321425))
})

app.on("sendMessage", async (e) => {
    // e.reply({type:"image",url: "C:/Users/Administrator/Pictures/a.png"})
    let msg = e.msg
    e.reply(JSON.parse(msg))
})

process.on("unhandledRejection", error => {
    app.logger.error(error)
})

// const {verifyPKCS1v15, createPublicKey} = require("./lib/verify/verify");
//
// const crypto = require("crypto")
//
// const public_key = "-----BEGIN PUBLIC KEY-----\n" +
//     "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0cwMSh/85Y8/79Y+jifW\n" +
//     "hq4TIL2QAl4KAAzGqP4702PNDYqChewAPmIzVqkml8BKmExd5QjxYnZmCtHmbOAa\n" +
//     "6LSy4Ihvfap4xef8V0iACUyZWdLCuV4lyZ7FcRsS9iQXkw7NxgD/RrYUPQajHNLn\n" +
//     "3JC6rr5VEFkHyi5i5Awzfh/V/ZecmqGS2h3U8czu7PrczC4XoKi9bffIIgOAyqrW\n" +
//     "LM2k5VGjEIUexCXkElt7l0FRF8jFxjARnTZhX0ZRhZoQKto3FdkcKqRv6VchMzh0\n" +
//     "6SJIptcsEAltjGv+1k0RGUD6BzjJzCvpaldNOkkWF+V6k2E3MTF169NGX0ZN5rHs\n" +
//     "vwIDAQAB\n" +
//     "-----END PUBLIC KEY-----";
// const s = crypto.createPublicKey(public_key)
// const p = s.export({format: 'jwk'})
// console.log(new Uint8Array(Buffer.from(p.n, "base64")))
// const b = Buffer.concat([Buffer.from([0x00]), Buffer.from(p.e, "base64")])
// console.log(b.readInt32BE())
// console.log(createPublicKey(public_key).length)

