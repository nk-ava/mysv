# 1.0.17

#### 2024.1.2

* feat: 新增通知事件
    * `notice.userJoin` 用户加入事件
    * `notice.joinResult` 加入别野申请的结果，只有加入的别野需要审核才会有此事件
    * `notice.bannedFrom` 自己被移出别野

* feat: 新增加入别野和退出别野方法

#### 2023.12.31

* feat: 支持获取别野信息，成员信息，分组信息，房间信息

#### 2023.12.29

* fix：修复房间链接图标显示不正确
* feat: 用户消息事件添加atme字段
* fix: 修复bot在使用ws建连是还未登入就触发online事件

# 1.0.16

### 2023.12.28

* fix: 修复已知bug

#### 2023.12.25

* feat: 跟进[开发文档](https://webstatic.mihoyo.com/vila/bot/doc/changelog/) ，http和ws的quote_msg增加images字段。
* feat: 修改消息

# v1.0.15

***

#### 2023.12.24

* feat: 接收和发送私聊消息
* feat: 支持密码和验证码登入，密码验证码登入获得的cookie更全，包括stoken
* fix：修复已知问题

#### 2023.12.22

* feat: 支持解析和发送更多消息类型

# v1.0.14

***

#### 2023.12.20

* feat: 支持撤回消息
* beta: 发送表情包

#### 2023.12.19

* feat: 新建消息事件类型
* feat: 网页端实现正常的收发消息
* fix: 修复出现的不能接收消息的情况

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