import { createEvent, useMessage, Format } from 'alemonjs';

var help = async (e, next) => {
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
    const fmt = Format.create();
    fmt.addText([
        'Yunzai 管理指令:',
        '#yz安装 [仓库地址(不指定则默认Miao-Yunzai)]  - 克隆并安装',
        '#yz安装依赖          - 重新安装依赖（含插件子包）',
        '#yz更新              - 拉取最新代码并重装依赖',
        '#yz启动              - 启动 Worker 子进程',
        '#yz停止              - 停止 Worker',
        '#yz重启              - 重启 Worker',
        '#yz状态              - 查看运行状态'
    ].join('\n'));
    message.send({ format: fmt });
};

export { help as default };
