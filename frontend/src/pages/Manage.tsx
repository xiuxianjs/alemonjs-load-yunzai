import { Button, Input, Select } from '@alemonjs/react-ui';
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

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 5000);
  };

  useEffect(() => {
    if (!window.API) {
      return;
    }

    const handler = (data: any) => {
      if (data.type === 'yunzai.status') {
        setState(data.data);
      } else if (data.type === 'yunzai.result') {
        setLoading('');
        showMessage(data.data?.message ?? '操作完成');
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

  const handleInstallPlugin = () => {
    const val = pluginInput.trim();

    if (!val) {
      return;
    }

    sendAction('install_plugin', `安装插件 ${val}`, { plugin: val });
    setPluginInput('');
  };

  const isDisabled = !!loading || state.busy;

  return (
    <div className='py-4 space-y-4'>
      {/* ── 状态栏 ── */}
      <div className='flex items-center justify-between'>
        <span className='text-sm font-medium text-gray-700'>状态</span>
        <span className='text-sm font-semibold'>{state.status}</span>
      </div>

      {/* 提示消息 */}
      {message && <div className='text-sm text-center p-2 rounded-md bg-opacity-20'>{message}</div>}

      {/* 加载/任务进行中提示 */}
      {(loading || state.busy) && (
        <div className='text-sm text-center p-2 animate-pulse'>
          正在{loading || state.busyTask}...
          {state.busy && (
            <Button className='ml-2 px-2 py-1 text-xs rounded-md' onClick={() => sendAction('cancel', '取消')}>
              取消
            </Button>
          )}
        </div>
      )}

      {/* ── 基础操作 ── */}
      <div className='text-sm font-semibold text-gray-500 pt-2'>基础操作</div>
      <div className='space-y-2'>
        {!state.installed ? (
          <Button className='w-full p-2 rounded-md transition duration-200' onClick={() => sendAction('install', '安装 Yunzai')} disabled={isDisabled}>
            安装 Yunzai
          </Button>
        ) : (
          <>
            <div className='flex gap-2'>
              {!state.running ? (
                <Button className='flex-1 p-2 rounded-md transition duration-200' onClick={() => sendAction('start', '启动')} disabled={isDisabled}>
                  启动
                </Button>
              ) : (
                <Button className='flex-1 p-2 rounded-md transition duration-200' onClick={() => sendAction('stop', '停止')} disabled={isDisabled}>
                  停止
                </Button>
              )}
              <Button
                className='flex-1 p-2 rounded-md transition duration-200'
                onClick={() => sendAction('restart', '重启')}
                disabled={isDisabled || !state.running}
              >
                重启
              </Button>
            </div>

            <div className='flex gap-2'>
              <Button className='flex-1 p-2 rounded-md transition duration-200' onClick={() => sendAction('update', '更新')} disabled={isDisabled}>
                更新
              </Button>
              <Button className='flex-1 p-2 rounded-md transition duration-200' onClick={() => sendAction('force_update', '强制更新')} disabled={isDisabled}>
                强制更新
              </Button>
            </div>

            <Button className='w-full p-2 rounded-md transition duration-200' onClick={() => sendAction('install_deps', '安装依赖')} disabled={isDisabled}>
              重新安装依赖
            </Button>

            <div className='flex gap-2'>
              <Button className='flex-1 p-2 rounded-md transition duration-200' onClick={() => sendAction('clean_logs', '清理日志')} disabled={isDisabled}>
                清理日志{state.logCount > 0 ? ` (${state.logCount})` : ''}
              </Button>
              <Button className='flex-1 p-2 rounded-md transition duration-200' onClick={() => sendAction('uninstall', '卸载')} disabled={isDisabled}>
                卸载 Yunzai
              </Button>
            </div>
          </>
        )}
      </div>

      {/* ── 插件管理 ── */}
      {state.installed && (
        <>
          <div className='text-sm font-semibold text-gray-500 pt-2'>插件管理</div>

          {/* 安装插件 */}
          <div className='space-y-2'>
            <div className='flex gap-2'>
              <Select
                value={pluginSource}
                onChange={e => setPluginSource((e.target as HTMLSelectElement).value as 'alias' | 'url')}
                className='w-24 p-2 rounded-md border focus:outline-none text-sm'
              >
                <option value='alias'>别名</option>
                <option value='url'>仓库URL</option>
              </Select>
              <Input
                type='text'
                value={pluginInput}
                onChange={e => setPluginInput(e.target.value)}
                placeholder={pluginSource === 'alias' ? '例: miao, starrail, zzz' : 'https://github.com/xxx/plugin.git'}
                className='flex-1 p-2 border rounded-md focus:outline-none focus:ring text-sm'
              />
            </div>
            <Button className='w-full p-2 rounded-md transition duration-200' onClick={handleInstallPlugin} disabled={isDisabled || !pluginInput.trim()}>
              安装插件
            </Button>
          </div>

          {/* 已安装插件列表 */}
          {state.plugins.length > 0 && (
            <div>
              <div className='text-sm font-medium text-gray-700 mb-2'>已安装插件</div>
              <div className='space-y-1'>
                {state.plugins.map(p => (
                  <div key={p.name} className='flex items-center justify-between text-sm p-2 rounded-md'>
                    <span>{p.name}</span>
                    <div className='flex gap-1'>
                      <Button
                        className='px-2 py-1 text-xs rounded-md transition duration-200'
                        onClick={() => sendAction('update_plugin', `更新 ${p.name}`, { plugin: p.name })}
                        disabled={isDisabled}
                      >
                        更新
                      </Button>
                      <Button
                        className='px-2 py-1 text-xs rounded-md transition duration-200'
                        onClick={() => sendAction('force_update_plugin', `强制更新 ${p.name}`, { plugin: p.name })}
                        disabled={isDisabled}
                      >
                        强制更新
                      </Button>
                      <Button
                        className='px-2 py-1 text-xs rounded-md transition duration-200'
                        onClick={() => sendAction('uninstall_plugin', `卸载 ${p.name}`, { plugin: p.name })}
                        disabled={isDisabled}
                      >
                        卸载
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
