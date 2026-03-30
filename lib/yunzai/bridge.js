import { createEvent, useMessage, logger, Format } from 'alemonjs';
import { manager } from './manager.js';

const pending = new Map();
let idCounter = 0;
let listenerBound = false;
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
                    format.addText(`@${c.data} `);
                    break;
                default:
                    format.addText(c.data);
            }
        }
        ctx.message.send({ format });
    });
}
async function yunzaiBridge(e, next) {
    if (!manager.isReady) {
        next();
        return;
    }
    const event = createEvent({
        event: e,
        selects: ['message.create', 'private.message.create'],
    });
    if (!event.selects) {
        next();
        return;
    }
    bindReplyListener();
    const [message] = useMessage(event);
    const id = `msg_${++idCounter}_${Date.now()}`;
    pending.set(id, {
        message,
        timer: setTimeout(() => pending.delete(id), 60_000),
    });
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
        },
    });
}

export { yunzaiBridge as default };
