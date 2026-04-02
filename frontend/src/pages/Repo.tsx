import { Button, HeaderDiv, Input, PrimaryDiv, SecondaryDiv, TagDiv, Tooltip } from '@alemonjs/react-ui';
import React, { useEffect, useState } from 'react';

const INITIAL = {
  master_key: '',
  master_id: '',
  gh_proxy: '',
  bot_name: '',
  yunzai_repo: '',
  miao_plugin_repo: ''
};

type RepoData = typeof INITIAL;

function Row({ label, tip, children }: { label: string; tip?: string; children: React.ReactNode }) {
  return (
    <div className='row-hover flex flex-col xs:flex-row xs:items-center xs:justify-between gap-1 xs:gap-3 py-2.5'>
      <div className='flex items-center gap-1.5 shrink-0 text-sm font-medium opacity-75'>
        <span>{label}</span>
        {tip && (
          <Tooltip text={tip} position='right'>
            <span className='cursor-help opacity-40 text-[10px] w-3.5 h-3.5 rounded-full border border-current flex items-center justify-center'>?</span>
          </Tooltip>
        )}
      </div>
      <div className='w-full xs:flex-1 xs:max-w-[60%]'>{children}</div>
    </div>
  );
}

export default function Repo() {
  const [formData, setFormData] = useState<RepoData>({ ...INITIAL });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!window.API) {
      return;
    }
    window.API.postMessage({ type: 'repo.init' });
    window.API.onMessage(data => {
      if (data.type === 'repo.init') {
        const d = data.data ?? {};
        const arr2str = (v: unknown) => (Array.isArray(v) ? v.join(',') : String(v ?? ''));

        setFormData({
          master_key: arr2str(d.master_key),
          master_id: arr2str(d.master_id),
          gh_proxy: d.gh_proxy ?? '',
          bot_name: d.bot_name ?? '',
          yunzai_repo: d.yunzai_repo ?? '',
          miao_plugin_repo: d.miao_plugin_repo ?? ''
        });
      }
    });
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    window.API.postMessage({ type: 'repo.save', data: formData });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <form onSubmit={handleSubmit} className='py-2 space-y-4'>
      <div className='xl:grid xl:grid-cols-2 xl:gap-5 space-y-4 xl:space-y-0'>
        {/* ── 主人认证 ── */}
        <SecondaryDiv className='rounded-xl overflow-hidden'>
          <HeaderDiv className='px-5 py-3 flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <span className='text-sm font-semibold'>🔑 主人认证</span>
              <TagDiv className='px-2 py-0.5 rounded-full text-[10px]'>AlemonJS</TagDiv>
            </div>
          </HeaderDiv>
          <PrimaryDiv className='px-5 py-1 divide-y divide-gray-200/10'>
            <Row label='Master Key' tip='AlemonJS 主人密钥，逗号分隔多个'>
              <Input
                name='master_key'
                value={formData.master_key}
                placeholder='key1,key2'
                onChange={handleChange}
                className='w-full px-3 py-1.5 text-sm rounded-lg'
              />
            </Row>
            <Row label='主人 ID' tip='AlemonJS 主人 ID，逗号分隔多个'>
              <Input
                name='master_id'
                value={formData.master_id}
                placeholder='id1,id2'
                onChange={handleChange}
                className='w-full px-3 py-1.5 text-sm rounded-lg'
              />
            </Row>
          </PrimaryDiv>
        </SecondaryDiv>

        {/* ── 仓库地址 ── */}
        <SecondaryDiv className='rounded-xl overflow-hidden'>
          <HeaderDiv className='px-5 py-3 flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <span className='text-sm font-semibold'>📦 仓库地址</span>
              <TagDiv className='px-2 py-0.5 rounded-full text-[10px]'>Git</TagDiv>
            </div>
          </HeaderDiv>
          <PrimaryDiv className='px-5 py-1 divide-y divide-gray-200/10'>
            <Row label='Yunzai 仓库'>
              <Input
                name='yunzai_repo'
                value={formData.yunzai_repo}
                placeholder='https://github.com/.../Miao-Yunzai.git'
                onChange={handleChange}
                className='w-full px-3 py-1.5 text-sm rounded-lg'
              />
            </Row>
            <Row label='Miao 插件仓库'>
              <Input
                name='miao_plugin_repo'
                value={formData.miao_plugin_repo}
                placeholder='https://github.com/.../miao-plugin.git'
                onChange={handleChange}
                className='w-full px-3 py-1.5 text-sm rounded-lg'
              />
            </Row>
          </PrimaryDiv>
        </SecondaryDiv>
      </div>

      {/* ── 网络配置 ── */}
      <SecondaryDiv className='rounded-xl overflow-hidden'>
        <HeaderDiv className='px-5 py-3'>
          <span className='text-sm font-semibold'>🌐 网络配置</span>
        </HeaderDiv>
        <PrimaryDiv className='px-5 py-1 divide-y divide-gray-200/10'>
          <Row label='GitHub 代理' tip='国内加速代理地址'>
            <Input
              name='gh_proxy'
              value={formData.gh_proxy}
              placeholder='https://ghfast.top/'
              onChange={handleChange}
              className='w-full px-3 py-1.5 text-sm rounded-lg'
            />
          </Row>
          <Row label='目录名' tip='本地 Yunzai 目录名称'>
            <Input
              name='bot_name'
              value={formData.bot_name}
              placeholder='Miao-Yunzai'
              onChange={handleChange}
              className='w-full px-3 py-1.5 text-sm rounded-lg'
            />
          </Row>
        </PrimaryDiv>
      </SecondaryDiv>

      {/* ── 保存 ── */}
      <div className='flex justify-end'>
        <Button
          type='submit'
          className={`px-6 py-2 rounded-xl text-sm font-semibold shadow-sm ${saved ? 'animate-save-pop opacity-70' : 'hover:shadow-md'}`}
          style={!saved ? { background: 'linear-gradient(135deg, #d5c8b2 0%, #8f8c76 100%)' } : undefined}
        >
          {saved ? '✓ 已保存' : '💾 保存'}
        </Button>
      </div>
    </form>
  );
}
