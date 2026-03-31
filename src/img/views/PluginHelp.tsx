import { UI_ICONS } from '@src/assets/img/index.js';
import type { PluginDef } from '@src/path.js';
import React from 'react';
import HTML from './HTML.js';

interface PluginHelpProps {
  data: { plugins: PluginDef[] };
}

export default function PluginHelp({ data }: PluginHelpProps) {
  const { plugins } = data;

  return (
    <HTML style={{ width: '780px' }}>
      <div className="p-[15px] bg-yz-bg font-['tttgbnumber',system-ui,sans-serif] text-base text-yz-text">
        {/* ═══ 标题卡 ═══ */}
        <div
          className='rounded-xl py-3.5 px-5 mb-3.5 shadow-card flex items-center justify-between'
          style={{ background: 'linear-gradient(135deg, #b8e6c8, #7cc99a)' }}
        >
          <div className='flex items-center gap-2'>
            <img src={UI_ICONS.paimon} className='w-7 h-7' />
            <span className='text-[22px] font-bold text-[#2a5e3a]'>Yunzai · 插件列表</span>
          </div>
          <span className='text-[13px] text-[#3b7a50]'>共 {plugins.length} 个插件</span>
        </div>

        {/* ═══ 插件列表 ═══ */}
        <div className='bg-yz-card rounded-xl p-4 mb-3.5 shadow-card'>
          <div className='flex items-center gap-2 mb-2.5'>
            <div className='w-[5px] h-5 rounded-sm bg-yz-green' />
            <span className='text-base font-bold text-yz-text'>可安装插件</span>
          </div>
          <div className='grid grid-cols-2 gap-2'>
            {plugins.map((p, i) => (
              <div key={i} className='flex items-center bg-yz-green-bg rounded-lg py-2 px-3 gap-2'>
                <div className='text-[12px] font-bold text-yz-green bg-white rounded px-1.5 py-0.5 whitespace-nowrap min-w-[110px] text-center'>
                  {'#yz安装插件' + p.aliases[0]}
                </div>
                <div className='flex-1 min-w-0'>
                  <div className='text-[12px] font-bold text-yz-text truncate'>{p.label}</div>
                  <div className='text-[11px] text-yz-gray truncate'>{'别名: ' + p.aliases.join(' / ')}</div>
                </div>
              </div>
            ))}
          </div>
          <div className='text-[11px] text-yz-gray mt-2 text-center'>{'支持 #yz安装插件<仓库地址> 直装 · 也可在配置文件中自定义 · 别名不区分大小写'}</div>
        </div>

        {/* ═══ 底部 ═══ */}
        <div className='bg-yz-card rounded-xl py-2.5 px-4 shadow-sm flex items-center justify-between'>
          <span className='text-xs text-yz-sub'>💡 发送 #yz帮助 查看管理指令</span>
          <span className='text-xs text-[#b0a18a]'>Powered by alemonjs</span>
        </div>
      </div>
    </HTML>
  );
}
