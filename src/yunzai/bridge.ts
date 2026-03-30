/**
 * AlemonJS → Yunzai IPC 桥接
 *
 * 1. 捕获 AlemonJS 事件（消息、通知、请求等），提取所有可用字段
 * 2. 区分平台：OneBot 透传 rawEvent，其他平台用通用字段
 * 3. 通过 IPC 发送给 Worker 子进程
 * 4. 异步接收 Worker 回复（支持多次 reply），通过 AlemonJS Format 发送
 */
import { isMaster } from '@src/utils';
import { EventsEnum, Format, logger, Next, useMessage } from 'alemonjs';
import { manager } from './manager';
import type { IPCDone, IPCMedia, IPCReply } from './protocol';

/**
 * 待回复的消息上下文
 *
 * 滑动窗口模式：每次收到 reply 重置超时计时器
 * 支持 Yunzai 插件多次调用 e.reply() 的场景
 */
const pending = new Map<
  string,
  {
    message: ReturnType<typeof useMessage>[0];
    timer: ReturnType<typeof setTimeout>;
    maxTimer: ReturnType<typeof setTimeout>;
  }
>();

/** 滑动窗口超时：最后一次 reply 后 8s 清理 */
const REPLY_IDLE_TIMEOUT = 8_000;
/** 绝对超时：消息发出后 120s 必须清理，防泄漏 */
const REPLY_MAX_TIMEOUT = 120_000;

let idCounter = 0;
let listenerBound = false;
let doneListenerBound = false;

/** 绑定 Worker 回复监听（仅一次） */
function bindReplyListener(): void {
  if (listenerBound) {
    return;
  }
  listenerBound = true;

  manager.onReply((reply: IPCReply) => {
    logger.info(`[bridge] 收到 reply id=${reply.id} contents=${reply.contents.length}`);
    const ctx = pending.get(reply.id);

    if (!ctx) {
      logger.warn(`[bridge] pending 中未找到 id=${reply.id}`);

      return;
    }

    // 重置滑动窗口计时器（支持多次 reply）
    clearTimeout(ctx.timer);
    ctx.timer = setTimeout(() => cleanPending(reply.id), REPLY_IDLE_TIMEOUT);

    // 构建回复格式
    const format = Format.create();

    for (const c of reply.contents) {
      switch (c.type) {
        case 'text':
          format.addText(c.data);
          break;
        case 'image':
          if (c.data.startsWith('http') ?? c.data.startsWith('/')) {
            format.addImage(c.data);
          } else {
            format.addImage(`base64://${c.data}`);
          }
          break;
        case 'at':
          format.addMention(c.data);
          break;
        case 'face':
          format.addText(`[表情${c.data}]`);
          break;
        default:
          format.addText(c.data);
      }
    }
    void ctx.message.send({ format });
  });
}

/** 清理 pending 条目及其所有定时器 */
function cleanPending(id: string): void {
  const ctx = pending.get(id);

  if (!ctx) {
    return;
  }
  clearTimeout(ctx.timer);
  clearTimeout(ctx.maxTimer);
  pending.delete(id);
}

/** 绑定 Worker done 监听（仅一次） */
function bindDoneListener(): void {
  if (doneListenerBound) {
    return;
  }
  doneListenerBound = true;

  manager.onDone((done: IPCDone) => {
    const ctx = pending.get(done.id);

    if (!ctx) {
      return;
    }

    if (!done.replied) {
      // 无插件匹配 → 立即清理，不再等超时
      cleanPending(done.id);
    }
    // 有 reply 的情况：保留 pending 等待滑动窗口超时
    // （插件的 reply 和 done 可能交错到达）
  });
}

/** 从 AlemonJS 事件中提取跨平台媒体附件 */
function extractMedia(event: any): IPCMedia[] {
  const items: IPCMedia[] = [];

  if (!Array.isArray(event.MessageMedia)) {
    return items;
  }
  for (const m of event.MessageMedia) {
    items.push({
      type: m.Type === 'sticker' || m.Type === 'animation' ? 'sticker' : (m.Type ?? 'file'),
      url: m.Url ?? undefined,
      fileId: m.FileId ?? undefined,
      fileName: m.FileName ?? undefined
    });
  }

  return items;
}

/**
 * 安全提取原始 OneBot 事件
 * 仅当 value 包含 post_type 字段时才认定为 OneBot 事件
 */
function extractRawEvent(event: any, rawE: any): any {
  try {
    const v = event.value ?? rawE?.value;

    if (v && typeof v === 'object' && v.post_type) {
      return JSON.parse(JSON.stringify(v));
    }
  } catch {
    // 序列化失败 → 降级为无 rawEvent
  }

  return undefined;
}

export default (e: EventsEnum, next: Next) => {
  e.IsMaster = e.IsMaster ?? isMaster(e?.UserId, e?.Platform);

  if (!manager.isReady) {
    next();

    return;
  }

  const eventName: string = e.name ?? '';

  if (!eventName) {
    next();

    return;
  }

  bindReplyListener();
  bindDoneListener();

  const id = `msg_${++idCounter}_${Date.now()}`;

  // 为所有事件设置回复上下文
  // useMessage 内部仅检查 event 是对象，平台适配器决定能否实际发送
  const [message] = useMessage(e);

  pending.set(id, {
    message,
    timer: setTimeout(() => cleanPending(id), REPLY_IDLE_TIMEOUT),
    maxTimer: setTimeout(() => cleanPending(id), REPLY_MAX_TIMEOUT)
  });

  // 转发给 Worker — 提取所有 AlemonJS 标准字段
  manager.send({
    type: 'event',
    id,
    data: {
      eventName,
      platform: e.Platform ?? '',
      botId: e.BotId ?? '',
      messageText: e.MessageText ?? '',
      messageId: e.MessageId ?? '',
      media: extractMedia(e),
      userId: e.UserId ?? '',
      userName: e.UserName ?? '',
      userAvatar: e.UserAvatar ?? '',
      spaceId: e.GuildId ?? e.ChannelId ?? '',
      isPrivate: !e.GuildId,
      isMaster: e.IsMaster ?? false,
      rawEvent: extractRawEvent(e, e)
    }
  });
};
