import { getConfig, getConfigValue } from 'alemonjs';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { getAllPlugins, getPluginInfo, getYunzaiDir } from './path';
import { manager } from './yunzai/manager';
// 当前目录
const __dirname = dirname(fileURLToPath(import.meta.url));

/** 获取已安装的插件目录列表（带安装状态） */
function getInstalledPlugins(): { name: string; installed: boolean }[] {
  const pluginsDir = join(getYunzaiDir(), 'plugins');

  if (!existsSync(pluginsDir)) {
    return [];
  }

  return readdirSync(pluginsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => ({ name: d.name, installed: true }));
}

/** 获取日志文件数量 */
function getLogCount(): number {
  const logsDir = join(getYunzaiDir(), 'logs');

  if (!existsSync(logsDir)) {
    return 0;
  }

  return readdirSync(logsDir).filter(f => f.endsWith('.log')).length;
}

// ─── YAML 配置读写 ───

/** 获取 Yunzai config/config 目录 */
function getConfigDir(): string {
  return join(getYunzaiDir(), 'config', 'config');
}

/** 读取单个 YAML 配置，不存在则返回空对象 */
function readYaml(name: string): Record<string, unknown> {
  const file = join(getConfigDir(), `${name}.yaml`);

  if (!existsSync(file)) {
    return {};
  }

  try {
    return (YAML.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

/** 写入单个 YAML 配置 */
function writeYaml(name: string, data: Record<string, unknown>): void {
  const dir = getConfigDir();

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(join(dir, `${name}.yaml`), YAML.stringify(data), 'utf-8');
}

/** 逗号分隔字符串 → 非空数组或 null */
function csv2arr(v: unknown): string[] | null {
  if (!v) {
    return null;
  }
  const arr = String(v)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  return arr.length > 0 ? arr : null;
}

/** 逗号分隔字符串 → 数字数组（用于 QQ 号、群号） */
function csv2numArr(v: unknown): number[] | null {
  const arr = csv2arr(v);

  if (!arr) {
    return null;
  }
  const nums = arr.map(Number).filter(n => !isNaN(n));

  return nums.length > 0 ? nums : null;
}

// 被激活的时候。
export const activate = context => {
  // 创建一个 webview。
  const webView = context.createSidebarWebView(context);

  // 当命令被触发的时候。
  context.onCommand('open.yunzai', () => {
    const dir = join(__dirname, '../', 'dist', 'index.html');
    const scriptReg = /<script.*?src="(.+?)".*?>/;
    const styleReg = /<link.*?rel="stylesheet".*?href="(.+?)".*?>/;
    const iconReg = /<link.*?rel="icon".*?href="(.+?)".*?>/g;
    // 创建 webview 路径
    const styleUri = context.createExtensionDir(join(__dirname, '../', 'dist', 'assets', 'index.css'));
    const scriptUri = context.createExtensionDir(join(__dirname, '../', 'dist', 'assets', 'index.js'));
    // 确保路径存在
    const html = readFileSync(dir, 'utf-8')
      .replace(iconReg, '')
      .replace(scriptReg, `<script type="module" crossorigin src="${scriptUri}"></script>`)
      .replace(styleReg, `<link rel="stylesheet" crossorigin href="${styleUri}">`);

    // 立即渲染 webview
    webView.loadWebView(html);
  });

  // 监听 webview 的消息。
  webView.onMessage(async data => {
    try {
      if (data.type === 'yunzai.form.save') {
        const db = data.data;

        // ── 写入 Yunzai YAML 配置文件 ──

        // bot.yaml
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

        // other.yaml
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

        // qq.yaml
        const qq: Record<string, unknown> = readYaml('qq');

        qq.qq = db.qq ? Number(db.qq) || db.qq : '';
        qq.pwd = db.pwd ?? '';
        qq.platform = Number(db.platform) || 6;
        writeYaml('qq', qq);

        // redis.yaml
        writeYaml('redis', {
          host: db.redis_host ?? '127.0.0.1',
          port: Number(db.redis_port) || 6379,
          username: db.redis_username ?? '',
          password: db.redis_password ?? '',
          db: Number(db.redis_db) || 0
        });

        // group.yaml — 只更新 default 部分，保留其他群配置
        const group = readYaml('group');
        const groupDefault = (group.default as Record<string, unknown>) ?? {};

        groupDefault.groupGlobalCD = Number(db.groupGlobalCD) || 0;
        groupDefault.singleCD = Number(db.singleCD) || 0;
        groupDefault.onlyReplyAt = Number(db.onlyReplyAt) || 0;
        groupDefault.botAlias = csv2arr(db.botAlias);
        groupDefault.imgAddLimit = Number(db.imgAddLimit) || 0;
        groupDefault.imgMaxSize = Number(db.imgMaxSize) || 2;
        groupDefault.addPrivate = Number(db.addPrivate);
        group.default = groupDefault;
        writeYaml('group', group);

        // notice.yaml
        writeYaml('notice', {
          iyuu: db.iyuu ?? '',
          sct: db.sct ?? '',
          feishu_webhook: db.feishu_webhook ?? ''
        });

        context.notification('Yunzai 配置保存成功～');
      } else if (data.type === 'yunzai.init') {
        // 读取 Yunzai YAML 配置
        const bot = readYaml('bot');
        const other = readYaml('other');
        const qq = readYaml('qq');
        const redis = readYaml('redis');
        const group = readYaml('group');
        const groupDef = (group.default as Record<string, unknown>) ?? {};
        const notice = readYaml('notice');

        webView.postMessage({
          type: 'yunzai.init',
          data: {
            // bot.yaml
            log_level: bot.log_level ?? 'info',
            resend: bot.resend ?? false,
            online_msg: bot.online_msg ?? true,
            online_msg_exp: bot.online_msg_exp ?? 86400,
            chromium_path: bot.chromium_path ?? '',
            puppeteer_ws: bot.puppeteer_ws ?? '',
            puppeteer_timeout: bot.puppeteer_timeout ?? '',
            proxyAddress: bot.proxyAddress ?? '',
            sign_api_addr: bot.sign_api_addr ?? '',
            // other.yaml
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
            // qq.yaml
            qq: qq.qq ?? '',
            pwd: qq.pwd ?? '',
            platform: qq.platform ?? 6,
            // redis.yaml
            redis_host: redis.host ?? '127.0.0.1',
            redis_port: redis.port ?? 6379,
            redis_username: redis.username ?? '',
            redis_password: redis.password ?? '',
            redis_db: redis.db ?? 0,
            // group.yaml (default)
            groupGlobalCD: groupDef.groupGlobalCD ?? 0,
            singleCD: groupDef.singleCD ?? 1000,
            onlyReplyAt: groupDef.onlyReplyAt ?? 0,
            botAlias: groupDef.botAlias,
            imgAddLimit: groupDef.imgAddLimit ?? 0,
            imgMaxSize: groupDef.imgMaxSize ?? 2,
            addPrivate: groupDef.addPrivate ?? 1,
            // notice.yaml
            iyuu: notice.iyuu ?? '',
            sct: notice.sct ?? '',
            feishu_webhook: notice.feishu_webhook ?? ''
          }
        });
      } else if (data.type === 'repo.init') {
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
            gh_proxy: pkgCfg.gh_proxy ? String(pkgCfg.gh_proxy) : 'https://ghfast.top/',
            bot_name: pkgCfg.bot_name ? String(pkgCfg.bot_name) : 'Miao-Yunzai',
            yunzai_repo: pkgCfg.yunzai_repo ? String(pkgCfg.yunzai_repo) : 'https://github.com/yoimiya-kokomi/Miao-Yunzai.git',
            miao_plugin_repo: pkgCfg.miao_plugin_repo ? String(pkgCfg.miao_plugin_repo) : 'https://github.com/yoimiya-kokomi/miao-plugin.git',
            plugins: pkgCfg.plugins ?? {}
          }
        });
      } else if (data.type === 'repo.save') {
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
        if (db.plugins && typeof db.plugins === 'object') {
          pkg.plugins = db.plugins;
        }
        value['alemonjs-load-yunzai'] = pkg;
        config.saveValue(value);
        context.notification('仓库配置保存成功～');
      } else if (data.type === 'yunzai.status') {
        const installedPlugins = manager.isInstalled ? getInstalledPlugins() : [];
        const installedSet = new Set(installedPlugins.map(p => p.name));
        const catalog = getAllPlugins().map(p => ({
          dirName: p.dirName,
          label: p.label,
          aliases: p.aliases,
          repoUrl: p.repoUrl,
          installed: installedSet.has(p.dirName)
        }));

        webView.postMessage({
          type: 'yunzai.status',
          data: {
            status: manager.getStatus(),
            installed: manager.isInstalled,
            running: manager.isRunning,
            busy: manager.isBusy,
            busyTask: manager.busyTaskName,
            plugins: installedPlugins,
            catalog,
            logCount: manager.isInstalled ? getLogCount() : 0,
            help: {
              installFlow: [
                { step: '①', label: '安装框架', cmd: '#yz安装', desc: '克隆 Yunzai 仓库' },
                { step: '②', label: '安装插件', cmd: '#yz安装插件miao', desc: '按需安装游戏插件' },
                { step: '③', label: '安装依赖', cmd: '#yz安装依赖', desc: '统一安装所有依赖' },
                { step: '④', label: '启动', cmd: '#yz启动', desc: '启动 Worker 进程' }
              ],
              controls: [
                { cmd: '#yz安装', desc: '安装 Yunzai 框架', color: 'green' },
                { cmd: '#yz安装插件', desc: '安装指定插件', color: 'green' },
                { cmd: '#yz安装依赖', desc: '重新安装所有依赖', color: 'blue' },
                { cmd: '#yz启动', desc: '启动 Worker', color: 'green' },
                { cmd: '#yz停止', desc: '停止 Worker', color: 'orange' },
                { cmd: '#yz重启', desc: '停止后重新启动', color: 'blue' },
                { cmd: '#yz更新', desc: '拉取代码+装依赖+重启', color: 'blue' },
                { cmd: '#yz强制更新', desc: '重置本地+更新+装依赖', color: 'red' },
                { cmd: '#yz更新插件', desc: '更新指定插件', color: 'blue' },
                { cmd: '#yz强制更新插件', desc: '重置+更新指定插件', color: 'red' }
              ],
              tools: [
                { cmd: '#yz状态', desc: '查看当前运行状态', color: 'orange' },
                { cmd: '#yz取消', desc: '取消正在执行的任务', color: 'orange' },
                { cmd: '#yz插件帮助', desc: '查看插件列表', color: 'green' },
                { cmd: '#yz插件说明', desc: '查看插件 README', color: 'green' },
                { cmd: '#yz日志清理', desc: '清理所有日志文件', color: 'orange' },
                { cmd: '#yz卸载插件', desc: '卸载指定插件', color: 'red' },
                { cmd: '#yz卸载', desc: '停止并删除 Yunzai', color: 'red' },
                { cmd: '#yz帮助', desc: '查看本帮助图', color: 'orange' }
              ]
            }
          }
        });
      } else if (data.type === 'yunzai.action') {
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
              } else {
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
              } else if (/^(https?:\/\/|git@)/.test(plugin)) {
                const dirName =
                  plugin
                    .replace(/\.git$/, '')
                    .split('/')
                    .pop() ?? 'unknown-plugin';

                await manager.installPlugin({ dirName, repoUrl: plugin, label: dirName });
                webView.postMessage({ type: 'yunzai.result', data: { message: `${dirName} 安装完成` } });
              } else {
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
        } catch (err: any) {
          webView.postMessage({ type: 'yunzai.result', data: { message: `操作失败: ${err?.message ?? '未知错误'}` } });
        }
      }
    } catch (e) {
      console.error(e);
    }
  });
};
