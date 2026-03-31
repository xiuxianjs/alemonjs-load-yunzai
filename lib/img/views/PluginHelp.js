import { UI_ICONS } from '../../assets/img/index.js';
import React from 'react';
import HTML from './HTML.js';

function PluginHelp({ data }) {
    const { plugins } = data;
    return (React.createElement(HTML, { style: { width: '780px' } },
        React.createElement("div", { className: "p-[15px] bg-yz-bg font-['tttgbnumber',system-ui,sans-serif] text-base text-yz-text" },
            React.createElement("div", { className: 'rounded-xl py-3.5 px-5 mb-3.5 shadow-card flex items-center justify-between', style: { background: 'linear-gradient(135deg, #b8e6c8, #7cc99a)' } },
                React.createElement("div", { className: 'flex items-center gap-2' },
                    React.createElement("img", { src: UI_ICONS.paimon, className: 'w-7 h-7' }),
                    React.createElement("span", { className: 'text-[22px] font-bold text-[#2a5e3a]' }, "Yunzai \u00B7 \u63D2\u4EF6\u5217\u8868")),
                React.createElement("span", { className: 'text-[13px] text-[#3b7a50]' },
                    "\u5171 ",
                    plugins.length,
                    " \u4E2A\u63D2\u4EF6")),
            React.createElement("div", { className: 'bg-yz-card rounded-xl p-4 mb-3.5 shadow-card' },
                React.createElement("div", { className: 'flex items-center gap-2 mb-2.5' },
                    React.createElement("div", { className: 'w-[5px] h-5 rounded-sm bg-yz-green' }),
                    React.createElement("span", { className: 'text-base font-bold text-yz-text' }, "\u53EF\u5B89\u88C5\u63D2\u4EF6")),
                React.createElement("div", { className: 'grid grid-cols-2 gap-2' }, plugins.map((p, i) => (React.createElement("div", { key: i, className: 'flex items-center bg-yz-green-bg rounded-lg py-2 px-3 gap-2' },
                    React.createElement("div", { className: 'text-[12px] font-bold text-yz-green bg-white rounded px-1.5 py-0.5 whitespace-nowrap min-w-[110px] text-center' }, '#yz安装插件' + p.aliases[0]),
                    React.createElement("div", { className: 'flex-1 min-w-0' },
                        React.createElement("div", { className: 'text-[12px] font-bold text-yz-text truncate' }, p.label),
                        React.createElement("div", { className: 'text-[11px] text-yz-gray truncate' }, '别名: ' + p.aliases.join(' / '))))))),
                React.createElement("div", { className: 'text-[11px] text-yz-gray mt-2 text-center' }, '支持 #yz安装插件<仓库地址> 直装 · 也可在配置文件中自定义 · 别名不区分大小写')),
            React.createElement("div", { className: 'bg-yz-card rounded-xl py-2.5 px-4 shadow-sm flex items-center justify-between' },
                React.createElement("span", { className: 'text-xs text-yz-sub' }, "\uD83D\uDCA1 \u53D1\u9001 #yz\u5E2E\u52A9 \u67E5\u770B\u7BA1\u7406\u6307\u4EE4"),
                React.createElement("span", { className: 'text-xs text-[#b0a18a]' }, "Powered by alemonjs")))));
}

export { PluginHelp as default };
