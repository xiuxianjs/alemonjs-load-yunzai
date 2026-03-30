import { createEvent, useMessage, logger, Format } from 'alemonjs';
import { manager } from './manager.js';

const pending = new Map();
const REPLY_IDLE_TIMEOUT = 8_000;
const REPLY_MAX_TIMEOUT = 120_000;
let idCounter = 0;
let listenerBound = false;
let doneListenerBound = false;
function bindReplyListener() {
    if (listenerBound)
        return;
    listenerBound = true;
    manager.onReply((reply) => {
        logger.info(`[bridge] 收到 reply id=${reply.id} contents=${reply.contents.length}`);
        const ctx = pending.get(reply.id);
        if (!ctx) {
            logger.warn(`[bridge] pending 中未找到 id=${reply.id}`);
            return;
        }
        clearTimeout(ctx.timer);
        ctx.timer = setTimeout(() => cleanPending(reply.id), REPLY_IDLE_TIMEOUT);
        const format = Format.create();
        for (const c of reply.contents) {
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
                default:
                    format.addText(c.data);
            }
        }
        ctx.message.send({ format });
    });
}
function cleanPending(id) {
    const ctx = pending.get(id);
    if (!ctx)
        return;
    clearTimeout(ctx.timer);
    clearTimeout(ctx.maxTimer);
    pending.delete(id);
}
function bindDoneListener() {
    if (doneListenerBound)
        return;
    doneListenerBound = true;
    manager.onDone((done) => {
        const ctx = pending.get(done.id);
        if (!ctx)
            return;
        if (!done.replied) {
            cleanPending(done.id);
        }
    });
}
function extractMedia(event) {
    const items = [];
    if (!Array.isArray(event.MessageMedia))
        return items;
    for (const m of event.MessageMedia) {
        items.push({
            type: m.Type === 'sticker' || m.Type === 'animation' ? 'sticker' : m.Type || 'file',
            url: m.Url || undefined,
            fileId: m.FileId || undefined,
            fileName: m.FileName || undefined
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
async function yunzaiBridge(e, next) {
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
    bindDoneListener();
    const [message] = useMessage(event);
    const id = `msg_${++idCounter}_${Date.now()}`;
    const entry = {
        message,
        timer: setTimeout(() => cleanPending(id), REPLY_IDLE_TIMEOUT),
        maxTimer: setTimeout(() => cleanPending(id), REPLY_MAX_TIMEOUT)
    };
    pending.set(id, entry);
    manager.send({
        type: 'event',
        id,
        data: {
            platform: event.Platform || '',
            botId: event.BotId || '',
            messageText: event.MessageText || '',
            messageId: event.MessageId || '',
            media: extractMedia(event),
            userId: event.UserId || '',
            userName: event.UserName || '',
            userAvatar: event.UserAvatar || '',
            spaceId: event.GuildId || event.ChannelId || '',
            isPrivate: !event.GuildId,
            isMaster: event.IsMaster || false,
            rawEvent: extractRawEvent(event, e)
        }
    });
}

export { yunzaiBridge as default };
