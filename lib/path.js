import { getConfigValue } from 'alemonjs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname$1 = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname$1, '..');
const DEFAULT_REPO = 'https://github.com/yoimiya-kokomi/Miao-Yunzai.git';
const DEFAULT_BOT_NAME = 'Miao-Yunzai';
const values = getConfigValue() || {};
const value = values['alemonjs-load-yunzai'] || '';
const botName = value?.bot_name || DEFAULT_BOT_NAME;
const YUNZAI_DIR = join(PACKAGE_ROOT, botName);
const WORKER_PATH = join(__dirname$1, 'yunzai', 'worker.js');
const YARN_PATH = join(PACKAGE_ROOT, 'yarn', 'yarn.cjs');

export { DEFAULT_BOT_NAME, DEFAULT_REPO, PACKAGE_ROOT, WORKER_PATH, YARN_PATH, YUNZAI_DIR };
