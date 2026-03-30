import { isMaster } from '../utils.js';
import { useMessage, logger, Format, useRequest, useUser, useMe, useGuild, useMember, sendToUser, sendToChannel } from 'alemonjs';
import { manager } from './manager.js';

let _useClientFn = null;
async function loadOneBotClient() {
    if (_useClientFn !== null) {
        return;
    }
    try {
        const mod = await import('@alemonjs/onebot');
        _useClientFn = mod.useClient;
        logger.info('[bridge] @alemonjs/onebot useClient 已加载');
    }
    catch {
        _useClientFn = false;
        logger.debug('[bridge] @alemonjs/onebot 不可用，OneBot 特有 API 将降级处理');
    }
}
function getOneBotClient(event) {
    if (!_useClientFn || _useClientFn === false) {
        return null;
    }
    try {
        const [client] = _useClientFn(event);
        return client;
    }
    catch {
        return null;
    }
}
const pending = new Map();
const REPLY_IDLE_TIMEOUT = 8_000;
const REPLY_MAX_TIMEOUT = 120_000;
let idCounter = 0;
let listenerBound = false;
let doneListenerBound = false;
function bindReplyListener() {
    if (listenerBound) {
        return;
    }
    listenerBound = true;
    manager.onReply((reply) => {
        logger.info(`[bridge] 收到 reply id=${reply.id} replyId=${reply.replyId} contents=${reply.contents.length}`);
        const ctx = pending.get(reply.id);
        if (!ctx) {
            logger.warn(`[bridge] pending 中未找到 id=${reply.id}`);
            return;
        }
        clearTimeout(ctx.timer);
        ctx.timer = setTimeout(() => cleanPending(reply.id), REPLY_IDLE_TIMEOUT);
        const format = contentsToFormat(reply.contents);
        void ctx.message
            .send({ format })
            .then((res) => {
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
function cleanPending(id) {
    const ctx = pending.get(id);
    if (!ctx) {
        return;
    }
    clearTimeout(ctx.timer);
    clearTimeout(ctx.maxTimer);
    pending.delete(id);
}
function bindDoneListener() {
    if (doneListenerBound) {
        return;
    }
    doneListenerBound = true;
    manager.onDone((done) => {
        const ctx = pending.get(done.id);
        if (!ctx) {
            return;
        }
        if (!done.replied) {
            cleanPending(done.id);
        }
    });
}
function contentsToFormat(contents) {
    const format = Format.create();
    for (const c of contents) {
        switch (c.type) {
            case 'text':
                format.addText(c.data);
                break;
            case 'image':
                if (c.data.startsWith('http') || c.data.startsWith('/')) {
                    format.addImage(c.data);
                }
                else {
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
                if (c.data.startsWith('http') || c.data.startsWith('/')) {
                    format.addText(`[语音:${c.data}]`);
                }
                else {
                    format.addText('[语音]');
                }
                break;
            case 'video':
                if (c.data.startsWith('http') || c.data.startsWith('/')) {
                    format.addText(`[视频:${c.data}]`);
                }
                else {
                    format.addText('[视频]');
                }
                break;
            case 'forward':
                format.addText(c.data || '[转发消息]');
                break;
            default:
                format.addText(c.data);
        }
    }
    return format;
}
const latestEvents = new Map();
let apiListenerBound = false;
function bindApiRequestListener() {
    if (apiListenerBound) {
        return;
    }
    apiListenerBound = true;
    void loadOneBotClient();
    manager.onApiRequest((req) => {
        void handleApiRequest(req);
    });
}
async function handleApiRequest(req) {
    const { reqId, action, params } = req;
    try {
        const result = await dispatchApi(action, params);
        manager.sendToWorker({ type: 'api_response', reqId, ok: true, data: result });
    }
    catch (err) {
        manager.sendToWorker({ type: 'api_response', reqId, ok: false, error: err?.message ?? 'Unknown error' });
    }
}
async function dispatchApi(action, params) {
    switch (action) {
        case 'sendGroupMsg': {
            const format = contentsToFormat(params.contents ?? []);
            return await sendToChannel(String(params.group_id), format.value);
        }
        case 'sendPrivateMsg': {
            const format = contentsToFormat(params.contents ?? []);
            return await sendToUser(String(params.user_id), format.value);
        }
        case 'deleteMsg': {
            const event = getEventForApi(params.platform);
            if (!event) {
                throw new Error('无可用事件上下文');
            }
            const [message] = useMessage(event);
            return await message.delete({ messageId: String(params.message_id) });
        }
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
        case 'sendLike': {
            const event = getEventForApi(params.platform);
            if (!event) {
                throw new Error('无可用事件上下文');
            }
            const client = getOneBotClient(event);
            if (!client) {
                throw new Error('sendLike 仅 OneBot 平台可用');
            }
            return await client.sendLike({ user_id: Number(params.user_id), times: params.times ?? 10 });
        }
        case 'pokeMember': {
            const event = getEventForApi(params.platform);
            if (!event) {
                throw new Error('无可用事件上下文');
            }
            const client = getOneBotClient(event);
            if (!client) {
                throw new Error('pokeMember 仅 OneBot 平台可用');
            }
            return await client.send({
                action: 'group_poke',
                params: { group_id: Number(params.group_id), user_id: Number(params.user_id) }
            });
        }
        case 'pokeFriend': {
            const event = getEventForApi(params.platform);
            if (!event) {
                throw new Error('无可用事件上下文');
            }
            const client = getOneBotClient(event);
            if (!client) {
                throw new Error('pokeFriend 仅 OneBot 平台可用');
            }
            return await client.send({
                action: 'friend_poke',
                params: { user_id: Number(params.user_id) }
            });
        }
        case 'getCookies': {
            const event = getEventForApi(params.platform);
            if (!event) {
                throw new Error('无可用事件上下文');
            }
            const client = getOneBotClient(event);
            if (!client) {
                throw new Error('getCookies 仅 OneBot 平台可用');
            }
            return await client.getCookies();
        }
        case 'getCsrfToken': {
            const event = getEventForApi(params.platform);
            if (!event) {
                throw new Error('无可用事件上下文');
            }
            const client = getOneBotClient(event);
            if (!client) {
                throw new Error('getCsrfToken 仅 OneBot 平台可用');
            }
            return await client.getCsrfToken();
        }
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
                return { messages: [] };
            }
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
        case 'getGroupFileUrl':
        case 'getPrivateFileUrl': {
            const event = getEventForApi(params.platform);
            if (!event) {
                throw new Error('无可用事件上下文');
            }
            const client = getOneBotClient(event);
            if (!client) {
                return { url: '' };
            }
            return await client.send({
                action: 'get_group_file_url',
                params: { group_id: Number(params.group_id ?? 0), file_id: String(params.file_id) }
            });
        }
        default:
            throw new Error(`不支持的 API: ${action}`);
    }
}
function getEventForApi(platform) {
    if (platform && latestEvents.has(platform)) {
        return latestEvents.get(platform);
    }
    if (latestEvents.size > 0) {
        return latestEvents.values().next().value;
    }
    return undefined;
}
function extractMedia(event) {
    const items = [];
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
function extractRawEvent(event, rawE) {
    try {
        const v = event.value ?? rawE?.value;
        if (v && typeof v === 'object' && v.post_type) {
            return JSON.parse(JSON.stringify(v));
        }
    }
    catch {
    }
    return undefined;
}
var bridge = (e, next) => {
    e.IsMaster = e.IsMaster ?? isMaster(e?.UserId, e?.Platform);
    if (!manager.isReady) {
        next();
        return;
    }
    const eventName = e.name ?? '';
    if (!eventName) {
        next();
        return;
    }
    bindReplyListener();
    bindDoneListener();
    bindApiRequestListener();
    if (e.Platform) {
        latestEvents.set(e.Platform, e);
    }
    const id = `msg_${++idCounter}_${Date.now()}`;
    const [message] = useMessage(e);
    pending.set(id, {
        message,
        timer: setTimeout(() => cleanPending(id), REPLY_IDLE_TIMEOUT),
        maxTimer: setTimeout(() => cleanPending(id), REPLY_MAX_TIMEOUT)
    });
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

export { bridge as default };
