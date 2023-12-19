# mysv

米游社大别野机器人js-sdk

* 基于[大别野开发文档](https://webstatic.mihoyo.com/vila/bot/doc/changelog/) 实现的js-sdk
* 支持大部分接口调用
* 支持网页版的正常收发消息功能
* 若报错format: jwk可能是node版本太低，已知node14不支持，node16支持

---

**Install:**

```bash
> npm install mysv
```

**Usage:**

```js
const {createBot, createUClient, fromMCode, segment} = require("./lib")

const app = createBot({
    bot_id: '',
    secret: '',
    ws: true,
    villa_id: 0,                              //上线机器人可以填0，没有上线的要填调试别野id
    pub_key: "-----BEGIN PUBLIC KEY-----\n" +
        "-----END PUBLIC KEY-----",
    callback_path: "/events",                 //回调路径
    mys_ck: ""                                //若为空则会要求扫码，但如果不配置则不会要扫码
})

const client = createUClient({
    uid: 123456789,              //用户登入时必须配置uid
    mys_ck: "",                  //可以不填，不填则会扫码登入，也可到网页中自己获取cookie填入
    ignore_self: true,           //是否忽略自己的消息，默认为true
})

/**
 * UClient监听事件处理
 */

client.on("online", () => {
    client.logger.info("登入成功！！！")
})

client.on("message", e => {
    console.log(e)
})

/**
 * Bot监听事件处理
 */

app.on("online", () => {
    app.logger.info("上线成功！！！")
})

app.on("SendMessage", e => {
    e.reply([
        segment.at("all"),
        segment.text("你好"),
        segment.image("https://iw233.cn/api.php?sort=random")
    ], true) //true表示属于回复消息
})

app.on("JoinVilla", e => {
    console.log(e)
})

app.on("DeleteRobot", e => {
    console.log(e)
})

app.on("CreateRobot", e => {
    console.log(e)
})

app.on("ClickMsgComponent", e => {
    console.log(e)
})

app.on("AddQuickEmoticon", e => {
    console.log(e)
})

app.on("AuditCallback", e => {
    console.log(e)
})

/**
 * 未捕获的异常处理
 */

process.on("unhandledRejection", error => {
    app.logger.error(error)
})

process.on("uncaughtException", error => {
    app.logger.error(error)
})
```

**事件类型：**
> Bot回调事件

|    Event        |      Description      |
|-----------------|-----------------------|
|online|启动成功|
|JoinVilla|新成员加入别野|
|SendMessage|发送消息|
|CreateRobot|机器人被加入别野|
|DeleteRobot|机器人被移出别野|
|AuditCallback|审核回调|
|AddQuickEmoticon|用户快捷表情回复|
|ClickMsgComponent|点击组件事件|

> UClient回调事件

|Event|Description|
|-----|-----------|
|online|登入成功|
|message|接收消息事件|

##### 其它

* 我的别野ID：`FZJkxKs`,有问题可以到这里反馈