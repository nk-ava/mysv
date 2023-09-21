import { JoinVilla, SendMessage, CreateBot, DeleteBot, AddQuickEmoticon, AuditCallback } from "./event";
import { Serve } from "./serve";
export type Events = JoinVilla | SendMessage | CreateBot | DeleteBot | AddQuickEmoticon | AuditCallback;
export default class Parser {
    event_type: string;
    private readonly baseEvent;
    private readonly event_data;
    private readonly c;
    constructor(c: Serve, event: any);
    doParse(): Array<Events>;
}
