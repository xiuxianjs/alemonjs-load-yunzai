/**
 * Yunzai Worker 进程入口
 *
 * 由 manager.ts 通过 child_process.fork() 启动
 *   cwd   = Miao-Yunzai 目录
 *   独立的 V8 堆、全局变量、模块解析
 *
 * 生命周期：
 *   injectGlobals → loadPlugin基类 → loadPluginsLoader → load() → 监听 IPC
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { IPCEventMessage, ParentToWorker, ReplyContent } from './protocol';

// ━━━━━━━━━━━━━━━ IPC 通信 ━━━━━━━━━━━━━━━

function ipcSend(msg: any): void {
  process.send?.(msg);
}

function log(level: string, ...args: string[]): void {
  ipcSend({ type: 'log', level, args });
}

// ━━━━━━━━━━━━━━━ 全局变量注入 ━━━━━━━━━━━━━━━

function injectGlobals(): void {
  const g = globalThis as any;

  // ── logger ──
  const identity = (s: any) => String(s);

  g.logger = {
    info: (...a: any[]) => log('info', ...a.map(String)),
    warn: (...a: any[]) => log('warn', ...a.map(String)),
    error: (...a: any[]) => log('error', ...a.map(String)),
    debug: (...a: any[]) => log('debug', ...a.map(String)),
    mark: (...a: any[]) => log('info', '[MARK]', ...a.map(String)),
    trace: (...a: any[]) => log('debug', '[TRACE]', ...a.map(String)),
    fatal: (...a: any[]) => log('error', '[FATAL]', ...a.map(String)),
    // chalk 颜色方法（子进程无终端色彩，透传原文）
    chalk: { red: identity, green: identity, yellow: identity, blue: identity, magenta: identity, cyan: identity },
    red: identity,
    green: identity,
    yellow: identity,
    blue: identity,
    magenta: identity,
    cyan: identity
  };

  // ── redis (内存模拟，支持 String / Hash / Sorted Set) ──
  const store = new Map<string, string>();
  const hStore = new Map<string, Map<string, string>>();
  const zStore = new Map<string, { value: string; score: number }[]>();

  g.redis = {
    // ─ String ─
    get: (k: string) => store.get(k) ?? null,
    set: (k: string, v: any, _opts?: any) => {
      store.set(k, String(v));

      return 'OK';
    },
    del: (k: string) => {
      store.delete(k);
      hStore.delete(k);
      zStore.delete(k);

      return 1;
    },
    keys: (p: string) => {
      const re = new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
      const all = new Set([...store.keys(), ...hStore.keys(), ...zStore.keys()]);

      return [...all].filter(k => re.test(k));
    },
    exists: (k: string) => (store.has(k) || hStore.has(k) || zStore.has(k) ? 1 : 0),
    expire: () => 1,
    incr: (k: string) => {
      const v = parseInt(store.get(k) ?? '0') + 1;

      store.set(k, String(v));

      return v;
    },
    setEx: (k: string, _ttl: number, v: any) => {
      store.set(k, String(v));

      return 'OK';
    },
    sendCommand: () => null,
    connect: async () => {},
    disconnect: async () => {},
    save: () => 'OK',

    // ─ Hash ─
    hGet: (k: string, f: string) => hStore.get(k)?.get(f) ?? null,
    hSet: (k: string, f: string, v: string) => {
      if (!hStore.has(k)) {
        hStore.set(k, new Map());
      }
      hStore.get(k)!.set(f, v);

      return 1;
    },
    hDel: (k: string, f: string) => {
      const m = hStore.get(k);

      if (!m) {
        return 0;
      }

      return m.delete(f) ? 1 : 0;
    },
    hGetAll: (k: string) => {
      const m = hStore.get(k);

      if (!m) {
        return {};
      }

      return Object.fromEntries(m);
    },
    hLen: (k: string) => hStore.get(k)?.size ?? 0,

    // ─ Sorted Set ─
    zAdd: (k: string, ...args: any[]) => {
      if (!zStore.has(k)) {
        zStore.set(k, []);
      }
      const arr = zStore.get(k)!;

      for (const a of args) {
        const { score, value } = typeof a === 'object' ? a : { score: 0, value: '' };
        const idx = arr.findIndex(e => e.value === String(value));

        if (idx >= 0) {
          arr[idx].score = score;
        } else {
          arr.push({ value: String(value), score });
        }
      }
      arr.sort((a, b) => a.score - b.score);

      return 1;
    },
    zRange: (k: string, start: number, stop: number) => {
      const arr = zStore.get(k) ?? [];
      const s = start < 0 ? Math.max(arr.length + start, 0) : start;
      const e = stop < 0 ? arr.length + stop : stop;

      return arr.slice(s, e + 1).map(i => i.value);
    },
    zRangeWithScores: (k: string, start: number, stop: number) => {
      const arr = zStore.get(k) ?? [];
      const s = start < 0 ? Math.max(arr.length + start, 0) : start;
      const e = stop < 0 ? arr.length + stop : stop;

      return arr.slice(s, e + 1);
    },
    zRangeByScore: (k: string, min: number, max: number) => {
      const arr = zStore.get(k) ?? [];

      return arr.filter(i => i.score >= min && i.score <= max).map(i => i.value);
    },
    zRangeByScoreWithScores: (k: string, min: number, max: number) => {
      const arr = zStore.get(k) ?? [];

      return arr.filter(i => i.score >= min && i.score <= max);
    },
    zScore: (k: string, v: string) => {
      const arr = zStore.get(k) ?? [];
      const found = arr.find(i => i.value === v);

      return found ? found.score : null;
    },
    zDel: (k: string, v: string) => {
      const arr = zStore.get(k);

      if (!arr) {
        return 0;
      }
      const idx = arr.findIndex(i => i.value === v);

      if (idx >= 0) {
        arr.splice(idx, 1);

        return 1;
      }

      return 0;
    },
    // node-redis v4 使用 zRem，Yunzai 插件普遍调用此方法
    zRem: (k: string, v: string | string[]) => {
      const arr = zStore.get(k);

      if (!arr) {
        return 0;
      }
      const vals = Array.isArray(v) ? v : [v];
      let removed = 0;

      for (const val of vals) {
        const idx = arr.findIndex(i => i.value === String(val));

        if (idx >= 0) {
          arr.splice(idx, 1);
          removed++;
        }
      }

      return removed;
    },
    zRemRangeByScore: (k: string, min: number, max: number) => {
      const arr = zStore.get(k);

      if (!arr) {
        return 0;
      }
      const before = arr.length;
      const filtered = arr.filter(i => i.score < min || i.score > max);

      zStore.set(k, filtered);

      return before - filtered.length;
    },
    zCard: (k: string) => zStore.get(k)?.length ?? 0,
    // 批量获取
    mGet: (keys: string[]) => keys.map(k => store.get(k) ?? null)
  };

  // ── Bot 空壳 ──
  // Yunzai loader 用 Bot[e.self_id] 取 bot 实例，需要用 Proxy 支持下标访问
  const botInstance: any = {
    uin: 10000,
    nickname: 'Yunzai',
    fl: new Map(),
    gl: new Map(),
    gml: new Map(),
    getFriendMap: () => botInstance.fl,
    getGroupMap: () => botInstance.gl,
    pickFriend: (uid: number) => ({
      sendMsg: () => ({}),
      user_id: uid
    }),
    pickGroup: (gid: number) => ({
      sendMsg: () => ({}),
      group_id: gid,
      pickMember: () => ({ info: {} })
    }),
    pickUser: (uid: number) => ({
      sendMsg: () => ({}),
      user_id: uid
    }),
    sendPrivateMsg: () => ({})
  };

  g.Bot = new Proxy(botInstance, {
    get(target, prop) {
      // Bot[uin] → 返回 bot 自身（Yunzai 用 Bot[e.self_id] 取实例）
      if (typeof prop === 'string' && /^\d+$/.test(prop)) {
        return target;
      }

      return target[prop];
    }
  });

  // ── segment (icqq 消息段构造) ──
  g.segment = {
    image: (file: any) => ({ type: 'image', file }),
    at: (qq: number) => ({ type: 'at', qq }),
    face: (id: number) => ({ type: 'face', id }),
    text: (text: string) => ({ type: 'text', text })
  };
}

// ━━━━━━━━━━━━━━━ 消息序列化 ━━━━━━━━━━━━━━━

function serializeReply(msg: any): ReplyContent[] {
  if (typeof msg === 'string') {
    return [{ type: 'text', data: msg }];
  }
  if (Buffer.isBuffer(msg)) {
    return [{ type: 'image', data: msg.toString('base64') }];
  }
  if (Array.isArray(msg)) {
    return msg.flatMap(serializeReply);
  }
  if (msg && typeof msg === 'object') {
    switch (msg.type) {
      case 'image': {
        const file = Buffer.isBuffer(msg.file) ? msg.file.toString('base64') : String(msg.file);

        return [{ type: 'image', data: file }];
      }
      case 'at':
        return [{ type: 'at', data: String(msg.qq) }];
      case 'face':
        return [{ type: 'face', data: String(msg.id) }];
      case 'text':
        return [{ type: 'text', data: msg.text ?? '' }];
      default:
        return [{ type: 'other', data: JSON.stringify(msg) }];
    }
  }

  return [{ type: 'text', data: String(msg) }];
}

// ━━━━━━━━━━━━━━━ 构建 icqq 事件 ━━━━━━━━━━━━━━━

/** 从 OneBot message 段中提取纯文本 */
function extractText(message: any[]): string {
  return message
    .filter((s: any) => s.type === 'text')
    .map((s: any) => s.data?.text ?? s.text ?? '')
    .join('')
    .trim();
}

/** 检测消息段中是否 at 了 self_id */
function detectAtMe(message: any[], selfId: number): boolean {
  return message.some((s: any) => s.type === 'at' && String(s.data?.qq ?? s.qq) === String(selfId));
}

/** 检测消息段中是否 at all */
function detectAtAll(message: any[]): boolean {
  return message.some((s: any) => s.type === 'at' && (s.data?.qq === 'all' || s.qq === 'all'));
}

/**
 * 将跨平台媒体附件（来自 AlemonJS MessageMedia）转为 icqq 消息段
 * 使得来自 Discord/Telegram 等平台的图片也能被 Yunzai 插件感知
 */
function mediaToSegments(media: IPCEventMessage['data']['media']): any[] {
  if (!Array.isArray(media) || media.length === 0) {
    return [];
  }

  return media.map(m => {
    switch (m.type) {
      case 'image':
      case 'sticker':
        return { type: 'image', file: m.url ?? m.fileId ?? '', url: m.url };
      case 'audio':
        return { type: 'record', file: m.url ?? m.fileId ?? '', url: m.url };
      case 'video':
        return { type: 'video', file: m.url ?? m.fileId ?? '', url: m.url };
      default:
        return { type: 'file', file: m.url ?? m.fileId ?? '', name: m.fileName };
    }
  });
}

/**
 * OneBot 消息段格式统一化
 * icqq 格式: {type, text, qq, file, ...}
 * 标准 OneBot: {type, data: {text, qq, ...}}
 * 统一展平为 icqq 风格，方便 Yunzai 插件直接访问
 */
function normalizeSegments(message: any[]): any[] {
  return message.map((seg: any) => {
    if (seg.data && typeof seg.data === 'object') {
      return { type: seg.type, ...seg.data };
    }

    return seg;
  });
}

/** 安全转 number（非 QQ 平台的 userId 可能是非数字字符串） */
function safeInt(v: any, fallback: number): number {
  const n = parseInt(String(v));

  return Number.isFinite(n) ? n : fallback;
}

/**
 * 创建 e.group 代理对象
 * 许多 Yunzai 插件访问 e.group.xxx（如 getMemberMap、pickMember 等）
 */
function makeGroupProxy(groupId: number) {
  return {
    group_id: groupId,
    name: `Group ${groupId}`,
    is_owner: false,
    is_admin: false,
    mute_left: 0,
    sendMsg: () => ({}),
    getMemberMap: () => new Map(),
    pickMember: (uid: number) => ({
      user_id: uid,
      info: {},
      getAvatarUrl: () => `https://q1.qlogo.cn/g?b=qq&s=0&nk=${uid}`
    }),
    recallMsg: () => false,
    muteMember: () => false,
    kickMember: () => false,
    quit: () => false
  };
}

/**
 * 创建 e.friend 代理对象
 * 用于私聊场景，插件可能访问 e.friend.sendMsg 等
 */
function makeFriendProxy(userId: number, userName: string) {
  return {
    user_id: userId,
    nickname: userName,
    remark: userName,
    sendMsg: () => ({}),
    getAvatarUrl: () => `https://q1.qlogo.cn/g?b=qq&s=0&nk=${userId}`
  };
}

// ━━━━━━━━━━━━━ 非消息事件构建 ━━━━━━━━━━━━━

/** 判断是否是消息类事件名称 */
function isMessageEventName(name: string): boolean {
  return name.includes('message.create') || name.includes('interaction');
}

/** AlemonJS 事件名 → icqq notice 类型映射 */
const EVENT_NOTICE_MAP: Record<string, { notice_type: string; sub_type: string }> = {
  'member.add': { notice_type: 'group_increase', sub_type: 'approve' },
  'member.remove': { notice_type: 'group_decrease', sub_type: 'leave' },
  'member.ban': { notice_type: 'group_ban', sub_type: 'ban' },
  'member.unban': { notice_type: 'group_ban', sub_type: 'lift_ban' },
  'member.update': { notice_type: 'group_admin', sub_type: 'set' },
  'notice.create': { notice_type: 'notify', sub_type: 'poke' },
  'private.notice.create': { notice_type: 'notify', sub_type: 'poke' },
  'message.delete': { notice_type: 'group_recall', sub_type: '' },
  'private.message.delete': { notice_type: 'friend_recall', sub_type: '' }
};

/** AlemonJS 事件名 → icqq request 类型映射 */
const EVENT_REQUEST_MAP: Record<string, { request_type: string; sub_type: string }> = {
  'private.friend.add': { request_type: 'friend', sub_type: 'add' },
  'private.guild.add': { request_type: 'group', sub_type: 'invite' }
};

/**
 * 从 rawEvent 构建非消息类 icqq 事件（notice / request）
 * 直接展开 raw 对象，保留 notice_type / operator_id 等原生字段
 */
function buildRawNonMessageEvent(raw: any, data: IPCEventMessage['data'], selfId: number, reply: (msg: any, quote?: boolean) => any) {
  const userId = raw.user_id ?? safeInt(data.userId, 10001);
  const groupId = raw.group_id ?? safeInt(data.spaceId, 0);

  const e: any = {
    ...raw,
    self_id: raw.self_id ?? selfId,
    time: raw.time ?? Math.floor(Date.now() / 1000),
    user_id: userId,
    group_id: groupId,

    isMaster: data.isMaster,
    isOwner: data.isMaster,
    isAdmin: data.isMaster,

    reply,
    getMemberMap: () => new Map(),
    getAvatarUrl: (size = 0) => data.userAvatar ?? `https://q1.qlogo.cn/g?b=qq&s=${size}&nk=${userId}`,
    logText: `[${raw.post_type}:${raw.notice_type ?? raw.request_type ?? 'unknown'}:${groupId ?? userId}]`,
    logFnc: ''
  };

  if (groupId) {
    e.group = makeGroupProxy(groupId);
  }
  if (userId) {
    e.friend = makeFriendProxy(userId, data.userName ?? 'User');
  }

  if (raw.post_type === 'request') {
    e.approve = () => true;
    e.reject = () => true;
  }

  return e;
}

/**
 * 跨平台降级构建非消息类 icqq 事件
 * 根据 AlemonJS 事件名映射到 icqq notice/request 类型
 */
function buildFallbackNonMessageEvent(
  data: IPCEventMessage['data'],
  selfId: number,
  platformTag: string,
  reply: (msg: any, quote?: boolean) => any,
  eventName: string
) {
  const userId = safeInt(data.userId, 10001);
  const groupId = data.isPrivate ? 0 : safeInt(data.spaceId, 0);

  const e: any = {
    self_id: selfId,
    time: Math.floor(Date.now() / 1000),
    user_id: userId,
    group_id: groupId,

    isMaster: data.isMaster,
    isOwner: data.isMaster,
    isAdmin: data.isMaster,

    reply,
    getMemberMap: () => new Map(),
    getAvatarUrl: (size = 0) => data.userAvatar ?? `https://q1.qlogo.cn/g?b=qq&s=${size}&nk=${userId}`,
    logFnc: ''
  };

  const noticeMap = EVENT_NOTICE_MAP[eventName];
  const requestMap = EVENT_REQUEST_MAP[eventName];

  if (noticeMap) {
    e.post_type = 'notice';
    e.notice_type = noticeMap.notice_type;
    e.sub_type = noticeMap.sub_type;
    e.operator_id = userId;
    e.logText = `${platformTag}[Notice:${noticeMap.notice_type}:${groupId ?? userId}]`;
  } else if (requestMap) {
    e.post_type = 'request';
    e.request_type = requestMap.request_type;
    e.sub_type = requestMap.sub_type;
    e.comment = '';
    e.flag = `${eventName}_${Date.now()}`;
    e.approve = () => true;
    e.reject = () => true;
    e.logText = `${platformTag}[Request:${requestMap.request_type}:${userId}]`;
  } else {
    // guild/channel 等无直接对应的事件 → 作为通用 notice 透传
    e.post_type = 'notice';
    e.notice_type = eventName;
    e.sub_type = '';
    e.logText = `${platformTag}[Event:${eventName}:${groupId ?? userId}]`;
  }

  if (groupId) {
    e.group = makeGroupProxy(groupId);
  }
  if (userId) {
    e.friend = makeFriendProxy(userId, data.userName ?? 'User');
  }

  return e;
}

function buildEvent(data: IPCEventMessage['data'], msgId: string) {
  const raw = data.rawEvent;
  const selfId = (globalThis as any).Bot?.uin ?? 10000;
  const platformTag = data.platform ? `[${data.platform}]` : '';

  // ── IPC 回复函数（始终覆盖，所有平台通用） ──
  const reply = (msg: any, _quote = false) => {
    const contents = serializeReply(msg);

    log('debug', `[reply] id=${msgId} contents=${JSON.stringify(contents).slice(0, 200)}`);
    ipcSend({ type: 'reply', id: msgId, contents });

    return { message_id: `reply_${Date.now()}` };
  };

  // ══════════════════════════════════════════
  //  路径 A: 有原始 OneBot 事件 → 真实数据构建
  // ══════════════════════════════════════════
  if (raw && typeof raw === 'object' && raw.post_type) {
    // 非消息事件（notice / request）→ 专用构建器
    if (raw.post_type !== 'message') {
      return buildRawNonMessageEvent(raw, data, selfId, reply);
    }

    const isGroup = raw.message_type === 'group';
    const userId = raw.user_id ?? safeInt(data.userId, 10001);
    const groupId = raw.group_id ?? (isGroup ? safeInt(data.spaceId, 0) : 0);
    const message: any[] = Array.isArray(raw.message) ? raw.message : [{ type: 'text', text: data.messageText }];

    const normalizedMessage = normalizeSegments(message);
    const rawMessage = raw.raw_message ?? extractText(normalizedMessage);
    const atme = detectAtMe(normalizedMessage, selfId);
    const atall = detectAtAll(normalizedMessage);

    const e: any = {
      post_type: raw.post_type ?? 'message',
      message_type: raw.message_type ?? (isGroup ? 'group' : 'private'),
      sub_type: raw.sub_type ?? (isGroup ? 'normal' : 'friend'),
      message_id: raw.message_id,
      user_id: userId,
      group_id: groupId,
      group_name: raw.group_name ?? (isGroup ? `Group ${groupId}` : ''),
      self_id: raw.self_id ?? selfId,
      time: raw.time ?? Math.floor(Date.now() / 1000),
      seq: raw.message_seq ?? raw.seq ?? Date.now(),
      rand: raw.rand ?? Math.random(),
      font: raw.font ?? '',

      message: normalizedMessage,
      raw_message: rawMessage,
      msg: '',

      sender: {
        user_id: userId,
        nickname: raw.sender?.nickname ?? data.userName ?? 'User',
        card: raw.sender?.card ?? raw.sender?.nickname ?? data.userName ?? '',
        role: raw.sender?.role ?? 'member',
        level: raw.sender?.level,
        title: raw.sender?.title ?? '',
        sex: raw.sender?.sex,
        age: raw.sender?.age,
        area: raw.sender?.area
      },

      atme,
      atall,

      isMaster: data.isMaster,
      isOwner: data.isMaster,
      isAdmin: data.isMaster || raw.sender?.role === 'admin' || raw.sender?.role === 'owner',

      reply,
      getMemberMap: () => new Map(),
      getAvatarUrl: (size = 0) => data.userAvatar ?? `https://q1.qlogo.cn/g?b=qq&s=${size}&nk=${userId}`,
      toString: () => rawMessage,

      // ── group / friend 代理 ──
      ...(isGroup ? { group: makeGroupProxy(groupId), friend: undefined } : { group: undefined, friend: makeFriendProxy(userId, data.userName ?? 'User') })
    };

    e.original_msg = rawMessage;
    e.logText = `[${isGroup ? 'Group' : 'Private'}:${isGroup ? groupId : userId}] ${rawMessage}`;
    e.logFnc = '';

    return e;
  }

  // 非消息事件 → 跨平台降级构建
  const eventName = data.eventName ?? '';

  if (eventName && !isMessageEventName(eventName)) {
    return buildFallbackNonMessageEvent(data, selfId, platformTag, reply, eventName);
  }

  // ══════════════════════════════════════════
  //  路径 B: 无 rawEvent → 跨平台降级构建
  //  利用 AlemonJS 标准化字段生成最优 icqq 兼容事件
  // ══════════════════════════════════════════
  const isGroup = !data.isPrivate;
  const userId = safeInt(data.userId, 10001);
  const groupId = isGroup ? safeInt(data.spaceId, 10002) : 0;

  // 构建消息段：文本 + 跨平台媒体附件
  const messageParts: any[] = [];

  if (data.messageText) {
    messageParts.push({ type: 'text', text: data.messageText });
  }
  messageParts.push(...mediaToSegments(data.media));
  if (messageParts.length === 0) {
    messageParts.push({ type: 'text', text: '' });
  }

  const e: any = {
    post_type: 'message',
    message_type: isGroup ? 'group' : 'private',
    sub_type: isGroup ? 'normal' : 'friend',
    user_id: userId,
    sender: {
      user_id: userId,
      nickname: data.userName ?? 'User',
      card: data.userName ?? '',
      role: 'member'
    },

    message: messageParts,
    raw_message: data.messageText,
    msg: '',

    group_id: groupId,
    group_name: isGroup ? `Group ${groupId}` : '',

    isMaster: data.isMaster,
    isOwner: data.isMaster,
    isAdmin: data.isMaster,

    message_id: data.messageId ?? `cross_${Date.now()}`,
    seq: Date.now(),
    rand: Math.random(),
    time: Math.floor(Date.now() / 1000),
    self_id: selfId,
    font: '',
    atme: false,
    atall: false,

    reply,
    getMemberMap: () => new Map(),
    getAvatarUrl: (size = 0) => data.userAvatar ?? `https://q1.qlogo.cn/g?b=qq&s=${size}&nk=${userId}`,
    toString: () => data.messageText,

    // ── group / friend 代理 ──
    ...(isGroup ? { group: makeGroupProxy(groupId), friend: undefined } : { group: undefined, friend: makeFriendProxy(userId, data.userName ?? 'User') })
  };

  e.original_msg = data.messageText;
  e.logText = `${platformTag}[${isGroup ? 'Group' : 'Private'}:${isGroup ? groupId : userId}] ${data.messageText}`;
  e.logFnc = '';

  return e;
}

// ━━━━━━━━━━━━━━━ 主流程 ━━━━━━━━━━━━━━━

let PluginsLoader: any = null;

async function main(): Promise<void> {
  const cwd = process.cwd();

  log('info', `Worker 启动, cwd=${cwd}`);

  // 1. 注入全局变量
  injectGlobals();

  // 2. 确保 config/config 目录存在
  const configDir = path.join(cwd, 'config', 'config');

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // 3. 加载 plugin 基类 → global.plugin
  try {
    const mod = await import(pathToFileURL(path.join(cwd, 'lib', 'plugins', 'plugin.js')).href);

    (globalThis as any).plugin = mod.default ?? mod.plugin;
    log('info', 'plugin 基类加载成功');
  } catch (err: any) {
    log('warn', `plugin 基类加载失败，使用内置空壳: ${err.message}`);
    (globalThis as any).plugin = class {
      name = 'plugin';
      dsc = '';
      event = 'message';
      priority = 5000;
      rule: any[] = [];
      e: any = null;
      constructor(opt: any = {}) {
        Object.assign(this, opt);
      }
      reply(msg: any, quote?: boolean) {
        return this.e?.reply?.(msg, quote);
      }
    };
  }

  // 4. 加载 PluginsLoader
  try {
    const mod = await import(pathToFileURL(path.join(cwd, 'lib', 'plugins', 'loader.js')).href);

    PluginsLoader = mod.default;
    log('info', 'PluginsLoader 加载成功');
  } catch (err: any) {
    log('error', `PluginsLoader 加载失败: ${err.message}`);
    ipcSend({ type: 'error', message: `Loader 加载失败: ${err.message}` });
    process.exit(1);
  }

  // 5. 加载全部插件
  try {
    await PluginsLoader.load();
    const count = PluginsLoader.priority?.length ?? 0;

    log('info', `插件加载完成，共 ${count} 个`);
    ipcSend({ type: 'ready', pluginCount: count });
  } catch (err: any) {
    log('error', `插件加载失败: ${err.message}`);
    ipcSend({ type: 'error', message: `插件加载失败: ${err.message}` });
    process.exit(1);
  }

  // 6. 监听父进程 IPC 消息
  process.on('message', (msg: ParentToWorker) => {
    if (msg.type === 'event') {
      const e = buildEvent(msg.data, msg.id);
      let replied = false;
      const origReply = e.reply;

      e.reply = (m: any, q = false) => {
        replied = true;

        return origReply(m, q);
      };
      void (async () => {
        try {
          await PluginsLoader.deal(e);
        } catch (err: any) {
          log('error', `deal 异常: ${err.message}`);
          log('error', err.stack ?? '');
          ipcSend({
            type: 'reply',
            id: msg.id,
            contents: [{ type: 'text', data: `[Yunzai 错误] ${err.message}` }]
          });
          replied = true;
        }
        // 通知父进程 deal 已完成
        ipcSend({ type: 'done', id: msg.id, replied });
      })();
    } else if (msg.type === 'shutdown') {
      log('info', 'Worker 收到关闭信号，退出');
      process.exit(0);
    }
  });
}

main().catch(err => {
  log('error', `Worker 启动失败: ${err.message}`);
  process.exit(1);
});
