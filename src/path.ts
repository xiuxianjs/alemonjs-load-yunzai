/**
 * 路径配置
 *
 * 配置相关的值通过函数导出，每次调用时从 getConfigValue() 实时读取，
 * 支持 AlemonJS 动态修改配置后立即生效。
 */
import { getConfigValue } from 'alemonjs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 插件包根目录 (alemonjs-load-yunzai/) */
export const PACKAGE_ROOT = join(__dirname, '..');

/** Worker 脚本路径 (编译后位于 lib/yunzai/worker.js) */
export const WORKER_PATH = join(__dirname, 'yunzai', 'worker.js');

/** 内置 yarn 入口脚本路径 */
export const YARN_PATH = join(PACKAGE_ROOT, 'yarn', 'yarn.cjs');

// ─── 以下均为动态读取配置 ───

const DEFAULT_GH_PROXY = 'https://ghfast.top/';
const DEFAULT_BOT_NAME = 'Miao-Yunzai';
const DEFAULT_YUNZAI_REPO = 'https://github.com/yoimiya-kokomi/Miao-Yunzai.git';
const DEFAULT_MIAO_PLUGIN_REPO = 'https://github.com/yoimiya-kokomi/miao-plugin.git';

function getConfig() {
  const values = getConfigValue() || {};
  return values['alemonjs-load-yunzai'] || {};
}

/** GitHub 代理前缀 */
export function getGhProxy(): string {
  return getConfig()?.gh_proxy ?? DEFAULT_GH_PROXY;
}

/** 默认 Yunzai 仓库地址 */
export function getDefaultRepo(): string {
  const repo = getConfig()?.yunzai_repo || DEFAULT_YUNZAI_REPO;
  return `${getGhProxy()}${repo}`;
}

/** miao-plugin 仓库地址 */
export function getMiaoPluginRepo(): string {
  const repo = getConfig()?.miao_plugin_repo || DEFAULT_MIAO_PLUGIN_REPO;
  return `${getGhProxy()}${repo}`;
}

/** Miao-Yunzai 安装目录 */
export function getYunzaiDir(): string {
  const botName = getConfig()?.bot_name || DEFAULT_BOT_NAME;
  return join(PACKAGE_ROOT, botName);
}
