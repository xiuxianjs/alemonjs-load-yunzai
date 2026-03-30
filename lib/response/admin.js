import { createEvent, useMessage, Format } from 'alemonjs';
import { getPluginInfo, getDefaultRepo } from '../path.js';
import { manager } from '../yunzai/manager.js';

function stripUrls(text) {
    return text
        .replace(/https?:\/\/\S+/g, '')
        .replace(/\n{2,}/g, '\n')
        .trim();
}
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
    const cmd = event.MessageText.replace(/^(!|！|\/|#|＃)(yz|云崽)\s*/, '').trim();
    const isQQBot = e.Platform === 'qq-bot';
    const reply = (text) => {
        void message.send({ format: Format.create().addText(isQQBot ? stripUrls(text) : text) });
    };
    try {
        if (cmd.startsWith('取消')) {
            if (!manager.isBusy) {
                reply('当前没有正在执行的任务');
                return;
            }
            const taskName = manager.busyTaskName;
            manager.cancelTask();
            reply(`已取消: ${taskName}`);
            return;
        }
        if (manager.isBusy) {
            reply(`正在${manager.busyTaskName}，请等待完成或发送 #yz取消`);
            return;
        }
        if (cmd.startsWith('安装依赖')) {
            reply('正在安装 Yunzai 依赖（含插件子包）...');
            await manager.installDeps();
            reply('依赖安装完成，建议 #yz重启');
        }
        else if (cmd.startsWith('安装')) {
            const arg = cmd.replace('安装', '').trim();
            const plugin = arg ? getPluginInfo(arg) : undefined;
            if (plugin) {
                reply(`正在安装插件 ${plugin.label}...`);
                await manager.installPlugin(plugin);
                reply(`${plugin.label} 安装完成，建议 #yz重启`);
            }
            else {
                const repo = arg || getDefaultRepo();
                reply(isQQBot ? '正在安装 Yunzai...' : `正在安装 Yunzai...\n仓库: ${repo}`);
                await manager.installAndStart(repo);
                reply('Yunzai 安装完成并已启动');
            }
        }
        else if (cmd.startsWith('更新')) {
            reply('正在更新 Yunzai...');
            const out = await manager.updateAll();
            reply(`更新完成\n${out.slice(0, 200)}`);
        }
        else if (cmd.startsWith('启动')) {
            reply('正在启动 Yunzai...');
            await manager.start();
            reply('Yunzai 已启动');
        }
        else if (cmd.startsWith('停止')) {
            await manager.stop();
            reply('Yunzai 已停止');
        }
        else if (cmd.startsWith('重启')) {
            reply('正在重启 Yunzai...');
            await manager.restart();
            reply('Yunzai 已重启');
        }
        else if (cmd.startsWith('状态')) {
            reply(`Yunzai 状态: ${manager.getStatus()}`);
        }
        else if (cmd.startsWith('卸载')) {
            reply('正在卸载 Yunzai...');
            await manager.uninstall();
            reply('Yunzai 已卸载');
        }
        else {
            next();
        }
    }
    catch (err) {
        const msg = err.message ?? '未知错误';
        if (msg === '操作已取消') {
            reply('操作已取消');
        }
        else {
            reply(`操作失败: ${msg}`);
        }
    }
};

export { admin as default };
