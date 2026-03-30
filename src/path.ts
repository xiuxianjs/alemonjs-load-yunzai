/**
 * 路径配置
 */
import { getConfigValue } from 'alemonjs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 插件包根目录 (alemonjs-load-yunzai/) */
export const PACKAGE_ROOT = join(__dirname, '..');

/** 默认 git 仓库地址 */
export const DEFAULT_REPO = 'https://github.com/yoimiya-kokomi/Miao-Yunzai.git';
export const DEFAULT_BOT_NAME = 'Miao-Yunzai';

const values = getConfigValue() || {};
const value = values['alemonjs-load-yunzai'] || '';
const botName = value?.bot_name || DEFAULT_BOT_NAME;

/** Miao-Yunzai 安装目录 (默认为插件包内的 Miao-Yunzai/) */
export const YUNZAI_DIR = join(PACKAGE_ROOT, botName);

/** Worker 脚本路径 (编译后位于 lib/yunzai/worker.js) */
export const WORKER_PATH = join(__dirname, 'yunzai', 'worker.js');

/** 内置 yarn 入口脚本路径 */
export const YARN_PATH = join(PACKAGE_ROOT, 'yarn', 'yarn.cjs');