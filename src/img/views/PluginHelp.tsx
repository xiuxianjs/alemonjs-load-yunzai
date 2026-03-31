import { UI_ICONS } from '@src/assets/img/index.js';
import type { PluginDef } from '@src/path.js';
import React from 'react';
import HTML from './HTML.js';

interface PluginItem extends PluginDef {
  installed: boolean;
}

interface PluginHelpProps {
  data: { plugins: PluginItem[] };
}

export default function PluginHelp({ data }: PluginHelpProps) {
  const { plugins } = data;
  const installed: PluginItem[] = [];
  const notInstalled: PluginItem[] = [];

  for (const p of plugins) {
    (p.installed ? installed : notInstalled).push(p);
  }

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
          <div className='flex gap-3 text-[13px]'>
            <span className='text-[#2a7a3a] font-bold'>✅ {installed.length}</span>
            <span className='text-[#888]'>📦 {notInstalled.length}</span>
          </div>
        </div>

        {/* ═══ 已安装 ═══ */}
        {installed.length > 0 && (
          <div className='bg-yz-card rounded-xl p-4 mb-3.5 shadow-card'>
            <div className='flex items-center gap-2 mb-2.5'>
              <div className='w-[5px] h-5 rounded-sm bg-yz-green' />
              <span className='text-base font-bold text-yz-text'>已安装</span>
              <span className='text-[11px] text-yz-gray ml-1'>({installed.length})</span>
            </div>
            <div className='grid grid-cols-2 gap-2'>
              {installed.map((p, i) => (
                <div key={i} className='flex items-center bg-yz-green-bg rounded-lg py-2 px-3 gap-2 border-l-4 border-yz-green'>
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-1.5'>
                      <span className='text-[12px] font-bold text-yz-green'>✅</span>
                      <span className='text-[12px] font-bold text-yz-text truncate'>{p.label}</span>
                    </div>
                    <div className='text-[11px] text-yz-gray truncate mt-0.5'>{'别名: ' + p.aliases.join(' / ')}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ 未安装 ═══ */}
        {notInstalled.length > 0 && (
          <div className='bg-yz-card rounded-xl p-4 mb-3.5 shadow-card'>
            <div className='flex items-center gap-2 mb-2.5'>
              <div className='w-[5px] h-5 rounded-sm bg-yz-blue' />
              <span className='text-base font-bold text-yz-text'>未安装</span>
              <span className='text-[11px] text-yz-gray ml-1'>({notInstalled.length})</span>
            </div>
            <div className='grid grid-cols-2 gap-2'>
              {notInstalled.map((p, i) => (
                <div key={i} className='flex items-center bg-yz-blue-bg rounded-lg py-2 px-3 gap-2'>
                  <div className='text-[12px] font-bold text-yz-blue bg-white rounded px-1.5 py-0.5 whitespace-nowrap min-w-[110px] text-center'>
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
        )}

        {/* ═══ 底部 ═══ */}
        <div className='bg-yz-card rounded-xl py-2.5 px-4 shadow-sm flex items-center justify-between'>
          <span className='text-xs text-yz-sub'>💡 发送 #yz帮助 查看管理指令</span>
          <span className='text-xs text-[#b0a18a]'>Powered by alemonjs</span>
        </div>
      </div>
    </HTML>
  );
}
