/**
 * AlemonJS ↔ Yunzai Worker 进程间通信协议
 *
 * 使用 Node.js child_process.fork() 的内置 IPC 通道
 * 消息格式全部为可 JSON 序列化的对象
 */

// ─────────── 父进程 → Worker ───────────

/** 转发消息事件给 Worker */
export interface IPCEventMessage {
  type: 'event';
  /** 唯一消息 ID，用于关联回复 */
  id: string;
  data: {
    messageText: string;
    userId: string;
    userName: string;
    spaceId: string;
    isPrivate: boolean;
    isMaster: boolean;
    /** 原始 OneBot 标准事件对象（可选，来自 e.value） */
    rawEvent?: any;
  };
}

/** 通知 Worker 关闭 */
export interface IPCShutdown {
  type: 'shutdown';
}

export type ParentToWorker = IPCEventMessage | IPCShutdown;

// ─────────── Worker → 父进程 ───────────

/** Worker 初始化完成 */
export interface IPCReady {
  type: 'ready';
  pluginCount: number;
}

/** Worker 转发插件的回复消息 */
export interface IPCReply {
  type: 'reply';
  /** 对应的消息 ID */
  id: string;
  /** 回复内容列表（一次 reply 可能有多个 segment） */
  contents: ReplyContent[];
}

/** Worker 报告错误 */
export interface IPCError {
  type: 'error';
  message: string;
}

/** Worker 日志 */
export interface IPCLog {
  type: 'log';
  level: 'info' | 'warn' | 'error' | 'debug';
  args: string[];
}

export type WorkerToParent = IPCReady | IPCReply | IPCError | IPCLog;

// ─────────── 共享类型 ───────────

/** 序列化后的回复内容 */
export interface ReplyContent {
  type: 'text' | 'image' | 'at' | 'face' | 'forward' | 'other';
  /** 文本内容 / base64 图片 / JSON 数据 */
  data: string;
}
