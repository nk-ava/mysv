# v1.0.12

***

* fixed: `JoinVilla`事件再触发时日志输出用户名unknown
* fixed: ws回调时，uint64格式的整数都是字符串
* feat: 断网重连时请求ws参数时报错重新请求，不会直接退出
* fixed: 修复回复大别野专属表情时，`AddQuickEmoticon`事件日志输出undefined
* feat: 新增审核函数`submitAuditSync`，提交审核并等待结果
* feat: 新增导出[`segmet`](https://github.com/nk-ava/mysv/blob/main/lib/element.ts) 用于快速构建发送消息