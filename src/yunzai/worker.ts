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
import type { IPCApiResponse, IPCEventMessage, IPCReplyResult, ParentToWorker, ReplyContent } from './protocol';

// ━━━━━━━━━━━━━━━ IPC 通信 ━━━━━━━━━━━━━━━

function ipcSend(msg: any): void {
  process.send?.(msg);
}

function log(level: string, ...args: string[]): void {
  ipcSend({ type: 'log', level, args });
}

// ━━━━━━━━━━━━━━━ API 调用基础设施 ━━━━━━━━━━━━━━━

/** 等待父进程 API 响应的 Promise map */
const apiPending = new Map<string, { resolve:(v: any) => void; reject: (e: Error) => void }>();
let apiIdCounter = 0;

/** 当前正在处理的事件平台（用于 API 调用路由） */
let currentPlatform = '';

/** 历史已知平台（定时任务触发时 currentPlatform 可能为空，使用此 fallback） */
let defaultPlatform = '';

// ━━━━━━━━━━━━━━━ Reply 结果追踪 ━━━━━━━━━━━━━━━

/** 等待父进程 reply 发送结果的 Promise map */
const replyPending = new Map<string, { resolve:(v: any) => void }>();
let replyIdCounter = 0;

/** 处理父进程返回的 reply 结果 */
function handleReplyResult(msg: IPCReplyResult): void {
  const p = replyPending.get(msg.replyId);

  if (!p) {
    return;
  }
  replyPending.delete(msg.replyId);
  p.resolve({ message_id: msg.messageId ?? `reply_${Date.now()}` });
}

/**
 * 向父进程发起 API 调用并等待结果
 * Worker 的 Bot / group / friend 代理对象通过此函数实现真实功能
 */
function callApi(action: string, params: Record<string, any> = {}, timeout = 15_000): Promise<any> {
  return new Promise((resolve, reject) => {
    const reqId = `api_${++apiIdCounter}_${Date.now()}`;

    // 自动附加当前平台信息（定时任务触发时用 defaultPlatform 兜底）
    if (!params.platform && (currentPlatform || defaultPlatform)) {
      params.platform = currentPlatform || defaultPlatform;
    }

    const timer = setTimeout(() => {
      apiPending.delete(reqId);
      reject(new Error(`API 调用超时: ${action}`));
    }, timeout);

    apiPending.set(reqId, {
      resolve: (data: any) => {
        clearTimeout(timer);
        apiPending.delete(reqId);
        resolve(data);
      },
      reject: (err: Error) => {
        clearTimeout(timer);
        apiPending.delete(reqId);
        reject(err);
      }
    });

    ipcSend({ type: 'api', reqId, action, params });
  });
}

/** 处理父进程返回的 API 响应 */
function handleApiResponse(msg: IPCApiResponse): void {
  const pending = apiPending.get(msg.reqId);

  if (!pending) {
    return;
  }

  if (msg.ok) {
    pending.resolve(msg.data);
  } else {
    pending.reject(new Error(msg.error ?? 'API 调用失败'));
  }
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

  // ── redis (内存模拟，支持 String / Hash / Sorted Set + TTL) ──
  const store = new Map<string, string>();
  const hStore = new Map<string, Map<string, string>>();
  const zStore = new Map<string, { value: string; score: number }[]>();
  /** TTL 定时器（key → timer），到期自动清理 store/hStore/zStore */
  const ttlTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** 设置 key 过期（秒） */
  function setTTL(k: string, seconds: number): void {
    clearTTL(k);

    if (seconds > 0) {
      ttlTimers.set(
        k,
        setTimeout(() => {
          store.delete(k);
          hStore.delete(k);
          zStore.delete(k);
          ttlTimers.delete(k);
        }, seconds * 1000)
      );
    }
  }

  /** 清除 key 的 TTL */
  function clearTTL(k: string): void {
    const t = ttlTimers.get(k);

    if (t) {
      clearTimeout(t);
      ttlTimers.delete(k);
    }
  }

  g.redis = {
    // ─ String ─
    get: (k: string) => store.get(k) ?? null,
    set: (k: string, v: any, opts?: any) => {
      store.set(k, String(v));

      // 支持 redis.set(k, v, { EX: seconds }) 格式
      if (opts && typeof opts === 'object' && opts.EX) {
        setTTL(k, Number(opts.EX));
      }

      return 'OK';
    },
    del: (k: string) => {
      store.delete(k);
      hStore.delete(k);
      zStore.delete(k);
      clearTTL(k);

      return 1;
    },
    keys: (p: string) => {
      const re = new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
      const all = new Set([...store.keys(), ...hStore.keys(), ...zStore.keys()]);

      return [...all].filter(k => re.test(k));
    },
    exists: (k: string) => (store.has(k) || hStore.has(k) || zStore.has(k) ? 1 : 0),
    expire: (k: string, seconds: number) => {
      if (store.has(k) || hStore.has(k) || zStore.has(k)) {
        setTTL(k, seconds);

        return 1;
      }

      return 0;
    },
    incr: (k: string) => {
      const v = parseInt(store.get(k) ?? '0') + 1;

      store.set(k, String(v));

      return v;
    },
    setEx: (k: string, ttl: number, v: any) => {
      store.set(k, String(v));
      setTTL(k, ttl);

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
    /** 统计分数在 [min, max] 范围内的成员数 */
    zCount: (k: string, min: number | string, max: number | string) => {
      const arr = zStore.get(k) ?? [];
      const lo = min === '-inf' ? -Infinity : Number(min);
      const hi = max === '+inf' ? Infinity : Number(max);

      return arr.filter(i => i.score >= lo && i.score <= hi).length;
    },
    /** 获取成员的逆序排名（按分数从高到低，0-based），不存在返回 null */
    zRevRank: (k: string, v: string) => {
      const arr = zStore.get(k) ?? [];
      // 按分数降序排列
      const sorted = [...arr].sort((a, b) => b.score - a.score);
      const idx = sorted.findIndex(i => i.value === String(v));

      return idx >= 0 ? idx : null;
    },
    // 批量获取
    mGet: (keys: string[]) => keys.map(k => store.get(k) ?? null)
  };

  // ── Bot 对象 ──
  // 通过 callApi 实现真实的 icqq API 调用，经由 IPC → AlemonJS → 平台适配器
  const botInstance: any = {
    uin: 10000,
    nickname: 'Yunzai',
    /** 频道 tiny_id（非频道场景为空字符串） */
    tiny_id: '',
    /** 头像 URL */
    avatar: '',
    fl: new Map(),
    gl: new Map(),
    gml: new Map(),
    /** Bot 状态信息（兼容 icqq Bot.stat） */
    stat: {
      start_time: Math.floor(Date.now() / 1000),
      recv_msg_cnt: 0,
      sent_msg_cnt: 0,
      msg_cnt_per_min: 0,
      recv_pkt_cnt: 0,
      sent_pkt_cnt: 0,
      lost_pkt_cnt: 0
    },
    getFriendMap: () => botInstance.fl,
    getGroupMap: () => botInstance.gl,

    pickFriend: (uid: number) => makeFriendProxy(uid, ''),
    pickGroup: (gid: number) => makeGroupProxy(gid),
    pickUser: (uid: number) => makeFriendProxy(uid, ''),
    /** 快捷获取群成员（等效 pickGroup(gid).pickMember(uid)） */
    pickMember: (gid: number, uid: number) => makeGroupProxy(gid).pickMember(uid),

    /** 发送群消息（部分插件直接调用 Bot.sendGroupMsg） */
    sendGroupMsg: (gid: number, msg: any) => {
      const contents = serializeReply(msg);

      return callApi('sendGroupMsg', { group_id: gid, contents }).catch(() => ({}));
    },

    /** 发送私聊消息 */
    sendPrivateMsg: (uid: number, msg: any) => {
      const contents = serializeReply(msg);

      return callApi('sendPrivateMsg', { user_id: uid, contents }).catch(() => ({}));
    },

    /** 获取群列表（填充 gl） */
    getGroupList: () => callApi('getGroupList')
        .then((res: any) => {
          if (res?.data && Array.isArray(res.data)) {
            botInstance.gl.clear();
            for (const g of res.data) {
              botInstance.gl.set(g.group_id, g);
            }
          }

          return botInstance.gl;
        })
        .catch(() => botInstance.gl),

    /** 获取好友列表（填充 fl） */
    getFriendList: () => callApi('getFriendList')
        .then((res: any) => {
          if (res?.data && Array.isArray(res.data)) {
            botInstance.fl.clear();
            for (const f of res.data) {
              botInstance.fl.set(f.user_id, f);
            }
          }

          return botInstance.fl;
        })
        .catch(() => botInstance.fl),

    /** 获取陌生人信息 */
    getStrangerInfo: (uid: number) => callApi('getStrangerInfo', { user_id: uid }).catch(() => ({})),

    /** 获取登录号信息 */
    getLoginInfo: () => callApi('getLoginInfo')
        .then((res: any) => {
          if (res?.data) {
            botInstance.uin = res.data.UserId ?? res.data.user_id ?? botInstance.uin;
            botInstance.nickname = res.data.UserName ?? res.data.nickname ?? botInstance.nickname;
          }

          return { user_id: botInstance.uin, nickname: botInstance.nickname };
        })
        .catch(() => ({ user_id: botInstance.uin, nickname: botInstance.nickname })),

    /** 获取群成员列表（同时填充 gml 缓存） */
    getGroupMemberList: (gid: number) => callApi('getGroupMemberList', { group_id: gid })
        .then((res: any) => {
          if (res?.data && Array.isArray(res.data)) {
            const map = new Map();

            for (const m of res.data) {
              map.set(m.user_id, m);
            }
            botInstance.gml.set(gid, map);

            return map;
          }

          return botInstance.gml.get(gid) ?? new Map();
        })
        .catch(() => botInstance.gml.get(gid) ?? new Map()),

    /** 获取群成员信息 */
    getGroupMemberInfo: (gid: number, uid: number) => callApi('getGroupMemberInfo', { group_id: gid, user_id: uid }).catch(() => ({})),

    /** 获取转发消息（miao-plugin / ZZZ-Plugin 使用） */
    getForwardMsg: (resId: string) => callApi('getForwardMsg', { id: resId }).catch(() => ({ message: [] })),

    /**
     * 构造合并转发消息（Bot 级别）
     * ZZZ-Plugin / miao-plugin 使用 Bot.makeForwardMsg(msgs)
     * 展平节点为普通消息段数组
     */
    makeForwardMsg: (msgs: any[]) => {
      if (!Array.isArray(msgs) || msgs.length === 0) {
        return [];
      }
      const parts: any[] = [];

      for (const node of msgs) {
        const msg = node.message ?? node;
        const nickname = node.nickname ?? '';

        if (nickname) {
          parts.push({ type: 'text', text: `【${nickname}】\n` });
        }
        if (typeof msg === 'string') {
          parts.push({ type: 'text', text: msg + '\n' });
        } else if (Array.isArray(msg)) {
          parts.push(...msg);
          parts.push({ type: 'text', text: '\n' });
        } else if (msg && typeof msg === 'object') {
          parts.push(msg);
          parts.push({ type: 'text', text: '\n' });
        }
      }

      return parts;
    }
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
    at: (qq: number, text?: string) => ({ type: 'at', qq, text: text ?? '' }),
    face: (id: number) => ({ type: 'face', id }),
    text: (text: string) => ({ type: 'text', text }),
    record: (file: any) => ({ type: 'record', file }),
    video: (file: any) => ({ type: 'video', file }),
    json: (data: any) => ({ type: 'json', data: typeof data === 'string' ? data : JSON.stringify(data) }),
    xml: (data: string) => ({ type: 'xml', data }),
    poke: (id: number) => ({ type: 'poke', id }),
    reply: (id: any) => ({ type: 'reply', id }),
    share: (url: string, title?: string, content?: string, image?: string) => ({
      type: 'share',
      url,
      title: title ?? '',
      content: content ?? '',
      image: image ?? ''
    }),
    music: (type: string, id: any) => ({ type: 'music', data: { type, id } }),
    forward: (resId: string) => ({ type: 'forward', id: resId }),
    /** Yunzai polyfill — 按钮消息（多数平台不支持，返回空字符串） */
    button: () => ''
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
        let file: string;

        if (Buffer.isBuffer(msg.file)) {
          file = msg.file.toString('base64');
        } else {
          const filePath = String(msg.file);

          // file:// 路径 → 读取本地文件转 base64（Worker 与父进程 cwd 可能不同）
          if (filePath.startsWith('file://')) {
            try {
              const absPath = filePath.replace(/^file:\/\//, '');
              const buf = fs.readFileSync(absPath);

              file = buf.toString('base64');
            } catch {
              file = filePath; // 读取失败回退原始路径
            }
          } else if (filePath.startsWith('/') && !filePath.startsWith('http')) {
            // 绝对路径（非 URL）→ 尝试读取文件
            try {
              const buf = fs.readFileSync(filePath);

              file = buf.toString('base64');
            } catch {
              file = filePath;
            }
          } else {
            file = filePath;
          }
        }

        return [{ type: 'image', data: file }];
      }
      case 'at':
        return [{ type: 'at', data: String(msg.qq) }];
      case 'face':
        return [{ type: 'face', data: String(msg.id) }];
      case 'text':
        return [{ type: 'text', data: msg.text ?? '' }];
      case 'record': {
        const rf = Buffer.isBuffer(msg.file) ? msg.file.toString('base64') : String(msg.file ?? '');

        return [{ type: 'record', data: rf }];
      }
      case 'video': {
        const vf = Buffer.isBuffer(msg.file) ? msg.file.toString('base64') : String(msg.file ?? '');

        return [{ type: 'video', data: vf }];
      }
      case 'json':
        return [{ type: 'text', data: typeof msg.data === 'string' ? msg.data : JSON.stringify(msg.data) }];
      case 'xml':
        return [{ type: 'text', data: msg.data ?? '' }];
      case 'share':
        return [{ type: 'text', data: `${msg.title ?? ''} ${msg.url ?? ''}` }];
      case 'reply':
        return []; // 引用回复不作为内容发送
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
 * 群成员信息缓存（群号 → (用户号 → 成员信息)）
 * pickMember 优先返回缓存数据，支持 Yunzai 同步访问 .card / .nickname
 */
const memberCache = new Map<number, Map<number, any>>();

/**
 * 创建 e.group 代理对象
 * 通过 callApi 实现真实的群操作（踢人/禁言/撤回等）
 * OneBot 平台下完全兼容 icqq API
 *
 * @param groupId 群号
 * @param opts 可选初始信息（从 raw event 中提取）
 */
function makeGroupProxy(groupId: number, opts?: { name?: string; is_owner?: boolean; is_admin?: boolean }) {
  return {
    group_id: groupId,
    name: opts?.name ?? `Group ${groupId}`,
    is_owner: opts?.is_owner ?? false,
    is_admin: opts?.is_admin ?? false,
    mute_left: 0,

    /** 发送群消息 */
    sendMsg: (msg: any) => {
      const contents = serializeReply(msg);

      return callApi('sendGroupMsg', { group_id: groupId, contents }).catch(() => ({}));
    },

    /** 获取群成员列表（结果缓存到 memberCache） */
    getMemberMap: () => callApi('getGroupMemberList', { group_id: groupId })
        .then((res: any) => {
          const map = new Map();

          if (res?.data && Array.isArray(res.data)) {
            for (const m of res.data) {
              map.set(m.user_id, m);
            }
          }
          memberCache.set(groupId, map);

          return map;
        })
        .catch(() => memberCache.get(groupId) ?? new Map()),

    /**
     * 获取/操作指定成员
     * 优先返回缓存的同步数据（card/nickname），支持 Yunzai loader.js 同步访问
     * .info 为异步 Promise，需 await
     */
    pickMember: (uid: number) => {
      const cached = memberCache.get(groupId)?.get(uid);

      return {
        user_id: uid,
        card: cached?.card ?? cached?.nickname ?? '',
        nickname: cached?.nickname ?? '',
        role: cached?.role ?? 'member',
        info: callApi('getGroupMemberInfo', { group_id: groupId, user_id: uid })
          .then((res: any) => {
            if (res?.data) {
              if (!memberCache.has(groupId)) {
                memberCache.set(groupId, new Map());
              }
              memberCache.get(groupId)!.set(uid, res.data);
            }

            return res?.data ?? cached ?? {};
          })
          .catch(() => cached ?? {}),
        getAvatarUrl: () => `https://q1.qlogo.cn/g?b=qq&s=0&nk=${uid}`
      };
    },

    /** 撤回消息 */
    recallMsg: (messageId: any) => callApi('deleteMsg', { message_id: messageId }).catch(() => false),

    /** 禁言成员（duration=0 解除禁言） */
    muteMember: (uid: number, duration = 600) => callApi('setGroupBan', { group_id: groupId, user_id: uid, duration }).catch(() => false),

    /** 踢出成员 */
    kickMember: (uid: number, rejectAdd = false) => callApi('setGroupKick', { group_id: groupId, user_id: uid, reject_add_request: rejectAdd }).catch(() => false),

    /** 设置群名片 */
    setCard: (uid: number, card: string) => callApi('setGroupCard', { group_id: groupId, user_id: uid, card }).catch(() => false),

    /** 设置管理员 */
    setAdmin: (uid: number, enable = true) => callApi('setGroupAdmin', { group_id: groupId, user_id: uid, enable }).catch(() => false),

    /** 设置专属头衔 */
    setTitle: (uid: number, title: string, duration = -1) => callApi('setGroupSpecialTitle', { group_id: groupId, user_id: uid, special_title: title, duration }).catch(() => false),

    /** 退群 */
    quit: () => callApi('setGroupLeave', { group_id: groupId }).catch(() => false),

    /** 设置群名 */
    setName: (name: string) => callApi('setGroupName', { group_id: groupId, group_name: name }).catch(() => false),

    /** 全员禁言 */
    muteAll: (enable = true) => callApi('setGroupWholeBan', { group_id: groupId, enable }).catch(() => false),

    /**
     * 构造合并转发消息
     * 接受 [{user_id, nickname, message}, ...] 节点数组
     * 无法创建真实 QQ 转发卡片时 → 将内容展平为普通消息数组，仍可正常 reply
     */
    makeForwardMsg: (nodes: any[]) => {
      if (!Array.isArray(nodes) || nodes.length === 0) {
        return [];
      }
      // 展平所有节点消息为一条合并文本+媒体消息
      const parts: any[] = [];

      for (const node of nodes) {
        const msg = node.message ?? node;
        const nickname = node.nickname ?? '';

        if (nickname) {
          parts.push({ type: 'text', text: `【${nickname}】\n` });
        }
        if (typeof msg === 'string') {
          parts.push({ type: 'text', text: msg + '\n' });
        } else if (Array.isArray(msg)) {
          parts.push(...msg);
          parts.push({ type: 'text', text: '\n' });
        } else if (msg && typeof msg === 'object') {
          parts.push(msg);
          parts.push({ type: 'text', text: '\n' });
        }
      }

      return parts;
    },

    /** 获取群信息（兼容部分插件调用 e.group.getInfo()） */
    getInfo: () => callApi('getGroupInfo', { group_id: groupId })
        .then((res: any) => res?.data ?? { group_id: groupId, group_name: opts?.name ?? `Group ${groupId}` })
        .catch(() => ({ group_id: groupId, group_name: opts?.name ?? `Group ${groupId}` })),

    /**
     * 获取群聊天记录（miao-plugin / StarRail / ZZZ 使用此 API 解析引用回复中的图片）
     * seq 为消息序号，count 为获取条数
     * 返回格式：OneBot 消息段数组
     */
    getChatHistory: (seq: number, count = 1) => callApi('getChatHistory', { group_id: groupId, message_seq: seq, count })
        .then((res: any) => res?.data?.messages ?? res?.messages ?? res ?? [])
        .catch(() => [])
  };
}

/**
 * 创建 e.friend 代理对象
 * 通过 callApi 实现真实的私聊操作
 */
function makeFriendProxy(userId: number, userName: string) {
  return {
    user_id: userId,
    nickname: userName,
    remark: userName,

    /** 发送私聊消息 */
    sendMsg: (msg: any) => {
      const contents = serializeReply(msg);

      return callApi('sendPrivateMsg', { user_id: userId, contents }).catch(() => ({}));
    },

    /** 撤回消息 */
    recallMsg: (messageId: any) => callApi('deleteMsg', { message_id: messageId }).catch(() => false),

    getAvatarUrl: () => `https://q1.qlogo.cn/g?b=qq&s=0&nk=${userId}`,

    /** 获取私聊聊天记录 */
    getChatHistory: (seq: number, count = 1) => callApi('getChatHistory', { user_id: userId, message_seq: seq, count })
        .then((res: any) => res?.data?.messages ?? res?.messages ?? res ?? [])
        .catch(() => []),

    /**
     * 构造合并转发消息（私聊版本）
     * 同 group.makeForwardMsg，展平为普通消息数组
     */
    makeForwardMsg: (nodes: any[]) => {
      if (!Array.isArray(nodes) || nodes.length === 0) {
        return [];
      }
      const parts: any[] = [];

      for (const node of nodes) {
        const msg = node.message ?? node;
        const nickname = node.nickname ?? '';

        if (nickname) {
          parts.push({ type: 'text', text: `【${nickname}】\n` });
        }
        if (typeof msg === 'string') {
          parts.push({ type: 'text', text: msg + '\n' });
        } else if (Array.isArray(msg)) {
          parts.push(...msg);
          parts.push({ type: 'text', text: '\n' });
        } else if (msg && typeof msg === 'object') {
          parts.push(msg);
          parts.push({ type: 'text', text: '\n' });
        }
      }

      return parts;
    }
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
    getMemberMap: () => (groupId ? makeGroupProxy(groupId).getMemberMap() : new Map()),
    getAvatarUrl: (size = 0) => data.userAvatar ?? `https://q1.qlogo.cn/g?b=qq&s=${size}&nk=${userId}`,
    logText: `[${raw.post_type}:${raw.notice_type ?? raw.request_type ?? 'unknown'}:${groupId ?? userId}]`,
    logFnc: ''
  };

  if (groupId) {
    e.group = makeGroupProxy(groupId);
  }
  if (userId) {
    e.friend = makeFriendProxy(userId, data.userName ?? 'User');
    // e.member — 部分 notice 事件（如退群通知）插件会访问 e.member.card
    e.member = {
      user_id: userId,
      card: raw.sender?.card ?? raw.member?.card ?? data.userName ?? '',
      nickname: raw.sender?.nickname ?? raw.member?.nickname ?? data.userName ?? '',
      role: raw.sender?.role ?? 'member',
      is_admin: raw.sender?.role === 'admin' || raw.sender?.role === 'owner',
      is_owner: raw.sender?.role === 'owner',
      _info: {
        card: raw.sender?.card ?? raw.member?.card ?? data.userName ?? '',
        nickname: raw.sender?.nickname ?? raw.member?.nickname ?? data.userName ?? ''
      }
    };
  }

  if (raw.post_type === 'request') {
    e.approve = (approve = true) => callApi(raw.request_type === 'friend' ? 'setFriendAddRequest' : 'setGroupAddRequest', { flag: raw.flag, approve, type: raw.sub_type }).catch(() => false);
    e.reject = (reason = '') => callApi(raw.request_type === 'friend' ? 'setFriendAddRequest' : 'setGroupAddRequest', {
        flag: raw.flag,
        approve: false,
        reason,
        type: raw.sub_type
      }).catch(() => false);
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
    getMemberMap: () => (groupId ? makeGroupProxy(groupId).getMemberMap() : new Map()),
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
    e.approve = (approve = true) => callApi(requestMap.request_type === 'friend' ? 'setFriendAddRequest' : 'setGroupAddRequest', { flag: e.flag, approve, type: requestMap.sub_type }).catch(
        () => false
      );
    e.reject = (reason = '') => callApi(requestMap.request_type === 'friend' ? 'setFriendAddRequest' : 'setGroupAddRequest', {
        flag: e.flag,
        approve: false,
        reason,
        type: requestMap.sub_type
      }).catch(() => false);
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
    e.member = {
      user_id: userId,
      card: data.userName ?? '',
      nickname: data.userName ?? '',
      role: 'member',
      is_admin: data.isMaster,
      is_owner: data.isMaster,
      _info: {
        card: data.userName ?? '',
        nickname: data.userName ?? '',
        role: 'member'
      }
    };
  }

  // sender/nickname — dealMsg() 依赖 e.sender 存在
  e.sender = {
    user_id: userId,
    nickname: data.userName ?? 'User',
    card: data.userName ?? '',
    role: 'member'
  };
  e.nickname = data.userName ?? 'User';

  return e;
}

/**
 * 将跨平台 master 用户 ID 注入到 Cfg.masterQQ
 * 使 loader.js dealMsg() 中的 masterQQ.includes() 检查能正确识别
 */
function injectMasterQQ(userId: number | string): void {
  const cfg = (globalThis as any)._yunzaiCfg;

  if (!cfg) {
    return;
  }

  try {
    const masterList: any[] = cfg.masterQQ ?? [];
    const uid = Number(userId) || String(userId);

    if (!masterList.includes(uid)) {
      masterList.push(uid);
    }
  } catch {
    // Cfg 不可用时静默忽略
  }
}

function buildEvent(data: IPCEventMessage['data'], msgId: string) {
  const raw = data.rawEvent;
  const selfId = (globalThis as any).Bot?.uin ?? 10000;
  const platformTag = data.platform ? `[${data.platform}]` : '';

  // 跨平台 master 注入：确保 loader 的 cfg.masterQQ.includes() 检查通过
  if (data.isMaster && data.userId) {
    injectMasterQQ(data.userId);
  }

  // ── IPC 回复函数（始终覆盖，所有平台通用） ──
  const reply = (msg: any, _quote = false) => {
    const contents = serializeReply(msg);
    const replyId = `r_${++replyIdCounter}_${Date.now()}`;

    // 统计发送的消息数
    if ((globalThis as any).Bot?.stat) {
      (globalThis as any).Bot.stat.sent_msg_cnt++;
    }

    log('debug', `[reply] id=${msgId} replyId=${replyId} contents=${JSON.stringify(contents).slice(0, 200)}`);

    // 创建 Promise 等待父进程返回真实 message_id
    const resultPromise = new Promise<any>(resolve => {
      replyPending.set(replyId, { resolve });
      // 超时兜底：8s 后无论如何返回假 ID
      setTimeout(() => {
        if (replyPending.has(replyId)) {
          replyPending.delete(replyId);
          resolve({ message_id: `reply_${Date.now()}` });
        }
      }, 8_000);
    });

    ipcSend({ type: 'reply', id: msgId, replyId, contents });

    return resultPromise;
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

    // 提取引用回复信息（e.source / e.hasReply）
    // icqq: raw.source = { user_id, seq, time, message }
    // OneBot 标准: message 段中 type=reply 的 data.id
    const replySegment = normalizedMessage.find((s: any) => s.type === 'reply');
    const hasReply = !!replySegment;
    const source =
      raw.source ??
      (replySegment
        ? {
            user_id: replySegment.qq ?? replySegment.user_id ?? 0,
            seq: replySegment.id ?? replySegment.seq ?? raw.message_id,
            time: raw.time ?? Math.floor(Date.now() / 1000),
            message: replySegment.message ?? ''
          }
        : undefined);

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

      // ── 引用回复信息（miao-plugin 用 e.source 解析被引用消息中的图片） ──
      source,
      hasReply,

      isMaster: data.isMaster,
      isOwner: data.isMaster,
      isAdmin: data.isMaster || raw.sender?.role === 'admin' || raw.sender?.role === 'owner',

      reply,
      getMemberMap: () => (isGroup ? makeGroupProxy(groupId).getMemberMap() : new Map()),
      getAvatarUrl: (size = 0) => data.userAvatar ?? `https://q1.qlogo.cn/g?b=qq&s=${size}&nk=${userId}`,
      toString: () => rawMessage,

      // ── group / friend 代理（传递 raw 事件中的群信息） ──
      ...(isGroup
        ? {
            group: makeGroupProxy(groupId, {
              name: raw.group_name ?? `Group ${groupId}`,
              is_owner: raw.sender?.role === 'owner',
              is_admin: raw.sender?.role === 'admin' || raw.sender?.role === 'owner'
            }),
            friend: undefined
          }
        : { group: undefined, friend: makeFriendProxy(userId, raw.sender?.nickname ?? data.userName ?? 'User') }),

      // ── member 信息（供 dealMsg e.member 引用及 filtPermission 权限判断） ──
      member: {
        user_id: userId,
        card: raw.sender?.card ?? raw.sender?.nickname ?? data.userName ?? '',
        nickname: raw.sender?.nickname ?? data.userName ?? '',
        role: raw.sender?.role ?? 'member',
        is_admin: raw.sender?.role === 'admin' || raw.sender?.role === 'owner',
        is_owner: raw.sender?.role === 'owner',
        _info: {
          card: raw.sender?.card ?? raw.sender?.nickname ?? data.userName ?? '',
          nickname: raw.sender?.nickname ?? data.userName ?? '',
          role: raw.sender?.role ?? 'member'
        }
      },

      /** dealMsg 对 e.nickname 的兜底判断用 */
      nickname: raw.sender?.card ?? raw.sender?.nickname ?? data.userName ?? 'User',

      /** 便捷方法：构建转发消息（等效 e.group.makeForwardMsg / e.friend.makeForwardMsg） */
      makeForwardMsg: (nodes: any[]) => {
        if (isGroup && groupId) {
          return makeGroupProxy(groupId).makeForwardMsg(nodes);
        }

        return makeFriendProxy(userId, data.userName ?? 'User').makeForwardMsg(nodes);
      }
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
    getMemberMap: () => (isGroup ? makeGroupProxy(groupId).getMemberMap() : new Map()),
    getAvatarUrl: (size = 0) => data.userAvatar ?? `https://q1.qlogo.cn/g?b=qq&s=${size}&nk=${userId}`,
    toString: () => data.messageText,

    // ── group / friend 代理 ──
    ...(isGroup ? { group: makeGroupProxy(groupId), friend: undefined } : { group: undefined, friend: makeFriendProxy(userId, data.userName ?? 'User') }),

    // ── member 信息（filtPermission 需要 is_admin/is_owner/_info） ──
    member: {
      user_id: userId,
      card: data.userName ?? '',
      nickname: data.userName ?? '',
      role: 'member',
      is_admin: data.isMaster,
      is_owner: data.isMaster,
      _info: {
        card: data.userName ?? '',
        nickname: data.userName ?? '',
        role: 'member'
      }
    },

    nickname: data.userName ?? 'User',

    /** 便捷方法：构建转发消息 */
    makeForwardMsg: (nodes: any[]) => {
      if (isGroup && groupId) {
        return makeGroupProxy(groupId).makeForwardMsg(nodes);
      }

      return makeFriendProxy(userId, data.userName ?? 'User').makeForwardMsg(nodes);
    }
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
    const stateArr = new Map<string, any>();

    (globalThis as any).plugin = class {
      name = 'plugin';
      dsc = '';
      event = 'message';
      priority = 5000;
      rule: any[] = [];
      task: any = null;
      handler: any = null;
      namespace = '';
      e: any = null;
      constructor(opt: any = {}) {
        Object.assign(this, opt);
      }
      reply(msg: any, quote?: boolean) {
        return this.e?.reply?.(msg, quote);
      }
      conKey(isGroup = false) {
        if (isGroup) {
          return `${this.name}.${this.e?.group_id}`;
        }

        return `${this.name}.${this.e?.user_id}`;
      }
      setContext(type: string, isGroup = false, time = 120) {
        const key = this.conKey(isGroup);

        stateArr.set(key, { type });
        if (time > 0) {
          setTimeout(() => {
            if (stateArr.has(key)) {
              stateArr.delete(key);
              this.e?.reply?.('操作超时已取消');
            }
          }, time * 1000);
        }
      }
      getContext(type?: string, isGroup = false) {
        const key = this.conKey(isGroup);
        const ctx = stateArr.get(key);

        if (type && ctx?.type !== type) {
          return undefined;
        }

        return ctx;
      }
      finish(_type?: string, isGroup = false) {
        const key = this.conKey(isGroup);

        stateArr.delete(key);
      }
      /** 等待上下文回复（Promise 模式） */
      awaitContext(type: string, isGroup = false, time = 120): Promise<any> {
        return new Promise((resolve, reject) => {
          this.setContext(type, isGroup, time);
          const key = this.conKey(isGroup);
          const check = setInterval(() => {
            const ctx = stateArr.get(key);

            if (!ctx) {
              clearInterval(check);
              reject(new Error('上下文已超时'));
            } else if (ctx.resolve) {
              clearInterval(check);
              stateArr.delete(key);
              resolve(ctx.resolve);
            }
          }, 500);

          // 超时后清理 interval
          setTimeout(() => clearInterval(check), (time + 5) * 1000);
        });
      }
      /** 解析上下文（与 awaitContext 配合） */
      resolveContext(e: any) {
        const key = this.conKey(!!e?.isGroup);
        const ctx = stateArr.get(key);

        if (ctx) {
          ctx.resolve = e;
        }
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

    // 5a. 注入跨平台 master 用户到 Cfg.masterQQ
    //     loader 的 dealMsg 用 cfg.masterQQ.includes() 覆盖 e.isMaster
    //     跨平台用户的 userId 如果不在列表里就会变成非 master
    try {
      const cfgMod = await import(pathToFileURL(path.join(cwd, 'lib', 'config', 'config.js')).href);
      const cfg = cfgMod.default ?? cfgMod.cfg;

      if (cfg) {
        // 保存 cfg 引用供后续新增 master 时注入
        (globalThis as any)._yunzaiCfg = cfg;
        log('info', `Cfg 实例已获取，当前 masterQQ: [${cfg.masterQQ}]`);
      }
    } catch {
      log('warn', '获取 Cfg 实例失败，跨平台 master 需手动配置 masterQQ');
    }

    // 5b. 预填充 Bot.fl / Bot.gl（定时任务和 relpyPrivate 依赖非空列表）
    void (globalThis as any).Bot?.getGroupList?.()?.catch?.(() => {});
    void (globalThis as any).Bot?.getFriendList?.()?.catch?.(() => {});

    ipcSend({ type: 'ready', pluginCount: count });
  } catch (err: any) {
    log('error', `插件加载失败: ${err.message}`);
    ipcSend({ type: 'error', message: `插件加载失败: ${err.message}` });
    process.exit(1);
  }

  // 6. 监听父进程 IPC 消息
  process.on('message', (msg: ParentToWorker) => {
    if (msg.type === 'event') {
      // 记录当前事件的平台，供 callApi 自动附加
      currentPlatform = msg.data.platform ?? '';
      // 记录默认平台（定时任务触发时用此兜底）
      if (currentPlatform) {
        defaultPlatform = currentPlatform;
      }
      // 统计收到的消息数
      if ((globalThis as any).Bot?.stat) {
        (globalThis as any).Bot.stat.recv_msg_cnt++;
      }

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
            replyId: `r_${++replyIdCounter}_${Date.now()}`,
            contents: [{ type: 'text', data: `[Yunzai 错误] ${err.message}` }]
          });
          replied = true;
        }
        // 通知父进程 deal 已完成
        ipcSend({ type: 'done', id: msg.id, replied });
      })();
    } else if (msg.type === 'api_response') {
      handleApiResponse(msg);
    } else if (msg.type === 'reply_result') {
      handleReplyResult(msg);
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
