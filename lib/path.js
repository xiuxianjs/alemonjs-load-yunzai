import { getConfigValue } from 'alemonjs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname$1 = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname$1, '..');
const WORKER_PATH = join(__dirname$1, 'yunzai', 'worker.js');
const YARN_PATH = join(PACKAGE_ROOT, 'yarn', 'yarn.cjs');
const DEFAULT_GH_PROXY = 'https://ghfast.top/';
const DEFAULT_BOT_NAME = 'Miao-Yunzai';
const DEFAULT_YUNZAI_REPO = 'https://github.com/yoimiya-kokomi/Miao-Yunzai.git';
const DEFAULT_MIAO_PLUGIN_REPO = 'https://github.com/yoimiya-kokomi/miao-plugin.git';
function getConfig() {
    const values = getConfigValue() || {};
    return values['alemonjs-load-yunzai'] || {};
}
function getGhProxy() {
    return getConfig()?.gh_proxy ?? DEFAULT_GH_PROXY;
}
function getDefaultRepo() {
    const repo = getConfig()?.yunzai_repo || DEFAULT_YUNZAI_REPO;
    return `${getGhProxy()}${repo}`;
}
function getMiaoPluginRepo() {
    const repo = getConfig()?.miao_plugin_repo || DEFAULT_MIAO_PLUGIN_REPO;
    return `${getGhProxy()}${repo}`;
}
function getYunzaiDir() {
    const botName = getConfig()?.bot_name || DEFAULT_BOT_NAME;
    return join(PACKAGE_ROOT, botName);
}

export { PACKAGE_ROOT, WORKER_PATH, YARN_PATH, getDefaultRepo, getGhProxy, getMiaoPluginRepo, getYunzaiDir };
