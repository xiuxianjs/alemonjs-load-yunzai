import { defineRouter, lazy, defineChildren, logger } from 'alemonjs';
import { manager } from './yunzai/manager.js';

const responseRouter = defineRouter([
    {
        regular: /^(!|！|\/|#|＃)(yz|云崽)(help|帮助)$/,
        selects: ['message.create', 'private.message.create'],
        handler: lazy(() => import('./response/help.js'))
    },
    {
        regular: /^(!|！|\/|#|＃)(yz|云崽)/,
        selects: ['message.create', 'private.message.create'],
        handler: lazy(() => import('./response/admin.js'))
    },
    {
        regular: /.*/,
        handler: lazy(() => import('./yunzai/bridge.js'))
    }
]);
var index = defineChildren({
    register() {
        return { responseRouter };
    },
    async onCreated() {
        logger.info('[alemonjs-load-yunzai] 启动');
        if (manager.isInstalled) {
            try {
                await manager.start();
            }
            catch (err) {
                logger.error(`[Yunzai] Worker 启动失败: ${err?.message}`);
            }
        }
        else {
            logger.info('[Yunzai] 未安装。发送 #yz安装 进行安装');
        }
    }
});

export { index as default };
