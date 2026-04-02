import { getConfigValue, getConfig } from 'alemonjs';
import { readFileSync, existsSync, readdirSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { getPluginInfo, getYunzaiDir } from './path.js';
import { manager } from './yunzai/manager.js';

const __dirname$1 = dirname(fileURLToPath(import.meta.url));
function getInstalledPlugins() {
    const pluginsDir = join(getYunzaiDir(), 'plugins');
    if (!existsSync(pluginsDir)) {
        return [];
    }
    return readdirSync(pluginsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => ({ name: d.name, installed: true }));
}
function getLogCount() {
    const logsDir = join(getYunzaiDir(), 'logs');
    if (!existsSync(logsDir)) {
        return 0;
    }
    return readdirSync(logsDir).filter(f => f.endsWith('.log')).length;
}
function getConfigDir() {
    return join(getYunzaiDir(), 'config', 'config');
}
function readYaml(name) {
    const file = join(getConfigDir(), `${name}.yaml`);
    if (!existsSync(file)) {
        return {};
    }
    try {
        return YAML.parse(readFileSync(file, 'utf-8')) ?? {};
    }
    catch {
        return {};
    }
}
function writeYaml(name, data) {
    const dir = getConfigDir();
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(join(dir, `${name}.yaml`), YAML.stringify(data), 'utf-8');
}
function csv2arr(v) {
    if (!v) {
        return null;
    }
    const arr = String(v)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    return arr.length > 0 ? arr : null;
}
function csv2numArr(v) {
    const arr = csv2arr(v);
    if (!arr) {
        return null;
    }
    const nums = arr.map(Number).filter(n => !isNaN(n));
    return nums.length > 0 ? nums : null;
}
const activate = context => {
    const webView = context.createSidebarWebView(context);
    context.onCommand('open.yunzai', () => {
        const dir = join(__dirname$1, '../', 'dist', 'index.html');
        const scriptReg = /<script.*?src="(.+?)".*?>/;
        const styleReg = /<link.*?rel="stylesheet".*?href="(.+?)".*?>/;
        const iconReg = /<link.*?rel="icon".*?href="(.+?)".*?>/g;
        const styleUri = context.createExtensionDir(join(__dirname$1, '../', 'dist', 'assets', 'index.css'));
        const scriptUri = context.createExtensionDir(join(__dirname$1, '../', 'dist', 'assets', 'index.js'));
        const html = readFileSync(dir, 'utf-8')
            .replace(iconReg, '')
            .replace(scriptReg, `<script type="module" crossorigin src="${scriptUri}"></script>`)
            .replace(styleReg, `<link rel="stylesheet" crossorigin href="${styleUri}">`);
        webView.loadWebView(html);
    });
    webView.onMessage(async (data) => {
        try {
            if (data.type === 'yunzai.form.save') {
                const db = data.data;
                const bot = readYaml('bot');
                bot.log_level = db.log_level ?? 'info';
                bot.resend = db.resend === true || db.resend === 'true';
                bot.online_msg = db.online_msg !== false && db.online_msg !== 'false';
                bot.online_msg_exp = Number(db.online_msg_exp) || 86400;
                bot.chromium_path = db.chromium_path ?? '';
                bot.puppeteer_ws = db.puppeteer_ws ?? '';
                bot.puppeteer_timeout = db.puppeteer_timeout ? Number(db.puppeteer_timeout) : '';
                bot.proxyAddress = db.proxyAddress ?? '';
                bot.sign_api_addr = db.sign_api_addr ?? '';
                writeYaml('bot', bot);
                const other = readYaml('other');
                other.autoFriend = Number(db.autoFriend) || 0;
                other.autoQuit = Number(db.autoQuit) || 0;
                other.masterQQ = csv2numArr(db.masterQQ);
                other.disablePrivate = db.disablePrivate === true || db.disablePrivate === 'true';
                other.disableGuildMsg = db.disableGuildMsg !== false && db.disableGuildMsg !== 'false';
                other.disableMsg = db.disableMsg ?? '';
                other.whiteGroup = csv2numArr(db.whiteGroup);
                other.whiteQQ = csv2numArr(db.whiteQQ);
                other.blackGroup = csv2numArr(db.blackGroup);
                other.blackQQ = csv2numArr(db.blackQQ);
                writeYaml('other', other);
                const qq = readYaml('qq');
                qq.qq = db.qq ? Number(db.qq) || db.qq : '';
                qq.pwd = db.pwd ?? '';
                qq.platform = Number(db.platform) || 6;
                writeYaml('qq', qq);
                writeYaml('redis', {
                    host: db.redis_host ?? '127.0.0.1',
                    port: Number(db.redis_port) || 6379,
                    username: db.redis_username ?? '',
                    password: db.redis_password ?? '',
                    db: Number(db.redis_db) || 0
                });
                const group = readYaml('group');
                const groupDefault = group.default ?? {};
                groupDefault.groupGlobalCD = Number(db.groupGlobalCD) || 0;
                groupDefault.singleCD = Number(db.singleCD) || 0;
                groupDefault.onlyReplyAt = Number(db.onlyReplyAt) || 0;
                groupDefault.botAlias = csv2arr(db.botAlias);
                groupDefault.imgAddLimit = Number(db.imgAddLimit) || 0;
                groupDefault.imgMaxSize = Number(db.imgMaxSize) || 2;
                groupDefault.addPrivate = Number(db.addPrivate);
                group.default = groupDefault;
                writeYaml('group', group);
                writeYaml('notice', {
                    iyuu: db.iyuu ?? '',
                    sct: db.sct ?? '',
                    feishu_webhook: db.feishu_webhook ?? ''
                });
                context.notification('Yunzai 配置保存成功～');
            }
            else if (data.type === 'yunzai.init') {
                const bot = readYaml('bot');
                const other = readYaml('other');
                const qq = readYaml('qq');
                const redis = readYaml('redis');
                const group = readYaml('group');
                const groupDef = group.default ?? {};
                const notice = readYaml('notice');
                webView.postMessage({
                    type: 'yunzai.init',
                    data: {
                        log_level: bot.log_level ?? 'info',
                        resend: bot.resend ?? false,
                        online_msg: bot.online_msg ?? true,
                        online_msg_exp: bot.online_msg_exp ?? 86400,
                        chromium_path: bot.chromium_path ?? '',
                        puppeteer_ws: bot.puppeteer_ws ?? '',
                        puppeteer_timeout: bot.puppeteer_timeout ?? '',
                        proxyAddress: bot.proxyAddress ?? '',
                        sign_api_addr: bot.sign_api_addr ?? '',
                        autoFriend: other.autoFriend ?? 1,
                        autoQuit: other.autoQuit ?? 50,
                        masterQQ: other.masterQQ,
                        disablePrivate: other.disablePrivate ?? false,
                        disableGuildMsg: other.disableGuildMsg ?? true,
                        disableMsg: other.disableMsg ?? '',
                        whiteGroup: other.whiteGroup,
                        whiteQQ: other.whiteQQ,
                        blackGroup: other.blackGroup,
                        blackQQ: other.blackQQ,
                        qq: qq.qq ?? '',
                        pwd: qq.pwd ?? '',
                        platform: qq.platform ?? 6,
                        redis_host: redis.host ?? '127.0.0.1',
                        redis_port: redis.port ?? 6379,
                        redis_username: redis.username ?? '',
                        redis_password: redis.password ?? '',
                        redis_db: redis.db ?? 0,
                        groupGlobalCD: groupDef.groupGlobalCD ?? 0,
                        singleCD: groupDef.singleCD ?? 1000,
                        onlyReplyAt: groupDef.onlyReplyAt ?? 0,
                        botAlias: groupDef.botAlias,
                        imgAddLimit: groupDef.imgAddLimit ?? 0,
                        imgMaxSize: groupDef.imgMaxSize ?? 2,
                        addPrivate: groupDef.addPrivate ?? 1,
                        iyuu: notice.iyuu ?? '',
                        sct: notice.sct ?? '',
                        feishu_webhook: notice.feishu_webhook ?? ''
                    }
                });
            }
            else if (data.type === 'repo.init') {
                let config = getConfigValue();
                if (!config) {
                    config = {};
                }
                const yunzaiCfg = config['yunzai'] ?? {};
                const pkgCfg = config['alemonjs-load-yunzai'] ?? {};
                webView.postMessage({
                    type: 'repo.init',
                    data: {
                        master_key: yunzaiCfg.master_key,
                        master_id: yunzaiCfg.master_id,
                        gh_proxy: pkgCfg.gh_proxy ?? '',
                        bot_name: pkgCfg.bot_name ?? '',
                        yunzai_repo: pkgCfg.yunzai_repo ?? '',
                        miao_plugin_repo: pkgCfg.miao_plugin_repo ?? ''
                    }
                });
            }
            else if (data.type === 'repo.save') {
                const db = data.data;
                const config = getConfig();
                const value = config.value ?? {};
                value['yunzai'] = {
                    ...value['yunzai'],
                    master_key: csv2arr(db.master_key),
                    master_id: csv2arr(db.master_id)
                };
                const pkg = value['alemonjs-load-yunzai'] ?? {};
                pkg.gh_proxy = db.gh_proxy ?? '';
                pkg.bot_name = db.bot_name ?? '';
                pkg.yunzai_repo = db.yunzai_repo ?? '';
                pkg.miao_plugin_repo = db.miao_plugin_repo ?? '';
                value['alemonjs-load-yunzai'] = pkg;
                config.saveValue(value);
                context.notification('仓库配置保存成功～');
            }
            else if (data.type === 'yunzai.status') {
                webView.postMessage({
                    type: 'yunzai.status',
                    data: {
                        status: manager.getStatus(),
                        installed: manager.isInstalled,
                        running: manager.isRunning,
                        busy: manager.isBusy,
                        busyTask: manager.busyTaskName,
                        plugins: manager.isInstalled ? getInstalledPlugins() : [],
                        logCount: manager.isInstalled ? getLogCount() : 0
                    }
                });
            }
            else if (data.type === 'yunzai.action') {
                const { action, plugin } = data.data ?? {};
                try {
                    switch (action) {
                        case 'install':
                            await manager.install();
                            webView.postMessage({ type: 'yunzai.result', data: { message: 'Yunzai 安装完成' } });
                            break;
                        case 'uninstall':
                            await manager.uninstall();
                            webView.postMessage({ type: 'yunzai.result', data: { message: 'Yunzai 已卸载' } });
                            break;
                        case 'start':
                            await manager.start();
                            webView.postMessage({ type: 'yunzai.result', data: { message: 'Yunzai 已启动' } });
                            break;
                        case 'stop':
                            await manager.stop();
                            webView.postMessage({ type: 'yunzai.result', data: { message: 'Yunzai 已停止' } });
                            break;
                        case 'restart':
                            await manager.restart();
                            webView.postMessage({ type: 'yunzai.result', data: { message: 'Yunzai 已重启' } });
                            break;
                        case 'update':
                            await manager.updateAll();
                            webView.postMessage({ type: 'yunzai.result', data: { message: 'Yunzai 更新完成' } });
                            break;
                        case 'force_update':
                            await manager.updateAll(true);
                            webView.postMessage({ type: 'yunzai.result', data: { message: 'Yunzai 强制更新完成' } });
                            break;
                        case 'install_deps':
                            await manager.installDeps();
                            webView.postMessage({ type: 'yunzai.result', data: { message: '依赖安装完成' } });
                            break;
                        case 'cancel':
                            if (manager.isBusy) {
                                const taskName = manager.busyTaskName;
                                manager.cancelTask();
                                webView.postMessage({ type: 'yunzai.result', data: { message: `已取消: ${taskName}` } });
                            }
                            else {
                                webView.postMessage({ type: 'yunzai.result', data: { message: '当前没有正在执行的任务' } });
                            }
                            break;
                        case 'clean_logs': {
                            const logsDir = join(getYunzaiDir(), 'logs');
                            if (!existsSync(logsDir)) {
                                webView.postMessage({ type: 'yunzai.result', data: { message: '日志目录不存在' } });
                                break;
                            }
                            const files = readdirSync(logsDir).filter(f => f.endsWith('.log'));
                            for (const f of files) {
                                rmSync(join(logsDir, f), { force: true });
                            }
                            webView.postMessage({ type: 'yunzai.result', data: { message: `已清理 ${files.length} 个日志文件` } });
                            break;
                        }
                        case 'install_plugin': {
                            if (!plugin) {
                                webView.postMessage({ type: 'yunzai.result', data: { message: '请输入插件别名或仓库地址' } });
                                break;
                            }
                            const info = getPluginInfo(plugin);
                            if (info) {
                                await manager.installPlugin(info);
                                webView.postMessage({ type: 'yunzai.result', data: { message: `${info.label} 安装完成` } });
                            }
                            else if (/^(https?:\/\/|git@)/.test(plugin)) {
                                const dirName = plugin
                                    .replace(/\.git$/, '')
                                    .split('/')
                                    .pop() ?? 'unknown-plugin';
                                await manager.installPlugin({ dirName, repoUrl: plugin, label: dirName });
                                webView.postMessage({ type: 'yunzai.result', data: { message: `${dirName} 安装完成` } });
                            }
                            else {
                                webView.postMessage({ type: 'yunzai.result', data: { message: `未知插件「${plugin}」，请使用别名或完整仓库地址` } });
                            }
                            break;
                        }
                        case 'update_plugin': {
                            if (!plugin) {
                                break;
                            }
                            const info = getPluginInfo(plugin) ?? { dirName: plugin, repoUrl: '', label: plugin };
                            await manager.updatePlugin(info);
                            webView.postMessage({ type: 'yunzai.result', data: { message: `${info.label} 更新完成` } });
                            break;
                        }
                        case 'force_update_plugin': {
                            if (!plugin) {
                                break;
                            }
                            const info = getPluginInfo(plugin) ?? { dirName: plugin, repoUrl: '', label: plugin };
                            await manager.updatePlugin(info, true);
                            webView.postMessage({ type: 'yunzai.result', data: { message: `${info.label} 强制更新完成` } });
                            break;
                        }
                        case 'uninstall_plugin': {
                            if (!plugin) {
                                break;
                            }
                            const info = getPluginInfo(plugin) ?? { dirName: plugin, repoUrl: '', label: plugin };
                            manager.uninstallPlugin(info);
                            webView.postMessage({ type: 'yunzai.result', data: { message: `${info.label} 已卸载` } });
                            break;
                        }
                        default:
                            webView.postMessage({ type: 'yunzai.result', data: { message: `未知操作: ${action}` } });
                    }
                }
                catch (err) {
                    webView.postMessage({ type: 'yunzai.result', data: { message: `操作失败: ${err?.message ?? '未知错误'}` } });
                }
            }
        }
        catch (e) {
            console.error(e);
        }
    });
};

export { activate };
