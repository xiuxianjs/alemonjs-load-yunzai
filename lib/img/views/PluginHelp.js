import { UI_ICONS } from '../../assets/img/index.js';
import React from 'react';
import HTML from './HTML.js';

function getPlatformTag(url) {
    if (url.includes('github.com')) {
        return { label: 'GitHub', color: 'text-[#333] bg-[#f0f0f0]' };
    }
    if (url.includes('gitee.com')) {
        return { label: 'Gitee', color: 'text-[#c71d23] bg-[#fef0f0]' };
    }
    if (url.includes('cnb.cool')) {
        return { label: 'CNB', color: 'text-[#1a7f37] bg-[#e6f9ed]' };
    }
    return { label: 'Git', color: 'text-[#666] bg-[#f5f5f5]' };
}
function PluginHelp({ data }) {
    const { plugins } = data;
    const installed = [];
    const notInstalled = [];
    for (const p of plugins) {
        (p.installed ? installed : notInstalled).push(p);
    }
    return (React.createElement(HTML, { style: { width: '780px' } },
        React.createElement("div", { className: "p-[15px] bg-yz-bg font-['tttgbnumber',system-ui,sans-serif] text-base text-yz-text" },
            React.createElement("div", { className: 'rounded-xl py-3.5 px-5 mb-3.5 shadow-card flex items-center justify-between', style: { background: 'linear-gradient(135deg, #b8e6c8, #7cc99a)' } },
                React.createElement("div", { className: 'flex items-center gap-2' },
                    React.createElement("img", { src: UI_ICONS.paimon, className: 'w-7 h-7' }),
                    React.createElement("span", { className: 'text-[22px] font-bold text-[#2a5e3a]' }, "Yunzai \u00B7 \u63D2\u4EF6\u5217\u8868")),
                React.createElement("div", { className: 'flex gap-3 text-[13px]' },
                    React.createElement("span", { className: 'text-[#2a7a3a] font-bold' },
                        "\u2705 ",
                        installed.length),
                    React.createElement("span", { className: 'text-[#888]' },
                        "\uD83D\uDCE6 ",
                        notInstalled.length))),
            installed.length > 0 && (React.createElement("div", { className: 'bg-yz-card rounded-xl p-4 mb-3.5 shadow-card' },
                React.createElement("div", { className: 'flex items-center gap-2 mb-2.5' },
                    React.createElement("div", { className: 'w-[5px] h-5 rounded-sm bg-yz-green' }),
                    React.createElement("span", { className: 'text-base font-bold text-yz-text' }, "\u5DF2\u5B89\u88C5"),
                    React.createElement("span", { className: 'text-[11px] text-yz-gray ml-1' },
                        "(",
                        installed.length,
                        ")")),
                React.createElement("div", { className: 'grid grid-cols-2 gap-2' }, installed.map((p, i) => {
                    const tag = getPlatformTag(p.repoUrl);
                    return (React.createElement("div", { key: i, className: 'bg-yz-green-bg rounded-lg py-2 px-3 border-l-4 border-yz-green' },
                        React.createElement("div", { className: 'flex items-center gap-1.5' },
                            React.createElement("span", { className: 'text-[12px] font-bold text-yz-green' }, "\u2705"),
                            React.createElement("span", { className: 'text-[12px] font-bold text-yz-text truncate' }, p.label),
                            React.createElement("span", { className: 'text-[9px] rounded px-1 py-0.5 ml-auto shrink-0 ' + tag.color }, tag.label)),
                        React.createElement("div", { className: 'text-[10px] text-yz-sub mt-0.5 truncate' }, p.dirName),
                        React.createElement("div", { className: 'text-[11px] text-yz-gray truncate mt-0.5' }, '别名: ' + p.aliases.join(' / ')),
                        React.createElement("div", { className: 'flex gap-1.5 mt-1 flex-wrap' },
                            React.createElement("span", { className: 'text-[10px] text-yz-green bg-white rounded px-1 py-0.5' }, '#yz插件说明' + p.aliases[0]),
                            React.createElement("span", { className: 'text-[10px] text-yz-blue bg-white rounded px-1 py-0.5' }, '#yz更新插件' + p.aliases[0]),
                            React.createElement("span", { className: 'text-[10px] text-yz-red bg-white rounded px-1 py-0.5' }, '#yz卸载插件' + p.aliases[0]))));
                })))),
            notInstalled.length > 0 && (React.createElement("div", { className: 'bg-yz-card rounded-xl p-4 mb-3.5 shadow-card' },
                React.createElement("div", { className: 'flex items-center gap-2 mb-2.5' },
                    React.createElement("div", { className: 'w-[5px] h-5 rounded-sm bg-yz-blue' }),
                    React.createElement("span", { className: 'text-base font-bold text-yz-text' }, "\u672A\u5B89\u88C5"),
                    React.createElement("span", { className: 'text-[11px] text-yz-gray ml-1' },
                        "(",
                        notInstalled.length,
                        ")")),
                React.createElement("div", { className: 'grid grid-cols-2 gap-2' }, notInstalled.map((p, i) => {
                    const tag = getPlatformTag(p.repoUrl);
                    return (React.createElement("div", { key: i, className: 'bg-yz-blue-bg rounded-lg py-2 px-3' },
                        React.createElement("div", { className: 'flex items-center gap-1.5' },
                            React.createElement("span", { className: 'text-[12px] font-bold text-yz-text truncate' }, p.label),
                            React.createElement("span", { className: 'text-[9px] rounded px-1 py-0.5 ml-auto shrink-0 ' + tag.color }, tag.label)),
                        React.createElement("div", { className: 'text-[10px] text-yz-sub mt-0.5 truncate' }, p.dirName),
                        React.createElement("div", { className: 'text-[11px] text-yz-gray truncate mt-0.5' }, '别名: ' + p.aliases.join(' / ')),
                        React.createElement("div", { className: 'mt-1' },
                            React.createElement("span", { className: 'text-[10px] font-bold text-yz-blue bg-white rounded px-1.5 py-0.5' }, '#yz安装插件' + p.aliases[0]))));
                })),
                React.createElement("div", { className: 'text-[11px] text-yz-gray mt-2 text-center' }, '支持 #yz安装插件<仓库地址> 直装 · 也可在配置文件中自定义 · 别名不区分大小写'))),
            React.createElement("div", { className: 'bg-yz-card rounded-xl py-2.5 px-4 shadow-sm flex items-center justify-between' },
                React.createElement("span", { className: 'text-xs text-yz-sub' }, "\uD83D\uDCA1 \u53D1\u9001 #yz\u5E2E\u52A9 \u67E5\u770B\u7BA1\u7406\u6307\u4EE4"),
                React.createElement("span", { className: 'text-xs text-[#b0a18a]' }, "Powered by alemonjs")))));
}

export { PluginHelp as default };
