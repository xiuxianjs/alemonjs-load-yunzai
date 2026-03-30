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
    const values = getConfigValue() ?? {};
    return values['alemonjs-load-yunzai'] ?? {};
}
function getGhProxy() {
    return getConfig()?.gh_proxy ?? DEFAULT_GH_PROXY;
}
function getDefaultRepo() {
    const repo = getConfig()?.yunzai_repo ?? DEFAULT_YUNZAI_REPO;
    return `${getGhProxy()}${repo}`;
}
function getMiaoPluginRepo() {
    const repo = getConfig()?.miao_plugin_repo ?? DEFAULT_MIAO_PLUGIN_REPO;
    return `${getGhProxy()}${repo}`;
}
const PLUGIN_ALIAS_MAP = {
    miao: { dirName: 'miao-plugin', repoUrl: 'https://github.com/yoimiya-kokomi/miao-plugin.git', label: 'miao-plugin' },
    miaomiao: { dirName: 'miao-plugin', repoUrl: 'https://github.com/yoimiya-kokomi/miao-plugin.git', label: 'miao-plugin' },
    原神: { dirName: 'miao-plugin', repoUrl: 'https://github.com/yoimiya-kokomi/miao-plugin.git', label: 'miao-plugin' },
    starrail: { dirName: 'StarRail-plugin', repoUrl: 'https://gitee.com/hewang1an/StarRail-plugin.git', label: 'StarRail-plugin' },
    星铁: { dirName: 'StarRail-plugin', repoUrl: 'https://gitee.com/hewang1an/StarRail-plugin.git', label: 'StarRail-plugin' },
    zzz: { dirName: 'ZZZ-Plugin', repoUrl: 'https://gitee.com/bietiaop/ZZZ-Plugin.git', label: 'ZZZ-Plugin' },
    图鉴: { dirName: 'xiaoyao-cvs-plugin', repoUrl: 'https://cnb.cool/tar/xiaoyao-cvs-plugin.git', label: 'xiaoyao-cvs-plugin' },
    锅巴: { dirName: 'guoba-plugin', repoUrl: 'https://gitee.com/guoba-yunzai/guoba-plugin.git', label: 'guoba-plugin' },
    guoba: { dirName: 'guoba-plugin', repoUrl: 'https://gitee.com/guoba-yunzai/guoba-plugin.git', label: 'guoba-plugin' }
};
function getPluginInfo(alias) {
    return PLUGIN_ALIAS_MAP[alias.toLowerCase()];
}
function getYunzaiDir() {
    const botName = getConfig()?.bot_name ?? DEFAULT_BOT_NAME;
    return join(PACKAGE_ROOT, botName);
}

export { PACKAGE_ROOT, WORKER_PATH, YARN_PATH, getDefaultRepo, getGhProxy, getMiaoPluginRepo, getPluginInfo, getYunzaiDir };
