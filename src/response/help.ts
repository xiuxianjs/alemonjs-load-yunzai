import { createEvent, Format, useMessage } from 'alemonjs';

export default async (e: any, next: () => void) => {
    const event = createEvent({
        event: e,
        selects: ['message.create', 'private.message.create'],
    });
    if (!event.selects) {
        next();
        return;
    }
    const [message] = useMessage(event);
    const fmt = Format.create();
    fmt.addText([
        'Yunzai 管理指令:',
        '#yz安装 [仓库地址]  - 克隆并安装 Yunzai',
        '#yz安装依赖          - 重新安装依赖（含插件子包）',
        '#yz更新              - 拉取最新代码并重装依赖',
        '#yz启动              - 启动 Worker 子进程',
        '#yz停止              - 停止 Worker',
        '#yz重启              - 重启 Worker',
        '#yz状态              - 查看运行状态',
    ].join('\n'));
    message.send({ format: fmt });
};