export interface IPCEventMessage {
    type: 'event';
    id: string;
    data: {
        messageText: string;
        userId: string;
        userName: string;
        spaceId: string;
        isPrivate: boolean;
        isMaster: boolean;
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
export type WorkerToParent = IPCReady | IPCReply | IPCError | IPCLog;
export interface ReplyContent {
    type: 'text' | 'image' | 'at' | 'face' | 'forward' | 'other';
    data: string;
}
