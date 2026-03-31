import PluginHelp from '../img/views/PluginHelp.js';
import { getYunzaiDir, getAllPlugins } from '../path.js';
import { createEvent, useMessage, Format } from 'alemonjs';
import { renderComponentIsHtmlToBuffer } from 'jsxp';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

var pluginHelp = async (e) => {
    const event = createEvent({
        event: e,
        selects: ['message.create', 'private.message.create']
    });
    const [message] = useMessage(event);
    const yunzaiDir = getYunzaiDir();
    const yunzaiInstalled = existsSync(yunzaiDir);
    const plugins = getAllPlugins().map(p => ({
        ...p,
        installed: yunzaiInstalled && existsSync(join(yunzaiDir, 'plugins', p.dirName))
    }));
    const img = await renderComponentIsHtmlToBuffer(PluginHelp, {
        data: { plugins }
    });
    if (typeof img === 'boolean') {
        const format = Format.create();
        const md = Format.createMarkdown();
        md.addText('插件帮助图片加载失败，请稍后重试');
        format.addMarkdown(md);
        void message.send({ format });
        return;
    }
    const format = Format.create();
    format.addImage(img);
    void message.send({ format });
};

export { pluginHelp as default };
