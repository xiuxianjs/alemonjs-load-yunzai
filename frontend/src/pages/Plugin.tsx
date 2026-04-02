import { Button, Collapse, HeaderDiv, Input, Modal, NotificationDiv, PrimaryDiv, SecondaryDiv, TagDiv } from '@alemonjs/react-ui';
import { useEffect, useState } from 'react';
import { SmartDropdown } from './SmartDropdown';

interface PluginItem {
  name: string;
  installed: boolean;
}

interface CatalogItem {
  dirName: string;
  label: string;
  aliases: string[];
  repoUrl: string;
  installed: boolean;
}

/** 插件图标映射 */
const PLUGIN_ICONS: Record<string, string> = {
  'miao-plugin': '🐱',
  'StarRail-plugin': '🚂',
  'ZZZ-Plugin': '🎮',
  'xiaoyao-cvs-plugin': '📚',
  'guoba-plugin': '🍢',
  'liangshi-calc': '🧮',
  'endfield-suzuki-plugin': '🏗️',
  'zmd-plugin': '🌍',
  'delta-force-plugin': '🔺',
  'GloryOfKings-Plugin': '👑',
  'cb-plugin': '🛡️',
  'waves-plugin': '🌊',
  '1999-plugin': '⏳',
  'Yunzai-Kuro-Plugin': '🎯',
  'Tlon-Sky': '☁️'
};

/** 插件简短描述 */
const PLUGIN_DESC: Record<string, string> = {
  'miao-plugin': '原神面板查询、角色攻略、伤害计算等',
  'StarRail-plugin': '崩坏：星穹铁道攻略与数据查询',
  'ZZZ-Plugin': '绝区零游戏数据查询',
  'xiaoyao-cvs-plugin': '原神/星铁/绝区零图鉴查询',
  'guoba-plugin': 'Yunzai 后台管理面板',
  'liangshi-calc': '喵喵面板扩展与练度计算',
  'endfield-suzuki-plugin': '明日方舟：终末地数据查询',
  'zmd-plugin': '终末地游戏数据查询',
  'delta-force-plugin': '三角洲行动游戏数据查询',
  'GloryOfKings-Plugin': '王者荣耀数据与战绩查询',
  'cb-plugin': '尘白禁区游戏数据查询',
  'waves-plugin': '鸣潮游戏数据查询',
  '1999-plugin': '重返未来 1999 游戏数据',
  'Yunzai-Kuro-Plugin': '库洛游戏通用插件',
  'Tlon-Sky': '光遇游戏数据查询'
};

interface PluginState {
  installed: boolean;
  busy: boolean;
  plugins: PluginItem[];
  catalog: CatalogItem[];
}

export default function Plugin() {
  const [state, setState] = useState<PluginState>({
    installed: false,
    busy: false,
    plugins: [],
    catalog: []
  });
  const [loading, setLoading] = useState('');
  const [message, setMessage] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ action: string; label: string; extra?: Record<string, string> } | null>(null);

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 4000);
  };

  useEffect(() => {
    if (!window.API) {
      return;
    }

    const handler = (data: Record<string, unknown>) => {
      if (data.type === 'yunzai.status') {
        const d = data.data as Record<string, unknown>;

        setState({
          installed: d.installed as boolean,
          busy: d.busy as boolean,
          plugins: (d.plugins as PluginItem[]) ?? [],
          catalog: (d.catalog as CatalogItem[]) ?? []
        });
      } else if (data.type === 'yunzai.result') {
        setLoading('');
        showMessage((data.data as Record<string, string>)?.message ?? '操作完成');
        window.API.postMessage({ type: 'yunzai.status' });
      }
    };

    window.API.onMessage(handler);
    window.API.postMessage({ type: 'yunzai.status' });
  }, []);

  const sendAction = (action: string, label: string, extra?: Record<string, string>) => {
    if (loading) {
      return;
    }
    setLoading(label);
    window.API.postMessage({ type: 'yunzai.action', data: { action, ...extra } });
  };

  const dangerAction = (action: string, label: string, extra?: Record<string, string>) => {
    setConfirmAction({ action, label, extra });
  };

  const confirmDanger = () => {
    if (!confirmAction) {
      return;
    }
    sendAction(confirmAction.action, confirmAction.label, confirmAction.extra);
    setConfirmAction(null);
  };

  const handleInstallUrl = () => {
    const val = customUrl.trim();

    if (!val) {
      return;
    }
    sendAction('install_plugin', `安装 ${val}`, { plugin: val });
    setCustomUrl('');
  };

  const isDisabled = !!loading || state.busy;

  // 分组：目录内已安装 / 目录内未安装
  const catalogInstalled = state.catalog.filter(c => c.installed);
  const catalogNotInstalled = state.catalog.filter(c => !c.installed);

  // 已安装但不在插件目录中的（用户自己装的）
  const catalogDirNames = new Set(state.catalog.map(c => c.dirName));
  const extraInstalled = state.plugins.filter(p => !catalogDirNames.has(p.name));

  if (!state.installed) {
    return (
      <div className='py-2'>
        <PrimaryDiv className='rounded-xl p-6 text-center space-y-2'>
          <div className='text-2xl'>📦</div>
          <div className='text-sm opacity-50'>请先在管理页安装 Yunzai</div>
        </PrimaryDiv>
      </div>
    );
  }

  return (
    <div className='py-2 space-y-3'>
      {/* ── 通知 ── */}
      {message && <NotificationDiv className='rounded-xl px-4 py-3 text-sm animate-fade-in shadow-sm'>{message}</NotificationDiv>}

      {/* ── 进行中 ── */}
      {(loading || state.busy) && (
        <PrimaryDiv className='rounded-xl px-4 py-3.5 flex items-center justify-between animate-fade-in'>
          <div className='flex items-center gap-2.5'>
            <div className='w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin opacity-50' />
            <span className='text-sm font-medium opacity-70'>{loading || '处理中...'}</span>
          </div>
        </PrimaryDiv>
      )}

      {/* ── 已安装插件 ── */}
      {(catalogInstalled.length > 0 || extraInstalled.length > 0) && (
        <SecondaryDiv className='rounded-xl overflow-hidden'>
          <HeaderDiv className='px-4 py-2.5 flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <span className='text-sm font-semibold'>✅ 已安装</span>
              <TagDiv className='px-2 py-0.5 rounded-full text-[10px]'>{catalogInstalled.length + extraInstalled.length}</TagDiv>
            </div>
          </HeaderDiv>
          <div className='grid grid-cols-1 xl:grid-cols-2 gap-px' style={{ background: 'rgba(128,128,128,.06)' }}>
            {catalogInstalled.map(p => (
              <PrimaryDiv key={p.dirName} className='px-4 py-3 flex items-start gap-3'>
                <div className='w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0' style={{ background: 'rgba(128,128,128,.06)' }}>
                  {PLUGIN_ICONS[p.dirName] ?? '🧩'}
                </div>
                <div className='flex-1 min-w-0'>
                  <div className='flex items-center gap-2'>
                    <span className='text-[13px] font-semibold truncate'>{p.label}</span>
                    <span className='shrink-0 w-1.5 h-1.5 rounded-full bg-green-500' title='已安装' />
                  </div>
                  <div className='text-[11px] opacity-40 mt-0.5 line-clamp-1'>{PLUGIN_DESC[p.dirName] ?? p.aliases.join(' / ')}</div>
                  <div className='flex items-center gap-1.5 mt-1.5'>
                    <Button
                      className='px-2.5 py-1 text-[11px] rounded-lg font-medium'
                      onClick={() => sendAction('update_plugin', `更新 ${p.label}`, { plugin: p.dirName })}
                      disabled={isDisabled}
                    >
                      更新
                    </Button>
                    <SmartDropdown
                      buttons={[
                        {
                          children: '强制更新',
                          onClick: () => sendAction('force_update_plugin', `强制更新 ${p.label}`, { plugin: p.dirName }),
                          disabled: isDisabled
                        },
                        {
                          children: '卸载',
                          onClick: () => dangerAction('uninstall_plugin', `卸载 ${p.label}`, { plugin: p.dirName }),
                          disabled: isDisabled,
                          className: 'text-red-400'
                        }
                      ]}
                    >
                      <Button className='px-2 py-1 text-[11px] rounded-lg'>···</Button>
                    </SmartDropdown>
                  </div>
                </div>
              </PrimaryDiv>
            ))}
            {extraInstalled.map(p => (
              <PrimaryDiv key={p.name} className='px-4 py-3 flex items-start gap-3'>
                <div className='w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0' style={{ background: 'rgba(128,128,128,.06)' }}>
                  🧩
                </div>
                <div className='flex-1 min-w-0'>
                  <div className='flex items-center gap-2'>
                    <span className='text-[13px] font-semibold truncate'>{p.name}</span>
                    <span className='shrink-0 w-1.5 h-1.5 rounded-full bg-green-500' title='已安装' />
                  </div>
                  <div className='text-[11px] opacity-40 mt-0.5 line-clamp-1'>第三方插件</div>
                  <div className='flex items-center gap-1.5 mt-1.5'>
                    <Button
                      className='px-2.5 py-1 text-[11px] rounded-lg font-medium'
                      onClick={() => sendAction('update_plugin', `更新 ${p.name}`, { plugin: p.name })}
                      disabled={isDisabled}
                    >
                      更新
                    </Button>
                    <SmartDropdown
                      buttons={[
                        {
                          children: '强制更新',
                          onClick: () => sendAction('force_update_plugin', `强制更新 ${p.name}`, { plugin: p.name }),
                          disabled: isDisabled
                        },
                        {
                          children: '卸载',
                          onClick: () => dangerAction('uninstall_plugin', `卸载 ${p.name}`, { plugin: p.name }),
                          disabled: isDisabled,
                          className: 'text-red-400'
                        }
                      ]}
                    >
                      <Button className='px-2 py-1 text-[11px] rounded-lg'>···</Button>
                    </SmartDropdown>
                  </div>
                </div>
              </PrimaryDiv>
            ))}
          </div>
        </SecondaryDiv>
      )}

      {/* ── 未安装插件 ── */}
      {catalogNotInstalled.length > 0 && (
        <SecondaryDiv className='rounded-xl overflow-hidden'>
          <HeaderDiv className='px-4 py-2.5 flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <span className='text-sm font-semibold'>🏪 可安装</span>
              <TagDiv className='px-2 py-0.5 rounded-full text-[10px]'>{catalogNotInstalled.length}</TagDiv>
            </div>
          </HeaderDiv>
          <div className='grid grid-cols-1 xl:grid-cols-2 gap-px' style={{ background: 'rgba(128,128,128,.06)' }}>
            {catalogNotInstalled.map(p => (
              <PrimaryDiv key={p.dirName} className='px-4 py-3 flex items-start gap-3'>
                <div className='w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0' style={{ background: 'rgba(128,128,128,.06)' }}>
                  {PLUGIN_ICONS[p.dirName] ?? '🧩'}
                </div>
                <div className='flex-1 min-w-0'>
                  <div className='flex items-center gap-2'>
                    <span className='text-[13px] font-semibold truncate'>{p.label}</span>
                  </div>
                  <div className='text-[11px] opacity-40 mt-0.5 line-clamp-1'>{PLUGIN_DESC[p.dirName] ?? p.aliases.join(' / ')}</div>
                  <div className='flex items-center gap-1.5 mt-1.5'>
                    <Button
                      className='px-3 py-1 text-[11px] rounded-lg font-medium'
                      onClick={() => sendAction('install_plugin', `安装 ${p.label}`, { plugin: p.aliases[0] })}
                      disabled={isDisabled}
                      style={{ background: 'linear-gradient(135deg, #d5c8b2 0%, #8f8c76 100%)' }}
                    >
                      安装
                    </Button>
                  </div>
                </div>
              </PrimaryDiv>
            ))}
          </div>
        </SecondaryDiv>
      )}

      {/* ── 自定义安装 ── */}
      <Collapse
        items={[
          {
            key: 'custom-url',
            label: '🔗 通过 URL 安装',
            children: (
              <PrimaryDiv className='rounded-b-xl px-4 py-3'>
                <div className='text-[11px] opacity-40 mb-2'>输入 Git 仓库地址安装第三方插件</div>
                <div className='flex gap-2'>
                  <Input
                    type='text'
                    value={customUrl}
                    onChange={e => setCustomUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleInstallUrl()}
                    placeholder='https://github.com/xxx/xxx-plugin.git'
                    className='flex-1 px-3 py-1.5 text-sm rounded-xl'
                  />
                  <Button className='px-4 py-1.5 rounded-xl text-sm font-medium' onClick={handleInstallUrl} disabled={isDisabled || !customUrl.trim()}>
                    安装
                  </Button>
                </div>
              </PrimaryDiv>
            )
          }
        ]}
      />

      {/* ── 确认弹窗 ── */}
      <Modal isOpen={!!confirmAction} onClose={() => setConfirmAction(null)}>
        <div className='p-6 space-y-5'>
          <div className='text-base font-semibold'>⚠️ 确认操作</div>
          <div className='text-sm opacity-60 leading-relaxed'>确定要{confirmAction?.label}吗？此操作不可撤销。</div>
          <div className='flex gap-2.5 justify-end'>
            <Button className='px-5 py-2 rounded-xl text-sm font-medium' onClick={() => setConfirmAction(null)}>
              取消
            </Button>
            <Button className='px-5 py-2 rounded-xl text-sm font-medium bg-red-500/20 hover:bg-red-500/30' onClick={confirmDanger}>
              确认
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
