import { Button, Dropdown, Input, Modal, NotificationDiv, PrimaryDiv, Select, TagDiv } from '@alemonjs/react-ui';
import { useEffect, useState } from 'react';

interface PluginItem {
  name: string;
  installed: boolean;
}

interface ManagerState {
  status: string;
  installed: boolean;
  running: boolean;
  busy: boolean;
  busyTask: string;
  plugins: PluginItem[];
  logCount: number;
}

export default function Manage() {
  const [state, setState] = useState<ManagerState>({
    status: '获取中...',
    installed: false,
    running: false,
    busy: false,
    busyTask: '',
    plugins: [],
    logCount: 0
  });
  const [loading, setLoading] = useState('');
  const [message, setMessage] = useState('');
  const [pluginInput, setPluginInput] = useState('');
  const [pluginSource, setPluginSource] = useState<'alias' | 'url'>('alias');
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
        setState(data.data as ManagerState);
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

  const handleInstallPlugin = () => {
    const val = pluginInput.trim();

    if (!val) {
      return;
    }
    sendAction('install_plugin', `安装 ${val}`, { plugin: val });
    setPluginInput('');
  };

  const isDisabled = !!loading || state.busy;

  return (
    <div className='py-2 space-y-4'>
      {/* ── 通知 ── */}
      {message && <NotificationDiv className='rounded-xl px-4 py-3 text-sm animate-fade-in shadow-sm'>{message}</NotificationDiv>}

      {/* ── 进行中 ── */}
      {(loading || state.busy) && (
        <PrimaryDiv className='rounded-xl px-4 py-3.5 flex items-center justify-between animate-fade-in'>
          <div className='flex items-center gap-2.5'>
            <div className='w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin opacity-50' />
            <span className='text-sm font-medium opacity-70'>{loading || state.busyTask}</span>
          </div>
          {state.busy && (
            <Button className='px-3 py-1 text-xs rounded-lg' onClick={() => sendAction('cancel', '取消')}>
              取消
            </Button>
          )}
        </PrimaryDiv>
      )}

      {/* ── 状态卡片 + 进程控制（PC 端并排） ── */}
      <div className={`space-y-4 ${state.installed ? 'xl:flex xl:gap-5 xl:space-y-0 xl:items-start' : ''}`}>
        <PrimaryDiv className='rounded-xl p-5 card-hover xl:flex-1'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-3'>
              <div
                className='relative w-10 h-10 rounded-xl flex items-center justify-center text-lg'
                style={{
                  background: state.running
                    ? 'linear-gradient(135deg, #22c55e33, #22c55e11)'
                    : state.installed
                      ? 'linear-gradient(135deg, #eab30833, #eab30811)'
                      : 'linear-gradient(135deg, #9ca3af33, #9ca3af11)'
                }}
              >
                <div
                  className={`absolute top-1 right-1 w-2.5 h-2.5 rounded-full ${state.running ? 'bg-green-500 animate-pulse-dot shadow-[0_0_8px_rgba(34,197,94,.6)]' : state.installed ? 'bg-yellow-500' : 'bg-gray-400'}`}
                />
                ⚡
              </div>
              <div>
                <div className='text-sm font-semibold tracking-tight'>Yunzai</div>
                <div className='text-[11px] opacity-40 mt-0.5'>{state.status}</div>
              </div>
            </div>
            <TagDiv className='px-3 py-1 rounded-full text-xs font-medium'>{state.running ? '运行中' : state.installed ? '已停止' : '未安装'}</TagDiv>
          </div>
        </PrimaryDiv>

        {state.installed && (
          <div className='grid grid-cols-3 gap-2.5 xl:flex xl:flex-col xl:gap-2 xl:min-w-[180px]'>
            {!state.running ? (
              <Button className='py-2.5 rounded-xl text-sm font-medium' onClick={() => sendAction('start', '启动')} disabled={isDisabled}>
                ▶ 启动
              </Button>
            ) : (
              <Button className='py-2.5 rounded-xl text-sm font-medium' onClick={() => sendAction('stop', '停止')} disabled={isDisabled}>
                ■ 停止
              </Button>
            )}
            <Button className='py-2.5 rounded-xl text-sm font-medium' onClick={() => sendAction('restart', '重启')} disabled={isDisabled || !state.running}>
              ↻ 重启
            </Button>
            <Dropdown
              placement='bottomRight'
              buttons={[
                { children: '更新', onClick: () => sendAction('update', '更新'), disabled: isDisabled },
                { children: '强制更新', onClick: () => sendAction('force_update', '强制更新'), disabled: isDisabled },
                { children: '重装依赖', onClick: () => sendAction('install_deps', '安装依赖'), disabled: isDisabled },
                {
                  children: `清理日志${state.logCount > 0 ? ` (${state.logCount})` : ''}`,
                  onClick: () => sendAction('clean_logs', '清理日志'),
                  disabled: isDisabled
                },
                { children: '卸载 Yunzai', onClick: () => dangerAction('uninstall', '卸载 Yunzai'), disabled: isDisabled, className: 'text-red-400' }
              ]}
            >
              <Button className='w-full py-2.5 rounded-xl text-sm font-medium' disabled={isDisabled}>
                更多 ▾
              </Button>
            </Dropdown>
          </div>
        )}
      </div>

      {/* ── 操作区 ── */}
      {!state.installed ? (
        <Button
          className='w-full py-3.5 rounded-xl text-sm font-semibold shadow-sm'
          onClick={() => sendAction('install', '安装 Yunzai')}
          disabled={isDisabled}
          style={{ background: 'linear-gradient(135deg, #d5c8b2 0%, #8f8c76 100%)' }}
        >
          安装 Yunzai
        </Button>
      ) : (
        <div className='xl:grid xl:grid-cols-2 xl:gap-5 space-y-4 xl:space-y-0'>
          {/* ── 插件安装 ── */}
          <PrimaryDiv className='rounded-xl p-5 space-y-3 card-hover'>
            <div className='text-sm font-semibold opacity-75'>📦 安装插件</div>
            <div className='flex gap-2'>
              <Select
                value={pluginSource}
                onChange={e => setPluginSource((e.target as HTMLSelectElement).value as 'alias' | 'url')}
                className='w-20 px-2 py-1.5 text-xs rounded-xl'
              >
                <option value='alias'>别名</option>
                <option value='url'>URL</option>
              </Select>
              <Input
                type='text'
                value={pluginInput}
                onChange={e => setPluginInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleInstallPlugin()}
                placeholder={pluginSource === 'alias' ? 'miao / starrail / zzz ...' : 'https://github.com/xxx/plugin.git'}
                className='flex-1 px-3 py-1.5 text-sm rounded-xl'
              />
              <Button className='px-4 py-1.5 rounded-xl text-sm font-medium' onClick={handleInstallPlugin} disabled={isDisabled || !pluginInput.trim()}>
                安装
              </Button>
            </div>
          </PrimaryDiv>

          {/* ── 已安装插件 ── */}
          {state.plugins.length > 0 && (
            <PrimaryDiv className='rounded-xl overflow-hidden card-hover xl:max-h-[400px] xl:overflow-y-auto'>
              <div className='px-5 py-3.5 text-sm font-semibold opacity-75'>🔌 已安装插件 ({state.plugins.length})</div>
              <div className='divide-y divide-gray-200/10'>
                {state.plugins.map(p => (
                  <div key={p.name} className='flex items-center justify-between px-5 py-3 row-hover'>
                    <span className='text-sm'>{p.name}</span>
                    <Dropdown
                      placement='bottomRight'
                      buttons={[
                        { children: '更新', onClick: () => sendAction('update_plugin', `更新 ${p.name}`, { plugin: p.name }), disabled: isDisabled },
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
                      <Button className='px-2.5 py-1 text-xs rounded-lg'>···</Button>
                    </Dropdown>
                  </div>
                ))}
              </div>
            </PrimaryDiv>
          )}
        </div>
      )}

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
