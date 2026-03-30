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
    info:  (...a: any[]) => log('info',  ...a.map(String)),
    warn:  (...a: any[]) => log('warn',  ...a.map(String)),
    error: (...a: any[]) => log('error', ...a.map(String)),
    debug: (...a: any[]) => log('debug', ...a.map(String)),
    mark:  (...a: any[]) => log('info',  '[MARK]', ...a.map(String)),
    trace: (...a: any[]) => log('debug', '[TRACE]', ...a.map(String)),
    fatal: (...a: any[]) => log('error', '[FATAL]', ...a.map(String)),
    // chalk 颜色方法（子进程无终端色彩，透传原文）
    chalk:   { red: identity, green: identity, yellow: identity, blue: identity, magenta: identity, cyan: identity },
    red:     identity,
    green:   identity,
    yellow:  identity,
    blue:    identity,
    magenta: identity,
    cyan:    identity,
  };

  // ── redis (内存模拟，支持 String / Hash / Sorted Set) ──
  const store = new Map<string, string>();
  const hStore = new Map<string, Map<string, string>>();
  const zStore = new Map<string, { value: string; score: number }[]>();

  g.redis = {
    // ─ String ─
    get:    async (k: string) => store.get(k) ?? null,
    set:    async (k: string, v: any, _opts?: any) => { store.set(k, String(v)); return 'OK'; },
    del:    async (k: string) => { store.delete(k); hStore.delete(k); zStore.delete(k); return 1; },
    keys:   async (p: string) => {
      const re = new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
      const all = new Set([...store.keys(), ...hStore.keys(), ...zStore.keys()]);
      return [...all].filter(k => re.test(k));
    },
    exists: async (k: string) => (store.has(k) || hStore.has(k) || zStore.has(k)) ? 1 : 0,
    expire: async () => 1,
    incr:   async (k: string) => {
      const v = parseInt(store.get(k) || '0') + 1;
      store.set(k, String(v));
      return v;
    },
    setEx:  async (k: string, _ttl: number, v: any) => { store.set(k, String(v)); return 'OK'; },
    sendCommand: async () => null,
    connect:     async () => {},
    disconnect:  async () => {},
    save:        async () => 'OK',

    // ─ Hash ─
    hGet: async (k: string, f: string) => hStore.get(k)?.get(f) ?? null,
    hSet: async (k: string, f: string, v: string) => {
      if (!hStore.has(k)) hStore.set(k, new Map());
      hStore.get(k)!.set(f, v);
      return 1;
    },
    hDel: async (k: string, f: string) => {
      const m = hStore.get(k);
      if (!m) return 0;
      return m.delete(f) ? 1 : 0;
    },
    hGetAll: async (k: string) => {
      const m = hStore.get(k);
      if (!m) return {};
      return Object.fromEntries(m);
    },
    hLen: async (k: string) => hStore.get(k)?.size ?? 0,

    // ─ Sorted Set ─
    zAdd: async (k: string, ...args: any[]) => {
      if (!zStore.has(k)) zStore.set(k, []);
      const arr = zStore.get(k)!;
      for (const a of args) {
        const { score, value } = typeof a === 'object' ? a : { score: 0, value: '' };
        const idx = arr.findIndex(e => e.value === String(value));
        if (idx >= 0) arr[idx].score = score;
        else arr.push({ value: String(value), score });
      }
      arr.sort((a, b) => a.score - b.score);
      return 1;
    },
    zRange: async (k: string, start: number, stop: number) => {
      const arr = zStore.get(k) || [];
      const s = start < 0 ? Math.max(arr.length + start, 0) : start;
      const e = stop < 0 ? arr.length + stop : stop;
      return arr.slice(s, e + 1).map(i => i.value);
    },
    zRangeWithScores: async (k: string, start: number, stop: number) => {
      const arr = zStore.get(k) || [];
      const s = start < 0 ? Math.max(arr.length + start, 0) : start;
      const e = stop < 0 ? arr.length + stop : stop;
      return arr.slice(s, e + 1);
    },
    zRangeByScore: async (k: string, min: number, max: number) => {
      const arr = zStore.get(k) || [];
      return arr.filter(i => i.score >= min && i.score <= max).map(i => i.value);
    },
    zRangeByScoreWithScores: async (k: string, min: number, max: number) => {
      const arr = zStore.get(k) || [];
      return arr.filter(i => i.score >= min && i.score <= max);
    },
    zScore: async (k: string, v: string) => {
      const arr = zStore.get(k) || [];
      const found = arr.find(i => i.value === v);
      return found ? found.score : null;
    },
    zDel: async (k: string, v: string) => {
      const arr = zStore.get(k);
      if (!arr) return 0;
      const idx = arr.findIndex(i => i.value === v);
      if (idx >= 0) { arr.splice(idx, 1); return 1; }
      return 0;
    },
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
    getGroupMap:  () => botInstance.gl,
    pickFriend: (uid: number) => ({
      sendMsg: async () => ({}),
      user_id: uid,
    }),
    pickGroup: (gid: number) => ({
      sendMsg: async () => ({}),
      group_id: gid,
      pickMember: () => ({ info: {} }),
    }),
    pickUser: (uid: number) => ({
      sendMsg: async () => ({}),
      user_id: uid,
    }),
    sendPrivateMsg: async () => ({}),
  };
  g.Bot = new Proxy(botInstance, {
    get(target, prop) {
      // Bot[uin] → 返回 bot 自身（Yunzai 用 Bot[e.self_id] 取实例）
      if (typeof prop === 'string' && /^\d+$/.test(prop)) return target;
      return target[prop];
    },
  });

  // ── segment (icqq 消息段构造) ──
  g.segment = {
    image: (file: any) => ({ type: 'image', file }),
    at:    (qq: number) => ({ type: 'at', qq }),
    face:  (id: number) => ({ type: 'face', id }),
    text:  (text: string) => ({ type: 'text', text }),
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
        const file = Buffer.isBuffer(msg.file)
          ? msg.file.toString('base64')
          : String(msg.file);
        return [{ type: 'image', data: file }];
      }
      case 'at':
        return [{ type: 'at', data: String(msg.qq) }];
      case 'face':
        return [{ type: 'face', data: String(msg.id) }];
      case 'text':
        return [{ type: 'text', data: msg.text || '' }];
      default:
        return [{ type: 'other', data: JSON.stringify(msg) }];
    }
  }
  return [{ type: 'text', data: String(msg) }];
}

// ━━━━━━━━━━━━━━━ 构建 icqq 事件 ━━━━━━━━━━━━━━━

function buildEvent(data: IPCEventMessage['data'], msgId: string) {
  const isGroup = !data.isPrivate;
  const userId  = parseInt(data.userId) || 10001;
  const groupId = isGroup ? (parseInt(data.spaceId) || 10002) : 0;

  const e: any = {
    post_type:    'message',
    message_type: isGroup ? 'group' : 'private',
    sub_type:     isGroup ? 'normal' : 'friend',
    user_id:      userId,
    sender: {
      user_id:  userId,
      nickname: data.userName || 'User',
      card:     data.userName || '',
    },

    message:     [{ type: 'text', text: data.messageText }],
    raw_message: data.messageText,
    msg:         '',

    group_id:    groupId,
    group_name:  isGroup ? `Group ${groupId}` : '',

    isMaster: data.isMaster,
    isOwner:  data.isMaster,
    isAdmin:  data.isMaster,

    seq:     Date.now(),
    rand:    Math.random(),
    time:    Math.floor(Date.now() / 1000),
    self_id: (globalThis as any).Bot?.uin || 10000,
    font:    '',
    atme:    false,
    atall:   false,

    // ── reply: 通过 IPC 回传 ──
    reply: async (msg: any, _quote = false) => {
      const contents = serializeReply(msg);
      log('info', `[reply] id=${msgId} contents=${JSON.stringify(contents).slice(0, 200)}`);
      ipcSend({
        type: 'reply',
        id: msgId,
        contents,
      });
      return { message_id: `reply_${Date.now()}` };
    },

    getMemberMap: async () => new Map(),
    getAvatarUrl: (size = 0) =>
      `https://q1.qlogo.cn/g?b=qq&s=${size}&nk=${userId}`,
    toString: () => data.messageText,
  };

  e.original_msg = e.msg;
  e.logText = `[${isGroup ? 'Group' : 'Private'}:${isGroup ? groupId : userId}] ${data.messageText}`;
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
    const mod = await import(path.join(cwd, 'lib', 'plugins', 'plugin.js'));
    (globalThis as any).plugin = mod.default || mod.plugin;
    log('info', 'plugin 基类加载成功');
  } catch (err: any) {
    log('warn', `plugin 基类加载失败，使用内置空壳: ${err.message}`);
    (globalThis as any).plugin = class {
      name = 'plugin'; dsc = ''; event = 'message'; priority = 5000;
      rule: any[] = [];
      e: any = null;
      constructor(opt: any = {}) { Object.assign(this, opt); }
      reply(msg: any, quote?: boolean) { return this.e?.reply?.(msg, quote); }
    };
  }

  // 4. 加载 PluginsLoader
  try {
    const mod = await import(path.join(cwd, 'lib', 'plugins', 'loader.js'));
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
    const count = PluginsLoader.priority?.length || 0;
    log('info', `插件加载完成，共 ${count} 个`);
    ipcSend({ type: 'ready', pluginCount: count });
  } catch (err: any) {
    log('error', `插件加载失败: ${err.message}`);
    ipcSend({ type: 'error', message: `插件加载失败: ${err.message}` });
    process.exit(1);
  }

  // 6. 监听父进程 IPC 消息
  process.on('message', async (msg: ParentToWorker) => {
    if (msg.type === 'event') {
      const e = buildEvent(msg.data, msg.id);
      try {
        await PluginsLoader.deal(e);
      } catch (err: any) {
        log('error', `deal 异常: ${err.message}`);
        log('error', err.stack || '');
        ipcSend({
          type: 'reply',
          id: msg.id,
          contents: [{ type: 'text', data: `[Yunzai 错误] ${err.message}` }],
        });
      }
    } else if (msg.type === 'shutdown') {
      log('info', 'Worker 收到关闭信号，退出');
      process.exit(0);
    }
  });
}

main().catch((err) => {
  log('error', `Worker 启动失败: ${err.message}`);
  process.exit(1);
});
