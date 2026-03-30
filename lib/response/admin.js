import { createEvent, useMessage, Format } from 'alemonjs';
import { getDefaultRepo } from '../path.js';
import { manager } from '../yunzai/manager.js';

var admin = async (e, next) => {
    const event = createEvent({
        event: e,
        selects: ['message.create', 'private.message.create']
    });
    if (!event.selects) {
        next();
        return;
    }
    if (!event.IsMaster) {
        next();
        return;
    }
    const [message] = useMessage(event);
    const cmd = event.MessageText.replace(/^#(yz|云崽)\s*/, '').trim();
    const fmt = Format.create();
    try {
        if (cmd.startsWith('安装依赖')) {
            fmt.addText('正在安装 Yunzai 依赖（含插件子包）...');
            message.send({ format: fmt });
            await manager.installDeps();
            message.send({ format: Format.create().addText('依赖安装完成，建议 #yz重启') });
        }
        else if (cmd.startsWith('安装')) {
            const repo = cmd.replace('安装', '').trim() || getDefaultRepo();
            fmt.addText(`正在安装 Yunzai...\n仓库: ${repo}`);
            message.send({ format: fmt });
            await manager.install(repo);
            message.send({ format: Format.create().addText('Yunzai 安装完成，正在自动启动...') });
            await manager.start();
            message.send({ format: Format.create().addText('Yunzai  已启动') });
        }
        else if (cmd.startsWith('更新')) {
            const wasRunning = manager.isRunning;
            if (wasRunning) {
                await manager.stop();
            }
            fmt.addText('正在更新 Yunzai...');
            message.send({ format: fmt });
            const out = await manager.update();
            await manager.installDeps();
            const result = Format.create().addText(`更新完成\n${out.slice(0, 200)}`);
            message.send({ format: result });
            if (wasRunning) {
                await manager.start();
                message.send({ format: Format.create().addText('Yunzai  已自动重启') });
            }
        }
        else if (cmd.startsWith('启动')) {
            fmt.addText('正在启动 Yunzai ...');
            message.send({ format: fmt });
            await manager.start();
            message.send({ format: Format.create().addText('Yunzai  已启动') });
        }
        else if (cmd.startsWith('停止')) {
            await manager.stop();
            fmt.addText('Yunzai  已停止');
            message.send({ format: fmt });
        }
        else if (cmd.startsWith('重启')) {
            fmt.addText('正在重启 Yunzai ...');
            message.send({ format: fmt });
            await manager.restart();
            message.send({ format: Format.create().addText('Yunzai  已重启') });
        }
        else if (cmd.startsWith('状态')) {
            fmt.addText(`Yunzai 状态: ${manager.getStatus()}`);
            message.send({ format: fmt });
        }
        else {
            next();
            return;
        }
    }
    catch (err) {
        message.send({ format: Format.create().addText(`操作失败: ${err.message}`) });
    }
};

export { admin as default };
