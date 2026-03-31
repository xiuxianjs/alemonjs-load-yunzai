import { UI_ICONS } from '@src/assets/img/index.js';
import Markdown from 'markdown-to-jsx';
import React from 'react';
import HTML from './HTML.js';

interface PluginReadmeProps {
  data: {
    label: string;
    dirName: string;
    content: string;
  };
}

const mdOverrides = {
  h1: { component: 'div' as const, props: { className: 'text-[16px] font-bold text-yz-gold-dark mt-3 mb-1.5 pb-1 border-b border-[#e0d5c0]' } },
  h2: { component: 'div' as const, props: { className: 'text-[16px] font-bold text-yz-gold-dark mt-3 mb-1.5 pb-1 border-b border-[#e0d5c0]' } },
  h3: { component: 'div' as const, props: { className: 'text-[14px] font-bold text-yz-text mt-2 mb-1' } },
  h4: { component: 'div' as const, props: { className: 'text-[14px] font-bold text-yz-text mt-2 mb-1' } },
  h5: { component: 'div' as const, props: { className: 'text-[14px] font-bold text-yz-text mt-2 mb-1' } },
  h6: { component: 'div' as const, props: { className: 'text-[14px] font-bold text-yz-text mt-2 mb-1' } },
  p: { component: 'div' as const, props: { className: 'text-[12px] text-yz-text leading-[1.8]' } },
  hr: { component: 'div' as const, props: { className: 'border-t border-[#e0d5c0] my-2' } },
  pre: {
    component: 'pre' as const,
    props: { className: 'bg-[#f5f0e8] rounded-lg px-3 py-2 my-1.5 text-[11px] text-[#5a4a3a] overflow-x-auto whitespace-pre-wrap break-all' }
  },
  code: { component: 'code' as const, props: { className: 'bg-[#f5f0e8] rounded px-1 py-0.5 text-[11px] text-[#5a4a3a]' } },
  ul: { component: 'ul' as const, props: { className: 'text-[12px] text-yz-text leading-[1.8] list-disc pl-5 my-1' } },
  ol: { component: 'ol' as const, props: { className: 'text-[12px] text-yz-text leading-[1.8] list-decimal pl-5 my-1' } },
  li: { component: 'li' as const, props: { className: 'my-0.5' } },
  a: { component: 'span' as const, props: { className: 'text-yz-gold-dark underline' } },
  blockquote: { component: 'div' as const, props: { className: 'border-l-4 border-[#e0d5c0] pl-3 my-1.5 text-[12px] text-yz-sub italic' } },
  table: { component: 'table' as const, props: { className: 'text-[12px] text-yz-text border-collapse my-2 w-full' } },
  th: { component: 'th' as const, props: { className: 'border border-[#e0d5c0] px-2 py-1 bg-[#f5f0e8] font-bold text-left' } },
  td: { component: 'td' as const, props: { className: 'border border-[#e0d5c0] px-2 py-1' } },
  img: { component: 'span' as const, props: { className: 'hidden' } }
};

export default function PluginReadme({ data }: PluginReadmeProps) {
  return (
    <HTML style={{ width: '780px' }}>
      <div className="p-[15px] bg-yz-bg font-['tttgbnumber',system-ui,sans-serif] text-base text-yz-text">
        {/* ═══ 标题卡 ═══ */}
        <div
          className='rounded-xl py-3.5 px-5 mb-3.5 shadow-card flex items-center justify-between'
          style={{ background: 'linear-gradient(135deg, #e8d5b0, #d3bc8e)' }}
        >
          <div className='flex items-center gap-2'>
            <img src={UI_ICONS.paimon} className='w-7 h-7' />
            <span className='text-[22px] font-bold text-yz-gold-dark'>{data.label}</span>
          </div>
          <span className='text-[13px] text-[#6b5838]'>{data.dirName}</span>
        </div>

        {/* ═══ README 内容 ═══ */}
        <div className='bg-yz-card rounded-xl p-5 mb-3.5 shadow-card'>
          <Markdown options={{ overrides: mdOverrides }}>{data.content}</Markdown>
        </div>

        {/* ═══ 底部 ═══ */}
        <div className='bg-yz-card rounded-xl py-2.5 px-4 shadow-sm flex items-center justify-between'>
          <span className='text-xs text-yz-sub'>💡 发送 #yz插件帮助 查看插件列表</span>
          <span className='text-xs text-[#b0a18a]'>Powered by alemonjs</span>
        </div>
      </div>
    </HTML>
  );
}
