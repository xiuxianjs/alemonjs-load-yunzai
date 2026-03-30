export interface IPCMedia {
    type: 'image' | 'audio' | 'video' | 'file' | 'sticker';
    url?: string;
    fileId?: string;
    fileName?: string;
}
export interface IPCEventMessage {
    type: 'event';
    id: string;
    data: {
        platform: string;
        botId: string;
        messageText: string;
        messageId: string;
        media: IPCMedia[];
        userId: string;
        userName: string;
        userAvatar: string;
        spaceId: string;
        isPrivate: boolean;
        isMaster: boolean;
        rawEvent?: any;
    };
}
export interface IPCShutdown {
    type: 'shutdown';
}
export type ParentToWorker = IPCEventMessage | IPCShutdown;
export interface IPCReady {
    type: 'ready';
    pluginCount: number;
}
export interface IPCReply {
    type: 'reply';
    id: string;
    contents: ReplyContent[];
}
export interface IPCError {
    type: 'error';
    message: string;
}
export interface IPCLog {
    type: 'log';
    level: 'info' | 'warn' | 'error' | 'debug';
    args: string[];
}
export interface IPCDone {
    type: 'done';
    id: string;
    replied: boolean;
}
export type WorkerToParent = IPCReady | IPCReply | IPCError | IPCLog | IPCDone;
export interface ReplyContent {
    type: 'text' | 'image' | 'at' | 'face' | 'forward' | 'other';
    data: string;
}
