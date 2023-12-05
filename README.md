# mysv

米游社大别野机器人js-sdk

* 基于[大别野开发文档](https://webstatic.mihoyo.com/vila/bot/doc/changelog/) 实现的js-sdk
* 支持大部分接口调用
* 若报错format: jwk可能是node版本太低，已知node14不支持，node16支持

---

**Install:**

```bash
> npm install mysv
```

**Usage:**

```js
const {createServe} = require("./lib")

const app = createServe({
    bot_id: 'bot_id',
    secret: 'secret',
    pub_key: '-----BEGIN PUBLIC KEY-----\n' +
        '-----END PUBLIC KEY-----',
    callback_path: "/events"
})

app.on("online", async () => {
    app.logger.info("上线成功！！！")
})

app.on("sendMessage", async (e) => {
    // 事件处理
})

process.on("unhandledRejection", error => {
    app.logger.error(error)
})
```

**事件类型：**
> 米游社回调事件

|    Event        |      Description      |
|-----------------|-----------------------|
|online|启动成功|
|joinVilla|新成员加入别野|
|sendMessage|发送消息|
|createRobot|机器人被加入别野|
|deleteRobot|机器人被移出别野|
|auditCallback|审核回调|
|addQuickEmoticon|用户快捷表情回复|
|clickMsgComponent|点击组件事件|

##### 其它

* 我的别野ID：`FZJkxKs`,有问题可以到这里反馈