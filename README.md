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
const {createServe} = require("mysv")

const app = createServe({
    bot_id: 'bot_id',
    secret: 'secret',
    ws: true,// 为true则优先ws
    villa_id: 0, //若机器人还没上线就要填测试别野id，否则无法使用ws
    pub_key: '-----BEGIN PUBLIC KEY-----\n' +
        '-----END PUBLIC KEY-----',
    callback_path: "/events"// ws为true可以不配
})

app.on("online", async () => {
    app.logger.info("上线成功！！！")
})

app.on("SendMessage", async (e) => {
    // 事件处理
    e.reply([{
        type: 'text',
        text: '文本消息',
        style: 'buis'
    },{
        type: "at",
        id: 288321425,
        style: 'b'
    },{
        type: 'button',
        id: '组件消息',
        text: '组件消息'
    }])
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
|JoinVilla|新成员加入别野|
|SendMessage|发送消息|
|CreateRobot|机器人被加入别野|
|DeleteRobot|机器人被移出别野|
|AuditCallback|审核回调|
|AddQuickEmoticon|用户快捷表情回复|
|ClickMsgComponent|点击组件事件|

##### 其它

* 我的别野ID：`FZJkxKs`,有问题可以到这里反馈