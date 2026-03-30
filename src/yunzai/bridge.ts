/**
 * AlemonJS → Yunzai IPC 桥接
 *
 * 1. 捕获 AlemonJS 事件（消息、通知、请求等），提取所有可用字段
 * 2. 区分平台：OneBot 透传 rawEvent，其他平台用通用字段
 * 3. 通过 IPC 发送给 Worker 子进程
 * 4. 异步接收 Worker 回复（支持多次 reply），通过 AlemonJS Format 发送
 * 5. 接收 Worker API 请求，调用 AlemonJS 平台 API 实现双向通信
 */
import { isMaster } from '@src/utils';
import { EventsEnum, Format, logger, Next, sendToChannel, sendToUser, useGuild, useMe, useMember, useMessage, useRequest, useUser } from 'alemonjs';
import { manager } from './manager';
import type { IPCApiRequest, IPCDone, IPCMedia, IPCReply, ReplyContent } from './protocol';

/**
 * 尝试获取 OneBot 平台的原生 API 客户端
 * 仅在 @alemonjs/onebot 已安装且当前事件来自 OneBot 平台时可用
 */
let _useClientFn: any = null;

async function loadOneBotClient(): Promise<void> {
  if (_useClientFn !== null) {
    return;
  }

  try {
    const mod = await import('@alemonjs/onebot');

    _useClientFn = mod.useClient;
    logger.info('[bridge] @alemonjs/onebot useClient 已加载');
  } catch {
    _useClientFn = false; // 标记为不可用，避免重复尝试
    logger.debug('[bridge] @alemonjs/onebot 不可用，OneBot 特有 API 将降级处理');
  }
}

/**
 * 通过 OneBot API 客户端执行原生调用
 * 仅 OneBot 平台可用，其他平台返回 null
 */
function getOneBotClient(event: EventsEnum): any {
  if (!_useClientFn || _useClientFn === false) {
    return null;
  }

  try {
    const [client] = _useClientFn(event);

    return client;
  } catch {
    return null;
  }
}

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
    logger.info(`[bridge] 收到 reply id=${reply.id} replyId=${reply.replyId} contents=${reply.contents.length}`);
    const ctx = pending.get(reply.id);

    if (!ctx) {
      logger.warn(`[bridge] pending 中未找到 id=${reply.id}`);

      return;
    }

    // 重置滑动窗口计时器（支持多次 reply）
    clearTimeout(ctx.timer);
    ctx.timer = setTimeout(() => cleanPending(reply.id), REPLY_IDLE_TIMEOUT);

    const format = contentsToFormat(reply.contents);

    // 发送消息并将真实 message_id 回传给 Worker（用于撤回等操作）
    void ctx.message
      .send({ format })
      .then((res: any) => {
        manager.sendToWorker({
          type: 'reply_result',
          replyId: reply.replyId,
          messageId: res?.MessageId ?? res?.message_id ?? undefined,
          ok: true
        });
      })
      .catch(() => {
        manager.sendToWorker({
          type: 'reply_result',
          replyId: reply.replyId,
          ok: false
        });
      });
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

// ━━━━━━━━━━━ ReplyContent → Format 转换 ━━━━━━━━━━━

/** 将 Worker 的 ReplyContent[] 转为 AlemonJS Format */
function contentsToFormat(contents: ReplyContent[]): InstanceType<typeof Format> {
  const format = Format.create();

  for (const c of contents) {
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
        format.addMention(c.data);
        break;
      case 'face':
        format.addText(`[表情${c.data}]`);
        break;
      case 'record':
        // 语音：URL 或 base64
        if (c.data.startsWith('http') || c.data.startsWith('/')) {
          format.addText(`[语音:${c.data}]`);
        } else {
          format.addText('[语音]');
        }
        break;
      case 'video':
        if (c.data.startsWith('http') || c.data.startsWith('/')) {
          format.addText(`[视频:${c.data}]`);
        } else {
          format.addText('[视频]');
        }
        break;
      case 'forward':
        // 转发消息降级：展示为文本（真实转发卡片在多数平台不支持）
        format.addText(c.data || '[转发消息]');
        break;
      default:
        format.addText(c.data);
    }
  }

  return format;
}

// ━━━━━━━━━━━ 平台事件存储 & API 请求处理 ━━━━━━━━━━━

/**
 * 每个平台最近的 AlemonJS 事件引用
 * 用于 Worker 发起 API 调用时提供事件上下文
 */
const latestEvents = new Map<string, EventsEnum>();

let apiListenerBound = false;

/** 绑定 Worker API 请求监听（仅一次） */
function bindApiRequestListener(): void {
  if (apiListenerBound) {
    return;
  }
  apiListenerBound = true;

  // 预加载 OneBot 客户端（非阻塞）
  void loadOneBotClient();

  manager.onApiRequest((req: IPCApiRequest) => {
    void handleApiRequest(req);
  });
}

/**
 * 处理来自 Worker 的 API 请求
 *
 * 利用 AlemonJS 标准 hooks 实现跨平台兼容：
 * - OneBot 平台：通过 AlemonJS → OneBot 适配器 → icqq 完整 API
 * - 其他平台：通过 AlemonJS 标准化接口降级适配
 */
async function handleApiRequest(req: IPCApiRequest): Promise<void> {
  const { reqId, action, params } = req;

  try {
    const result = await dispatchApi(action, params);

    manager.sendToWorker({ type: 'api_response', reqId, ok: true, data: result });
  } catch (err: any) {
    manager.sendToWorker({ type: 'api_response', reqId, ok: false, error: err?.message ?? 'Unknown error' });
  }
}

/**
 * API 分发器 — 将 Yunzai/icqq 风格的 API 调用映射到 AlemonJS 标准 hooks
 *
 * 优先使用 sendToChannel / sendToUser（无需事件上下文）
 * 成员操作等需要事件上下文的，从 latestEvents 获取
 */
async function dispatchApi(action: string, params: Record<string, any>): Promise<any> {
  switch (action) {
    // ─── 消息发送（不需要事件上下文） ───

    case 'sendGroupMsg': {
      const format = contentsToFormat(params.contents ?? []);

      return await sendToChannel(String(params.group_id), format.value);
    }

    case 'sendPrivateMsg': {
      const format = contentsToFormat(params.contents ?? []);

      return await sendToUser(String(params.user_id), format.value);
    }

    // ─── 消息操作（需要事件上下文） ───

    case 'deleteMsg': {
      const event = getEventForApi(params.platform);

      if (!event) {
        throw new Error('无可用事件上下文');
      }
      const [message] = useMessage(event);

      return await message.delete({ messageId: String(params.message_id) });
    }

    // ─── 群成员操作 ───

    case 'getGroupMemberList': {
      const event = getEventForApi(params.platform);

      if (!event) {
        throw new Error('无可用事件上下文');
      }
      const [member] = useMember(event);

      return await member.list({ guildId: String(params.group_id) });
    }

    case 'getGroupMemberInfo': {
      const event = getEventForApi(params.platform);

      if (!event) {
        throw new Error('无可用事件上下文');
      }
      const [member] = useMember(event);

      return await member.info({ userId: String(params.user_id), guildId: String(params.group_id) });
    }

    case 'setGroupKick': {
      const event = getEventForApi(params.platform);

      if (!event) {
        throw new Error('无可用事件上下文');
      }
      const [member] = useMember(event);

      return await member.kick({ userId: String(params.user_id), guildId: String(params.group_id) });
    }

    case 'setGroupBan': {
      const event = getEventForApi(params.platform);

      if (!event) {
        throw new Error('无可用事件上下文');
      }
      const [member] = useMember(event);

      return await member.mute({ userId: String(params.user_id), guildId: String(params.group_id), duration: params.duration ?? 0 });
    }

    case 'setGroupCard': {
      const event = getEventForApi(params.platform);

      if (!event) {
        throw new Error('无可用事件上下文');
      }
      const [member] = useMember(event);

      return await member.card({ userId: String(params.user_id), guildId: String(params.group_id), card: params.card ?? '' });
    }

    case 'setGroupAdmin': {
      const event = getEventForApi(params.platform);

      if (!event) {
        throw new Error('无可用事件上下文');
      }
      const [member] = useMember(event);

      return await member.admin({ userId: String(params.user_id), guildId: String(params.group_id), enable: params.enable ?? true });
    }

    case 'setGroupSpecialTitle': {
      const event = getEventForApi(params.platform);

      if (!event) {
        throw new Error('无可用事件上下文');
      }
      const [member] = useMember(event);

      return await member.title({ userId: String(params.user_id), guildId: String(params.group_id), title: params.special_title ?? '' });
    }

    // ─── 群操作 ───

    case 'getGroupInfo': {
      const event = getEventForApi(params.platform);

      if (!event) {
        throw new Error('无可用事件上下文');
      }
      const [guild] = useGuild(event);

      return await guild.info({ guildId: String(params.group_id) });
    }

    case 'getGroupList': {
      const event = getEventForApi(params.platform);

      if (!event) {
        throw new Error('无可用事件上下文');
      }
      const [guild] = useGuild(event);

      return await guild.list();
    }

    case 'setGroupLeave': {
      const event = getEventForApi(params.platform);

      if (!event) {
        throw new Error('无可用事件上下文');
      }
      const [guild] = useGuild(event);

      return await guild.leave({ guildId: String(params.group_id) });
    }

    case 'setGroupName': {
      const event = getEventForApi(params.platform);

      if (!event) {
        throw new Error('无可用事件上下文');
      }
      const [guild] = useGuild(event);

      return await guild.update({ guildId: String(params.group_id), name: params.group_name ?? '' });
    }

    case 'setGroupWholeBan': {
      const event = getEventForApi(params.platform);

      if (!event) {
        throw new Error('无可用事件上下文');
      }
      const [guild] = useGuild(event);

      return await guild.mute({ guildId: String(params.group_id), enable: params.enable ?? true });
    }

    // ─── Bot 信息 ───

    case 'getLoginInfo': {
      const [me] = useMe();

      return await me.info();
    }

    case 'getFriendList': {
      const [me] = useMe();

      return await me.friends();
    }

    case 'getStrangerInfo': {
      const [user] = useUser();

      return await user.info({ userId: String(params.user_id) });
    }

    // ─── 请求处理（好友申请 / 入群请求） ───

    case 'setFriendAddRequest': {
      const [request] = useRequest();

      return await request.friend({
        flag: String(params.flag),
        approve: params.approve ?? true,
        remark: params.remark ?? ''
      });
    }

    case 'setGroupAddRequest': {
      const [request] = useRequest();

      return await request.guild({
        flag: String(params.flag),
        subType: params.type ?? 'add',
        approve: params.approve ?? true,
        reason: params.reason ?? ''
      });
    }

    // ─── OneBot 特有 API（需要原生 WebSocket 客户端） ───

    case 'getMsg': {
      const event = getEventForApi(params.platform);

      if (!event) {
        throw new Error('无可用事件上下文');
      }
      const client = getOneBotClient(event);

      if (!client) {
        throw new Error('getMsg 仅 OneBot 平台可用');
      }

      return await client.getMsg({ message_id: Number(params.message_id) });
    }

    case 'getForwardMsg': {
      const event = getEventForApi(params.platform);

      if (!event) {
        throw new Error('无可用事件上下文');
      }
      const client = getOneBotClient(event);

      if (!client) {
        throw new Error('getForwardMsg 仅 OneBot 平台可用');
      }

      return await client.getForwardMsg({ id: String(params.id) });
    }

    case 'getChatHistory': {
      const event = getEventForApi(params.platform);

      if (!event) {
        throw new Error('无可用事件上下文');
      }
      const client = getOneBotClient(event);

      if (!client) {
        return { messages: [] }; // 非 OneBot 平台降级为空
      }

      // Napcat / go-cqhttp 扩展 API: get_group_msg_history / get_friend_msg_history
      if (params.group_id) {
        return await client.send({
          action: 'get_group_msg_history',
          params: { group_id: Number(params.group_id), message_seq: Number(params.message_seq), count: params.count ?? 1 }
        });
      }

      return await client.send({
        action: 'get_friend_msg_history',
        params: { user_id: Number(params.user_id), message_seq: Number(params.message_seq), count: params.count ?? 1 }
      });
    }

    default:
      throw new Error(`不支持的 API: ${action}`);
  }
}

/** 获取指定平台的最新事件上下文，用于 API 调用 */
function getEventForApi(platform?: string): EventsEnum | undefined {
  if (platform && latestEvents.has(platform)) {
    return latestEvents.get(platform);
  }
  // 没指定平台或找不到 → 取任意一个可用事件
  if (latestEvents.size > 0) {
    return latestEvents.values().next().value;
  }

  return undefined;
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
  bindApiRequestListener();

  // 存储最新事件（供 Worker API 调用时使用）
  if (e.Platform) {
    latestEvents.set(e.Platform, e);
  }

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
