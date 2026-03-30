/**
 * AlemonJS → Yunzai IPC 桥接
 *
 * 1. 捕获 AlemonJS 消息事件，提取关键数据
 * 2. 通过 IPC 发送给 Worker 子进程
 * 3. 异步接收 Worker 回复，通过 AlemonJS Format 发送
 */
import { createEvent, Format, logger, useMessage } from 'alemonjs';
import { manager } from './manager';
import type { IPCReply } from './protocol';

/** 待回复的消息上下文 */
const pending = new Map<
  string,
  {
    message: ReturnType<typeof useMessage>[0];
    timer: ReturnType<typeof setTimeout>;
  }
>();

let idCounter = 0;
let listenerBound = false;

/** 绑定 Worker 回复监听（仅一次） */
function bindReplyListener(): void {
  if (listenerBound) return;
  listenerBound = true;

  manager.onReply((reply: IPCReply) => {
    logger.info(`[bridge] 收到 reply id=${reply.id} contents=${reply.contents.length}`);
    const ctx = pending.get(reply.id);
    if (!ctx) {
      logger.warn(`[bridge] pending 中未找到 id=${reply.id}`);
      return;
    }

    clearTimeout(ctx.timer);
    pending.delete(reply.id);

    const format = Format.create();
    for (const c of reply.contents) {
      switch (c.type) {
        case 'text':
          format.addText(c.data);
          break;
        case 'image':
          if (c.data.startsWith('http') || c.data.startsWith('/')) {
            format.addImage(c.data);
          } else {
            format.addImage(`base64://${c.data}`);
          }
          break;
        case 'at':
          format.addText(`@${c.data} `);
          break;
        default:
          format.addText(c.data);
      }
    }
    ctx.message.send({ format });
  });
}

export default async function yunzaiBridge(e: any, next: () => void): Promise<void> {
  if (!manager.isReady) {
    next();
    return;
  }

  const event = createEvent({
    event: e,
    selects: ['message.create', 'private.message.create']
  });
  if (!event.selects) {
    next();
    return;
  }

  bindReplyListener();

  const [message] = useMessage(event);
  const id = `msg_${++idCounter}_${Date.now()}`;

  // 缓存发送上下文（60s 超时清理）
  pending.set(id, {
    message,
    timer: setTimeout(() => pending.delete(id), 60_000)
  });

  // 提取原始 OneBot 事件（如果来自 OneBot 适配器）
  let rawEvent: any = undefined;
  try {
    const v = (event as any).value ?? (e as any).value;
    if (v && typeof v === 'object' && v.post_type) {
      // 只保留 JSON 可序列化的纯数据字段
      rawEvent = JSON.parse(JSON.stringify(v));
    }
  } catch {
    // 序列化失败时忽略，使用基础字段兜底
  }

  // 转发给 Worker
  manager.send({
    type: 'event',
    id,
    data: {
      messageText: event.MessageText || '',
      userId: event.UserId || '',
      userName: event.UserName || '',
      spaceId: event.GuildId || event.ChannelId || '',
      isPrivate: !event.GuildId,
      isMaster: event.IsMaster || false,
      rawEvent
    }
  });
}
