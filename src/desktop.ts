import { getConfig, getConfigValue } from 'alemonjs';
import { existsSync, readdirSync, readFileSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getPluginInfo, getYunzaiDir } from './path';
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
        const config = getConfig();
        const value = config.value ?? {};

        // yunzai 命名空间：主人配置 + 运行配置
        value['yunzai'] = {
          ...value['yunzai'],
          master_key: db.master_key?.split(',').filter(Boolean) ?? null,
          master_id: db.master_id?.split(',').filter(Boolean) ?? null,
          log_level: db.log_level,
          autoFriend: db.autoFriend,
          autoQuit: Number(db.autoQuit) || 0,
          disablePrivate: db.disablePrivate,
          disableGuildMsg: db.disableGuildMsg
        };

        // alemonjs-load-yunzai 命名空间：仓库 + 代理配置
        const pkg = value['alemonjs-load-yunzai'] ?? {};

        if (db.gh_proxy) {
          pkg.gh_proxy = db.gh_proxy;
        }
        if (db.bot_name) {
          pkg.bot_name = db.bot_name;
        }
        if (db.yunzai_repo) {
          pkg.yunzai_repo = db.yunzai_repo;
        }
        if (db.miao_plugin_repo) {
          pkg.miao_plugin_repo = db.miao_plugin_repo;
        }
        value['alemonjs-load-yunzai'] = pkg;

        config.saveValue(value);
        context.notification('Yunzai 配置保存成功～');
      } else if (data.type === 'yunzai.init') {
        let config = getConfigValue();

        if (!config) {
          config = {};
        }

        const yunzaiCfg = config['yunzai'] ?? {};
        const pkgCfg = config['alemonjs-load-yunzai'] ?? {};

        // 合并两个命名空间的配置返回给前端
        webView.postMessage({
          type: 'yunzai.init',
          data: {
            ...yunzaiCfg,
            gh_proxy: pkgCfg.gh_proxy ?? '',
            bot_name: pkgCfg.bot_name ?? '',
            yunzai_repo: pkgCfg.yunzai_repo ?? '',
            miao_plugin_repo: pkgCfg.miao_plugin_repo ?? ''
          }
        });
      } else if (data.type === 'yunzai.status') {
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
