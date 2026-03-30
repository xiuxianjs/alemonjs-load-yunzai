import { defineChildren, defineRouter, lazy, logger } from 'alemonjs';
import { manager } from './yunzai';

const responseRouter = defineRouter([
  // 帮助指令优先（更具体的正则先匹配）
  {
    regular: /^(!|！|\/|#|＃)(yz|云崽)(help|帮助)$/,
    selects: ['message.create', 'private.message.create'],
    handler: lazy(() => import('./response/help'))
  },
  // 管理指令
  {
    regular: /^(!|！|\/|#|＃)(yz|云崽)/,
    selects: ['message.create', 'private.message.create'],
    handler: lazy(() => import('./response/admin'))
  },
  // 其余全部转发给 Yunzai Worker
  {
    regular: /.*/,
    handler: lazy(() => import('./yunzai/bridge'))
  }
]);

export default defineChildren({
  register() {
    return { responseRouter };
  },
  async onCreated() {
    logger.info('[alemonjs-load-yunzai] 启动');
    if (manager.isInstalled) {
      try {
        await manager.start();
      } catch (err: any) {
        logger.error(`[Yunzai] Worker 启动失败: ${err?.message}`);
      }
    } else {
      logger.info('[Yunzai] 未安装。发送 #yz安装 进行安装');
    }
  }
});
