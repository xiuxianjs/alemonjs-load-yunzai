/**
 * AlemonJS ↔ Yunzai Worker 进程间通信协议
 *
 * 使用 Node.js child_process.fork() 的内置 IPC 通道
 * 消息格式全部为可 JSON 序列化的对象
 *
 * 设计原则：
 *   - 通用字段覆盖所有平台（AlemonJS 标准化的数据）
 *   - rawEvent 透传 OneBot 原始事件（仅 QQ/OneBot 平台有）
 *   - Worker 侧优先使用 rawEvent，无则用通用字段降级构建
 */

// ─────────── 父进程 → Worker ───────────

/** 跨平台媒体附件 */
export interface IPCMedia {
  type: 'image' | 'audio' | 'video' | 'file' | 'sticker';
  url?: string;
  fileId?: string;
  fileName?: string;
}

/** 转发消息事件给 Worker */
export interface IPCEventMessage {
  type: 'event';
  /** 唯一消息 ID，用于关联回复 */
  id: string;
  data: {
    // ── 来源平台 ──
    /** 平台标识: 'qq' | 'discord' | 'telegram' | 'kook' | ... */
    platform: string;
    /** 接收消息的 Bot ID */
    botId: string;

    // ── 消息内容 ──
    messageText: string;
    /** 平台侧消息 ID（用于引用回复） */
    messageId: string;
    /** 附带的媒体文件（图片/语音/视频等，所有平台通用） */
    media: IPCMedia[];

    // ── 用户信息 ──
    userId: string;
    userName: string;
    userAvatar: string;

    // ── 会话信息 ──
    /** 群/服务器/频道 ID */
    spaceId: string;
    isPrivate: boolean;

    // ── 权限 ──
    isMaster: boolean;

    // ── OneBot 原始事件（仅 QQ/OneBot 平台） ──
    /** 完整的 OneBot 标准事件对象，包含 message 段、sender 详情等 */
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

/** Worker 通知父进程 deal() 已完成（无论是否匹配到插件） */
export interface IPCDone {
  type: 'done';
  /** 对应的消息 ID */
  id: string;
  /** 是否有插件调用了 reply */
  replied: boolean;
}

export type WorkerToParent = IPCReady | IPCReply | IPCError | IPCLog | IPCDone;

// ─────────── 共享类型 ───────────

/** 序列化后的回复内容 */
export interface ReplyContent {
  type: 'text' | 'image' | 'at' | 'face' | 'forward' | 'other';
  /** 文本内容 / base64 图片 / JSON 数据 */
  data: string;
}
