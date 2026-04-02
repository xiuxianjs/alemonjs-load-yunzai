import { HeaderDiv, SecondaryDiv, SidebarDiv } from '@alemonjs/react-ui';
import React, { useState } from 'react';
import From from './From';
import Manage from './Manage';
import Repo from './Repo';

/* 在渲染前初始化 Desktop API */
if (typeof window !== 'undefined' && window.createDesktopAPI && !window.API) {
  window.API = window.createDesktopAPI();
}

const CONFIG_SECTIONS = [
  { key: 'qq', label: '💬 QQ 账号', short: '💬 QQ' },
  { key: 'feature', label: '🔧 功能开关', short: '🔧 功能' },
  { key: 'runtime', label: '⚙️ 运行配置', short: '⚙️ 运行' },
  { key: 'group', label: '👥 群聊配置', short: '👥 群聊' },
  { key: 'redis', label: '🗄️ Redis', short: '🗄️ Redis' },
  { key: 'blacklist', label: '📋 黑白名单', short: '📋 名单' },
  { key: 'notice', label: '🔔 通知推送', short: '🔔 通知' }
];

const CONFIG_KEYS = CONFIG_SECTIONS.map(s => s.key);

function NavItem({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-lg text-[13px] transition-all duration-150 ${active ? 'font-semibold opacity-100' : 'opacity-50 hover:opacity-75'}`}
      style={active ? { background: 'var(--alemonjs-primary-bg, rgba(128,128,128,.08))' } : undefined}
    >
      {children}
    </button>
  );
}

function Pill({ active, onClick, children, small }: { active: boolean; onClick: () => void; children: React.ReactNode; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full font-medium transition-all whitespace-nowrap ${small ? 'px-2.5 py-1 text-[11px]' : 'px-3.5 py-1.5 text-xs'} ${active ? 'opacity-100' : 'opacity-40 hover:opacity-65'}`}
      style={active ? { background: 'var(--alemonjs-primary-bg, rgba(128,128,128,.1))' } : undefined}
    >
      {children}
    </button>
  );
}

export default function App() {
  const [activeKey, setActiveKey] = useState('manage');
  const isConfig = CONFIG_KEYS.includes(activeKey);

  return (
    <SecondaryDiv className='min-h-screen lg:flex'>
      {/* ── PC 侧边栏 ── */}
      <SidebarDiv
        className='hidden lg:flex lg:flex-col w-52 shrink-0 p-3 sticky top-0 h-screen overflow-y-auto'
        style={{ borderRight: '1px solid rgba(128,128,128,.08)' }}
      >
        <div className='flex items-center gap-2.5 px-3 py-3 mb-4'>
          <div
            className='w-8 h-8 rounded-lg flex items-center justify-center text-base shadow-sm'
            style={{ background: 'linear-gradient(135deg, #d5c8b2, #8f8c76)' }}
          >
            ⚡
          </div>
          <div>
            <div className='text-sm font-bold gradient-text'>Yunzai</div>
            <div className='text-[9px] opacity-30'>Miao-Yunzai · AlemonJS</div>
          </div>
        </div>

        <NavItem active={activeKey === 'manage'} onClick={() => setActiveKey('manage')}>
          ⚡ 管理
        </NavItem>

        <div className='text-[10px] uppercase tracking-wider opacity-25 font-medium px-3 pt-5 pb-1'>配置</div>
        {CONFIG_SECTIONS.map(s => (
          <NavItem key={s.key} active={activeKey === s.key} onClick={() => setActiveKey(s.key)}>
            {s.label}
          </NavItem>
        ))}

        <div className='text-[10px] uppercase tracking-wider opacity-25 font-medium px-3 pt-5 pb-1'>其他</div>
        <NavItem active={activeKey === 'repo'} onClick={() => setActiveKey('repo')}>
          📦 仓库
        </NavItem>
      </SidebarDiv>

      {/* ── 主内容区 ── */}
      <div className='flex-1 min-h-screen flex flex-col'>
        {/* ── 移动端导航 ── */}
        <div className='lg:hidden'>
          <HeaderDiv className='px-4 py-3 flex items-center gap-3'>
            <div
              className='w-8 h-8 rounded-lg flex items-center justify-center text-base shadow-sm'
              style={{ background: 'linear-gradient(135deg, #d5c8b2, #8f8c76)' }}
            >
              ⚡
            </div>
            <div>
              <div className='text-sm font-bold gradient-text'>Yunzai 管理面板</div>
              <div className='text-[10px] opacity-30'>Miao-Yunzai · AlemonJS</div>
            </div>
          </HeaderDiv>
          <div className='flex gap-1.5 px-3 py-2'>
            <Pill active={activeKey === 'manage'} onClick={() => setActiveKey('manage')}>
              管理
            </Pill>
            <Pill
              active={isConfig}
              onClick={() => {
                if (!isConfig) { setActiveKey('qq'); }
              }}
            >
              配置
            </Pill>
            <Pill active={activeKey === 'repo'} onClick={() => setActiveKey('repo')}>
              仓库
            </Pill>
          </div>
          {isConfig && (
            <div className='flex gap-1.5 px-3 pb-2 overflow-x-auto' style={{ scrollbarWidth: 'none' }}>
              {CONFIG_SECTIONS.map(s => (
                <Pill key={s.key} active={activeKey === s.key} onClick={() => setActiveKey(s.key)} small>
                  {s.short}
                </Pill>
              ))}
            </div>
          )}
        </div>

        {/* ── 内容 ── */}
        <div className='flex-1 px-3 py-3 sm:px-4 lg:px-8 lg:py-6'>
          <div className='max-w-3xl mx-auto'>
            {activeKey === 'manage' && <Manage />}
            {isConfig && <From section={activeKey} />}
            {activeKey === 'repo' && <Repo />}
          </div>
        </div>
      </div>
    </SecondaryDiv>
  );
}
