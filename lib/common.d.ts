/// <reference types="node" />
/// <reference types="node" />
import stream from "stream";
/** 隐藏并锁定一个属性 */
export declare function lock(obj: any, prop: string): void;
/** 获取流的MD5值和buffer */
export declare function md5Stream(readable: stream.Readable): Promise<{
    buff: Buffer;
    md5: Buffer;
}>;
