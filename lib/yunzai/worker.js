import fs from 'node:fs';
import path from 'node:path';

function ipcSend(msg) {
    process.send?.(msg);
}
function log(level, ...args) {
    ipcSend({ type: 'log', level, args });
}
function injectGlobals() {
    const g = globalThis;
    const identity = (s) => String(s);
    g.logger = {
        info: (...a) => log('info', ...a.map(String)),
        warn: (...a) => log('warn', ...a.map(String)),
        error: (...a) => log('error', ...a.map(String)),
        debug: (...a) => log('debug', ...a.map(String)),
        mark: (...a) => log('info', '[MARK]', ...a.map(String)),
        trace: (...a) => log('debug', '[TRACE]', ...a.map(String)),
        fatal: (...a) => log('error', '[FATAL]', ...a.map(String)),
        chalk: { red: identity, green: identity, yellow: identity, blue: identity, magenta: identity, cyan: identity },
        red: identity,
        green: identity,
        yellow: identity,
        blue: identity,
        magenta: identity,
        cyan: identity
    };
    const store = new Map();
    const hStore = new Map();
    const zStore = new Map();
    g.redis = {
        get: (k) => store.get(k) ?? null,
        set: (k, v, _opts) => {
            store.set(k, String(v));
            return 'OK';
        },
        del: (k) => {
            store.delete(k);
            hStore.delete(k);
            zStore.delete(k);
            return 1;
        },
        keys: (p) => {
            const re = new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
            const all = new Set([...store.keys(), ...hStore.keys(), ...zStore.keys()]);
            return [...all].filter(k => re.test(k));
        },
        exists: (k) => (store.has(k) || hStore.has(k) || zStore.has(k) ? 1 : 0),
        expire: () => 1,
        incr: (k) => {
            const v = parseInt(store.get(k) ?? '0') + 1;
            store.set(k, String(v));
            return v;
        },
        setEx: (k, _ttl, v) => {
            store.set(k, String(v));
            return 'OK';
        },
        sendCommand: () => null,
        connect: async () => { },
        disconnect: async () => { },
        save: () => 'OK',
        hGet: (k, f) => hStore.get(k)?.get(f) ?? null,
        hSet: (k, f, v) => {
            if (!hStore.has(k)) {
                hStore.set(k, new Map());
            }
            hStore.get(k).set(f, v);
            return 1;
        },
        hDel: (k, f) => {
            const m = hStore.get(k);
            if (!m) {
                return 0;
            }
            return m.delete(f) ? 1 : 0;
        },
        hGetAll: (k) => {
            const m = hStore.get(k);
            if (!m) {
                return {};
            }
            return Object.fromEntries(m);
        },
        hLen: (k) => hStore.get(k)?.size ?? 0,
        zAdd: (k, ...args) => {
            if (!zStore.has(k)) {
                zStore.set(k, []);
            }
            const arr = zStore.get(k);
            for (const a of args) {
                const { score, value } = typeof a === 'object' ? a : { score: 0, value: '' };
                const idx = arr.findIndex(e => e.value === String(value));
                if (idx >= 0) {
                    arr[idx].score = score;
                }
                else {
                    arr.push({ value: String(value), score });
                }
            }
            arr.sort((a, b) => a.score - b.score);
            return 1;
        },
        zRange: (k, start, stop) => {
            const arr = zStore.get(k) ?? [];
            const s = start < 0 ? Math.max(arr.length + start, 0) : start;
            const e = stop < 0 ? arr.length + stop : stop;
            return arr.slice(s, e + 1).map(i => i.value);
        },
        zRangeWithScores: (k, start, stop) => {
            const arr = zStore.get(k) ?? [];
            const s = start < 0 ? Math.max(arr.length + start, 0) : start;
            const e = stop < 0 ? arr.length + stop : stop;
            return arr.slice(s, e + 1);
        },
        zRangeByScore: (k, min, max) => {
            const arr = zStore.get(k) ?? [];
            return arr.filter(i => i.score >= min && i.score <= max).map(i => i.value);
        },
        zRangeByScoreWithScores: (k, min, max) => {
            const arr = zStore.get(k) ?? [];
            return arr.filter(i => i.score >= min && i.score <= max);
        },
        zScore: (k, v) => {
            const arr = zStore.get(k) ?? [];
            const found = arr.find(i => i.value === v);
            return found ? found.score : null;
        },
        zDel: (k, v) => {
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
        zRem: (k, v) => {
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
        zRemRangeByScore: (k, min, max) => {
            const arr = zStore.get(k);
            if (!arr) {
                return 0;
            }
            const before = arr.length;
            const filtered = arr.filter(i => i.score < min || i.score > max);
            zStore.set(k, filtered);
            return before - filtered.length;
        },
        zCard: (k) => zStore.get(k)?.length ?? 0,
        mGet: (keys) => keys.map(k => store.get(k) ?? null)
    };
    const botInstance = {
        uin: 10000,
        nickname: 'Yunzai',
        fl: new Map(),
        gl: new Map(),
        gml: new Map(),
        getFriendMap: () => botInstance.fl,
        getGroupMap: () => botInstance.gl,
        pickFriend: (uid) => ({
            sendMsg: () => ({}),
            user_id: uid
        }),
        pickGroup: (gid) => ({
            sendMsg: () => ({}),
            group_id: gid,
            pickMember: () => ({ info: {} })
        }),
        pickUser: (uid) => ({
            sendMsg: () => ({}),
            user_id: uid
        }),
        sendPrivateMsg: () => ({})
    };
    g.Bot = new Proxy(botInstance, {
        get(target, prop) {
            if (typeof prop === 'string' && /^\d+$/.test(prop)) {
                return target;
            }
            return target[prop];
        }
    });
    g.segment = {
        image: (file) => ({ type: 'image', file }),
        at: (qq) => ({ type: 'at', qq }),
        face: (id) => ({ type: 'face', id }),
        text: (text) => ({ type: 'text', text })
    };
}
function serializeReply(msg) {
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
function extractText(message) {
    return message
        .filter((s) => s.type === 'text')
        .map((s) => s.data?.text ?? s.text ?? '')
        .join('')
        .trim();
}
function detectAtMe(message, selfId) {
    return message.some((s) => s.type === 'at' && String(s.data?.qq ?? s.qq) === String(selfId));
}
function detectAtAll(message) {
    return message.some((s) => s.type === 'at' && (s.data?.qq === 'all' || s.qq === 'all'));
}
function mediaToSegments(media) {
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
function normalizeSegments(message) {
    return message.map((seg) => {
        if (seg.data && typeof seg.data === 'object') {
            return { type: seg.type, ...seg.data };
        }
        return seg;
    });
}
function safeInt(v, fallback) {
    const n = parseInt(String(v));
    return Number.isFinite(n) ? n : fallback;
}
function makeGroupProxy(groupId) {
    return {
        group_id: groupId,
        name: `Group ${groupId}`,
        is_owner: false,
        is_admin: false,
        mute_left: 0,
        sendMsg: () => ({}),
        getMemberMap: () => new Map(),
        pickMember: (uid) => ({
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
function makeFriendProxy(userId, userName) {
    return {
        user_id: userId,
        nickname: userName,
        remark: userName,
        sendMsg: () => ({}),
        getAvatarUrl: () => `https://q1.qlogo.cn/g?b=qq&s=0&nk=${userId}`
    };
}
function isMessageEventName(name) {
    return name.includes('message.create') || name.includes('interaction');
}
const EVENT_NOTICE_MAP = {
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
const EVENT_REQUEST_MAP = {
    'private.friend.add': { request_type: 'friend', sub_type: 'add' },
    'private.guild.add': { request_type: 'group', sub_type: 'invite' }
};
function buildRawNonMessageEvent(raw, data, selfId, reply) {
    const userId = raw.user_id ?? safeInt(data.userId, 10001);
    const groupId = raw.group_id ?? safeInt(data.spaceId, 0);
    const e = {
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
function buildFallbackNonMessageEvent(data, selfId, platformTag, reply, eventName) {
    const userId = safeInt(data.userId, 10001);
    const groupId = data.isPrivate ? 0 : safeInt(data.spaceId, 0);
    const e = {
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
    }
    else if (requestMap) {
        e.post_type = 'request';
        e.request_type = requestMap.request_type;
        e.sub_type = requestMap.sub_type;
        e.comment = '';
        e.flag = `${eventName}_${Date.now()}`;
        e.approve = () => true;
        e.reject = () => true;
        e.logText = `${platformTag}[Request:${requestMap.request_type}:${userId}]`;
    }
    else {
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
function buildEvent(data, msgId) {
    const raw = data.rawEvent;
    const selfId = globalThis.Bot?.uin ?? 10000;
    const platformTag = data.platform ? `[${data.platform}]` : '';
    const reply = (msg, _quote = false) => {
        const contents = serializeReply(msg);
        log('debug', `[reply] id=${msgId} contents=${JSON.stringify(contents).slice(0, 200)}`);
        ipcSend({ type: 'reply', id: msgId, contents });
        return { message_id: `reply_${Date.now()}` };
    };
    if (raw && typeof raw === 'object' && raw.post_type) {
        if (raw.post_type !== 'message') {
            return buildRawNonMessageEvent(raw, data, selfId, reply);
        }
        const isGroup = raw.message_type === 'group';
        const userId = raw.user_id ?? safeInt(data.userId, 10001);
        const groupId = raw.group_id ?? (isGroup ? safeInt(data.spaceId, 0) : 0);
        const message = Array.isArray(raw.message) ? raw.message : [{ type: 'text', text: data.messageText }];
        const normalizedMessage = normalizeSegments(message);
        const rawMessage = raw.raw_message ?? extractText(normalizedMessage);
        const atme = detectAtMe(normalizedMessage, selfId);
        const atall = detectAtAll(normalizedMessage);
        const e = {
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
            ...(isGroup ? { group: makeGroupProxy(groupId), friend: undefined } : { group: undefined, friend: makeFriendProxy(userId, data.userName ?? 'User') })
        };
        e.original_msg = rawMessage;
        e.logText = `[${isGroup ? 'Group' : 'Private'}:${isGroup ? groupId : userId}] ${rawMessage}`;
        e.logFnc = '';
        return e;
    }
    const eventName = data.eventName ?? '';
    if (eventName && !isMessageEventName(eventName)) {
        return buildFallbackNonMessageEvent(data, selfId, platformTag, reply, eventName);
    }
    const isGroup = !data.isPrivate;
    const userId = safeInt(data.userId, 10001);
    const groupId = isGroup ? safeInt(data.spaceId, 10002) : 0;
    const messageParts = [];
    if (data.messageText) {
        messageParts.push({ type: 'text', text: data.messageText });
    }
    messageParts.push(...mediaToSegments(data.media));
    if (messageParts.length === 0) {
        messageParts.push({ type: 'text', text: '' });
    }
    const e = {
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
        ...(isGroup ? { group: makeGroupProxy(groupId), friend: undefined } : { group: undefined, friend: makeFriendProxy(userId, data.userName ?? 'User') })
    };
    e.original_msg = data.messageText;
    e.logText = `${platformTag}[${isGroup ? 'Group' : 'Private'}:${isGroup ? groupId : userId}] ${data.messageText}`;
    e.logFnc = '';
    return e;
}
let PluginsLoader = null;
async function main() {
    const cwd = process.cwd();
    log('info', `Worker 启动, cwd=${cwd}`);
    injectGlobals();
    const configDir = path.join(cwd, 'config', 'config');
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }
    try {
        const mod = await import(path.join(cwd, 'lib', 'plugins', 'plugin.js'));
        globalThis.plugin = mod.default ?? mod.plugin;
        log('info', 'plugin 基类加载成功');
    }
    catch (err) {
        log('warn', `plugin 基类加载失败，使用内置空壳: ${err.message}`);
        globalThis.plugin = class {
            name = 'plugin';
            dsc = '';
            event = 'message';
            priority = 5000;
            rule = [];
            e = null;
            constructor(opt = {}) {
                Object.assign(this, opt);
            }
            reply(msg, quote) {
                return this.e?.reply?.(msg, quote);
            }
        };
    }
    try {
        const mod = await import(path.join(cwd, 'lib', 'plugins', 'loader.js'));
        PluginsLoader = mod.default;
        log('info', 'PluginsLoader 加载成功');
    }
    catch (err) {
        log('error', `PluginsLoader 加载失败: ${err.message}`);
        ipcSend({ type: 'error', message: `Loader 加载失败: ${err.message}` });
        process.exit(1);
    }
    try {
        await PluginsLoader.load();
        const count = PluginsLoader.priority?.length ?? 0;
        log('info', `插件加载完成，共 ${count} 个`);
        ipcSend({ type: 'ready', pluginCount: count });
    }
    catch (err) {
        log('error', `插件加载失败: ${err.message}`);
        ipcSend({ type: 'error', message: `插件加载失败: ${err.message}` });
        process.exit(1);
    }
    process.on('message', (msg) => {
        if (msg.type === 'event') {
            const e = buildEvent(msg.data, msg.id);
            let replied = false;
            const origReply = e.reply;
            e.reply = (m, q = false) => {
                replied = true;
                return origReply(m, q);
            };
            void (async () => {
                try {
                    await PluginsLoader.deal(e);
                }
                catch (err) {
                    log('error', `deal 异常: ${err.message}`);
                    log('error', err.stack ?? '');
                    ipcSend({
                        type: 'reply',
                        id: msg.id,
                        contents: [{ type: 'text', data: `[Yunzai 错误] ${err.message}` }]
                    });
                    replied = true;
                }
                ipcSend({ type: 'done', id: msg.id, replied });
            })();
        }
        else if (msg.type === 'shutdown') {
            log('info', 'Worker 收到关闭信号，退出');
            process.exit(0);
        }
    });
}
main().catch(err => {
    log('error', `Worker 启动失败: ${err.message}`);
    process.exit(1);
});
