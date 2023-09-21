"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServe = exports.Serve = exports.ServeRunTimeError = void 0;
const log4js = __importStar(require("log4js"));
const crypto_1 = __importDefault(require("crypto"));
const axios_1 = __importDefault(require("axios"));
const common_1 = require("./common");
const express_1 = __importDefault(require("express"));
const node_events_1 = __importDefault(require("node:events"));
const parser_1 = __importDefault(require("./parser"));
const body_parser_1 = __importDefault(require("body-parser"));
const form_data_1 = __importDefault(require("form-data"));
const fs_1 = __importDefault(require("fs"));
class ServeRunTimeError {
    constructor(code, message = "unknown") {
        this.code = code;
        this.message = message;
        this.code = code;
        this.message = message;
    }
}
exports.ServeRunTimeError = ServeRunTimeError;
class Serve extends node_events_1.default {
    constructor(props) {
        super();
        this.config = {
            level: 'info',
            port: 8081,
            host: 'localhost',
            ...props
        };
        this.mhyHost = "https://bbs-api.miyoushe.com";
        this.application = (0, express_1.default)();
        this.host = props.host || 'localhost';
        this.port = props.port || 8081;
        this.pubKey = crypto_1.default.createPublicKey(props.pub_key);
        this.enSecret = this.encryptSecret();
        this.logger = log4js.getLogger(`[BOT_ID:${this.config.bot_id}]`);
        this.logger.level = this.config.level;
        this.configApplication();
        this.startServe();
        (0, common_1.lock)(this, "enSecret");
        (0, common_1.lock)(this, "config");
    }
    /** 配置application */
    configApplication() {
        /** 解析json */
        this.application.use(body_parser_1.default.json());
        this.application.use(express_1.default.urlencoded({ extended: true }));
        /** 解决跨域 */
        this.application.all("*", (req, res, next) => {
            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Headers", "Content-Type");
            res.header("Access-Control-Allow-Method", "*");
            res.header("Content-Type", "application/json; charset=utf-8");
            next();
        });
    }
    /** 启动服务 */
    startServe() {
        this.application.listen(this.port, this.host, () => {
            this.logger.info(`服务已成功启动，服务地址：http://${this.host}:${this.port}`);
            this.watchPath();
            this.emit("online");
        });
    }
    /** 加密secret */
    encryptSecret() {
        const hmac = crypto_1.default.createHmac("sha256", Buffer.from(this.config.pub_key));
        hmac.update(this.config.secret);
        return hmac.digest("hex");
    }
    /** 签名验证 */
    verifySign(body, sign) {
        if (!(body instanceof String)) {
            body = JSON.stringify(body);
        }
        const str = `body=${encodeURI(body)}&secret=${this.config.secret}`;
        const d = crypto_1.default.createHash("sha256").update(str).digest("hex");
        return true;
    }
    /** 获取大别野信息 */
    async getVillaInfo(villa_id) {
        const path = "/vila/api/bot/platform/getVilla";
        return await this.fetchResult(villa_id, path, 'get', "");
    }
    /** 获取用户信息 */
    async getUserInfo(villa_id, uid) {
        const path = "/vila/api/bot/platform/getMember";
        return await this.fetchResult(villa_id, path, 'get', `?uid=${uid}`);
    }
    /** 获取大别野成员列表 */
    async getVillaUsers(villa_id, size, offset_str = "") {
        const path = "/vila/api/bot/platform/getVillaMembers";
        return await this.fetchResult(villa_id, path, 'get', `?offset_str=${offset_str}&size=${size}`);
    }
    /** 提出大别野用户 */
    async kickUser(villa_id, uid) {
        const path = "/vila/api/bot/platform/deleteVillaMember";
        return await this.fetchResult(villa_id, path, "post", "", { uid: uid });
    }
    /** 置顶消息 */
    async pinMessage(villa_id, msg_id, is_cancel, room_id, send_time) {
        const path = "/vila/api/bot/platform/pinMessage";
        return await this.fetchResult(villa_id, path, 'post', "", {
            msg_id: msg_id,
            is_cancel: is_cancel,
            room_id: room_id,
            send_time: send_time
        });
    }
    /** 撤回消息 */
    async recallMessage(villa_id, msg_id, room_id, msg_time) {
        const path = "/vila/api/bot/platform/recallMessage";
        return await this.fetchResult(villa_id, path, 'get', `?msg_id=${msg_id}&room_id=${room_id}&msg_time=${msg_time}`);
    }
    /** 创建分组 */
    async createGroup(villa_id, group_name) {
        return this.fetchResult(villa_id, "/vila/api/bot/platform/createGroup", "post", "", {
            group_name: group_name
        });
    }
    /** 编辑分组，只允许编辑分组名称 */
    async editGroup(villa_id, group_id, group_name) {
        return this.fetchResult(villa_id, "/vila/api/bot/platform/editGroup", "post", "", {
            group_id: group_id,
            group_name: group_name
        });
    }
    /** deleteGroup，删除分组 */
    async deleteGroup(villa_id, group_id) {
        return this.fetchResult(villa_id, "/vila/api/bot/platform/deleteGroup", "post", "", {
            group_id: group_id
        });
    }
    /** 获取分组列表 */
    async getGroupList(villa_id) {
        return this.fetchResult(villa_id, "/vila/api/bot/platform/getGroupList", "get", "");
    }
    /** 编辑房间，只支持编辑名称 */
    async editRoom(villa_id, room_id, room_name) {
        return this.fetchResult(villa_id, "/vila/api/bot/platform/editRoom", "post", "", {
            room_id: room_id,
            room_name: room_name
        });
    }
    /** 删除房间 */
    async deleteRoom(villa_id, room_id) {
        return this.fetchResult(villa_id, "/vila/api/bot/platform/deleteRoom", "post", "", {
            room_id: room_id
        });
    }
    /** 获取房间信息 */
    async getRoom(villa_id, room_id) {
        return this.fetchResult(villa_id, "/vila/api/bot/platform/getRoom", "get", `?room_id=${room_id}`);
    }
    /** 获取别野房间列表信息 */
    async getVillaRoomList(villa_id) {
        return this.fetchResult(villa_id, "/vila/api/bot/platform/getVillaGroupRoomList", "get", "");
    }
    /** 向身份组操作用户 */
    async operateMember(villa_id, role_id, uid, is_add) {
        return this.fetchResult(villa_id, "/vila/api/bot/platform/operateMemberToRole", "post", "", {
            role_id: role_id,
            uid: uid,
            is_add: is_add
        });
    }
    /** 创建身份组 */
    async createRole(villa_id, name, color, permissions) {
        return this.fetchResult(villa_id, "/vila/api/bot/platform/createMemberRole", "post", "", {
            name: name,
            color: color,
            permissions: permissions
        });
    }
    /** 编辑身份组 */
    async editRole(villa_id, id, name, color, permissions) {
        return this.fetchResult(villa_id, "/vila/api/bot/platform/editMemberRole", "post", "", {
            id: id,
            name: name,
            color: color,
            permissions: permissions
        });
    }
    /** 删除身份组 */
    async deleteRole(villa_id, id) {
        return this.fetchResult(villa_id, "/vila/api/bot/platform/deleteMemberRole", "post", "", {
            id: id
        });
    }
    /** 获取身份组 */
    async getRole(villa_id, role_id) {
        return this.fetchResult(villa_id, "/vila/api/bot/platform/getMemberRoleInfo", "get", `?role_id=${role_id}`);
    }
    /** 获取大别野所有身份组 */
    async getVillaRoles(villa_id) {
        return this.fetchResult(villa_id, "/vila/api/bot/platform/getVillaMemberRoles", "get", "");
    }
    /** 获取全部表情信息 */
    async getAllEmoticon(villa_id) {
        return this.fetchResult(villa_id, "/vila/api/bot/platform/getAllEmoticons", "get", "");
    }
    /** 提交审核，如果送审图片，需先调用转存接口，将转存后的URL填充到audit_content中 */
    async submitAudit(villa_id, content, room_id, uid, text, pt = "") {
        const { data } = await axios_1.default.post(`${this.mhyHost}/vila/api/bot/platform/audit`, {
            audit_content: content,
            pass_through: pt,
            room_id: room_id,
            uid: uid,
            content_type: text ? "AuditContentTypeText" : "AuditContentTypeImage"
        }, {
            headers: {
                "x-rpc-bot_id": this.config.bot_id,
                "x-rpc-bot_secret": this.enSecret,
                "x-rpc-bot_villa_id": villa_id,
                "Content-Type": "application/json"
            }
        });
        return data.data;
    }
    /** 图片转存，只能转存又网络地址的图片，上传图片请配置mys_ck调用上传接口 */
    async transferImage(villa_id, url) {
        return this.fetchResult(villa_id, "/vila/api/bot/platform/transferImage", "post", "", {
            url: url
        });
    }
    /** 发送消息 */
    async sendMsg(room_id, villa_id, content, quote) {
        const { message, obj_name } = await this._convert(content);
        if (quote) {
            message.quote = {
                quoted_message_id: quote.message_id,
                quoted_message_send_time: quote.send_time,
                original_message_id: quote.message_id,
                original_message_send_time: quote.send_time
            };
        }
        const path = "/vila/api/bot/platform/sendMessage";
        const body = {
            "room_id": room_id,
            "object_name": obj_name,
            "msg_content": JSON.stringify(message)
        };
        const { data } = await axios_1.default.post(`${this.mhyHost}${path}`, body, {
            headers: {
                "x-rpc-bot_id": this.config.bot_id,
                "x-rpc-bot_secret": this.enSecret,
                "x-rpc-bot_villa_id": villa_id,
                "Content-Type": "application/json"
            }
        });
        return data;
    }
    async _convert(msg) {
        let offset = 0;
        let obj_name;
        if (!Array.isArray(msg))
            msg = [msg];
        const entities = new Array();
        let t = "";
        let mention = { type: 0, userIdList: [] };
        for (let m of msg) {
            if (typeof m === 'string')
                m = { type: 'text', text: m };
            if (typeof obj_name === "undefined") {
                if (["text", "at", "link", "linkRoom"].includes(m.type))
                    obj_name = "MHY:Text";
                else if (["image"].includes(m.type))
                    obj_name = "MHY:Image";
                else if (["post"].includes(m.type))
                    obj_name = "MHY:Post";
                else
                    throw new ServeRunTimeError(-2, "未知的消息类型");
            }
            if (obj_name !== "MHY:Text" && msg.length > 1) {
                obj_name = undefined;
                continue;
            }
            switch (m.type) {
                case "text":
                    t += m.text;
                    offset += m.text.length;
                    break;
                case "at":
                    switch (m.scope) {
                        case "user":
                            t += `@${m.nickname || '你猜我at的谁'} `;
                            if (typeof m.uid !== 'string')
                                m.uid = String(m.uid);
                            entities.push({
                                entity: {
                                    type: "mentioned_user",
                                    user_id: m.uid
                                },
                                offset: offset,
                                length: (m.nickname || '你猜我at的谁').length + 2
                            });
                            offset += (m.nickname || '你猜我at的谁').length + 2;
                            if (!mention.type) {
                                mention.type = 2;
                                mention.userIdList.push(m.uid);
                            }
                            break;
                        case "all":
                            t += `@全体成员 `;
                            entities.push({
                                entity: {
                                    type: 'mentioned_all'
                                },
                                offset: offset,
                                length: 6
                            });
                            offset += 6;
                            mention.type = 1;
                            break;
                        case "bot":
                            t += `@${m.nickname || '你猜我at的谁'}`;
                            if (typeof m.bid !== 'string')
                                m.bid = String(m.bid);
                            entities.push({
                                entity: {
                                    type: "mentioned_robot",
                                    bot_id: m.bid
                                },
                                offset: offset,
                                length: (m.nickname || '你猜我at的谁').length + 2
                            });
                            offset += (m.nickname || '你猜我at的谁').length + 2;
                            if (!mention.type) {
                                mention.type = 2;
                                mention.userIdList.push(m.uid);
                            }
                            break;
                    }
                    break;
                case "link":
                    t += m.url;
                    entities.push({
                        entity: {
                            type: "link",
                            url: m.url,
                            requires_bot_access_token: m.ac_tk || false
                        },
                        offset: offset,
                        length: m.url.length
                    });
                    offset += m.url.length;
                    break;
                case "linkRoom":
                    t += `#${m.room_name || '这个房间'} `;
                    entities.push({
                        entity: {
                            type: 'villa_room_link',
                            villa_id: `${m.vid}`,
                            room_id: `${m.rid}`
                        },
                        offset: offset,
                        length: `#${m.room || '这个房间'} `.length
                    });
                    offset += `#${m.room || '这个房间'} `.length;
                    break;
                case "image":
                    if (msg.length > 1)
                        break;
                    let img = {
                        url: await this.uploadImage(m.url)
                    };
                    if (m.width && m.height)
                        img.size = { width: m.width, height: m.height };
                    if (m.file_size)
                        img.file_size = m.file_size;
                    return {
                        message: {
                            content: img
                        }, obj_name
                    };
                case "post":
                    if (msg.length > 1)
                        break;
                    if (typeof m.post_id !== 'string')
                        m.post_id = String(m.post_id);
                    return {
                        message: {
                            content: {
                                post_id: m.post_id
                            }
                        }, obj_name
                    };
            }
        }
        return {
            message: {
                content: {
                    text: t,
                    entities: entities
                },
                mentionedInfo: mention.type === 0 ? {} : mention
            }, obj_name
        };
    }
    watchPath() {
        if (!this.config.callback_url)
            throw new ServeRunTimeError(-6, "未配置回调地址");
        const url = new URL(this.config.callback_url);
        this.application.post(url.pathname, (req, res) => {
            const event = req.body;
            /** 验证签名后面再补 */
            // if (this.verifySign(event, req.header("x-rpc-bot_sign") || "")) {
            const parser = new parser_1.default(this, event.event);
            const events = parser.doParse();
            for (let e of events) {
                this.emit(parser.event_type, e);
                // }
            }
            res.status(200);
            res.setHeader("Content-Type", "application/json");
            res.send({ "message": "", "retcode": 0 });
            res.end();
        });
    }
    async fetchResult(villa_id, path, method, query, body = undefined) {
        const { data } = await (0, axios_1.default)(`${this.mhyHost}${path}${query}`, {
            method: method,
            data: body,
            headers: {
                "x-rpc-bot_id": this.config.bot_id,
                "x-rpc-bot_secret": this.enSecret,
                "x-rpc-bot_villa_id": villa_id,
                "Content-Type": "application/json"
            }
        });
        return data.data;
    }
    async uploadImage(url) {
        if (url.startsWith("https://") || url.startsWith("http://"))
            return url;
        try {
            const readable = fs_1.default.createReadStream(url);
            const ext = url.match(/\.\w+$/)?.[0]?.slice(1);
            const { message, data } = await this._uploadImage(readable, ext);
            if (!data)
                throw new ServeRunTimeError(-4, message);
            return data.url;
        }
        catch (e) {
            throw new ServeRunTimeError(e.code || -5, e.message);
        }
    }
    async _uploadImage(readable, e) {
        if (!this.config.mys_ck)
            throw new ServeRunTimeError(-3, "未配置mys_ck，无法调用上传接口");
        if (!readable.readable)
            throw new ServeRunTimeError(-1, "The first argument is not readable stream");
        const ext = e || 'png';
        const file = await (0, common_1.md5Stream)(readable);
        const md5 = file.md5.toString("hex");
        const { data } = await axios_1.default.get(`https://bbs-api.miyoushe.com/apihub/sapi/getUploadParams?md5=${md5}&ext=${ext}&support_content_type=1&upload_source=1`, {
            headers: {
                "cookie": this.config.mys_ck
            }
        });
        if (!data.data)
            return data;
        const param = data.data;
        const form = new form_data_1.default();
        form.append("x:extra", param.params['callback_var']['x:extra']);
        form.append("OSSAccessKeyId", param.params.accessid);
        form.append("signature", param.params.signature);
        form.append("success_action_status", '200');
        form.append("name", param.file_name);
        form.append("callback", param.params.callback);
        form.append("x-oss-content-type", param.params.x_oss_content_type);
        form.append("key", param.file_name);
        form.append("policy", param.params.policy);
        form.append("file", file.buff, { filename: param.params.name });
        return (await axios_1.default.post(param.params.host, form, {
            headers: { ...form.getHeaders(), "Connection": 'Keep-Alive', "Accept-Encoding": "gzip" }
        })).data;
    }
}
exports.Serve = Serve;
/** 创建一个服务 */
function createServe(props) {
    return new Serve(props);
}
exports.createServe = createServe;
