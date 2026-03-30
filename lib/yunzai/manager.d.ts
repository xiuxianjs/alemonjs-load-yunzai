import type { IPCReply, ParentToWorker } from './protocol';
type ReplyHandler = (reply: IPCReply) => void;
declare class YunzaiManager {
    private worker;
    private ready;
    private replyHandlers;
    private restartCount;
    private maxRestarts;
    get isInstalled(): boolean;
    get isRunning(): boolean;
    get isReady(): boolean;
    getStatus(): string;
    install(repoUrl?: string): Promise<void>;
    update(): Promise<string>;
    start(): Promise<void>;
    stop(): Promise<void>;
    restart(): Promise<void>;
    send(msg: ParentToWorker): void;
    onReply(handler: ReplyHandler): () => void;
    private handleMessage;
    private git;
    private npmInstall;
    installDeps(): Promise<string>;
    private ensureWorkspaces;
}
export declare const manager: YunzaiManager;
export {};
