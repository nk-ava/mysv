# v1.0.14-SNAPSHOT

***

#### 2023.12.19

* feat: 新建消息事件类型
* feat: 网页端实现正常的收发消息

# v1.0.13

***

#### 2023.12.18

* feat: 实现网页端登入
* feat: 支持读取消息，触发`message`事件
* future: 支持更多事件和发送消息

#### 2023.12.16

* feat: 获取历史聊天内容api

#### 2023.12.15

* feat: 支持扫码登入自动获取mys_ck
* beta: cookie的有效期不知道多久
* beta: 大别野用户登入

#### 2023.12.14

* fix: 修改了米游社上传接口的使用时机，修复因官方上传接口调用失败而导致图片发送失败
* fix: 临时文件因报错而没有删除

#### 2023.12.11

* feat: 新增`plink`消息类型
* feat: 新增`badge`消息类型
* fix: 修复ws回调时调用`Bot.logout`登出失败

# v1.0.12

***

* fix: `JoinVilla`事件再触发时日志输出用户名unknown
* fix: ws回调时，uint64格式的整数都是字符串
* feat: 断网重连时请求ws参数时报错重新请求，不会直接退出
* fix: 修复回复大别野专属表情时，`AddQuickEmoticon`事件日志输出undefined
* feat: 新增审核函数`submitAuditSync`，提交审核并等待结果
* feat: 新增导出[`segmet`](https://github.com/nk-ava/mysv/blob/main/lib/element.ts) 用于快速构建发送消息