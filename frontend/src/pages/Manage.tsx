import { Button, Collapse, Modal, NotificationDiv, PrimaryDiv, TagDiv } from '@alemonjs/react-ui';
import { useEffect, useState } from 'react';
import { SmartDropdown } from './SmartDropdown';

type ColorKey = 'green' | 'blue' | 'orange' | 'red';

const COLOR_MAP: Record<ColorKey, { text: string; bg: string; border: string }> = {
  green: { text: 'text-green-600', bg: 'bg-green-500/10', border: 'border-green-500/40' },
  blue: { text: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/40' },
  orange: { text: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/40' },
  red: { text: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/40' }
};

function CmdRow({ cmd, desc, color }: { cmd: string; desc: string; color: ColorKey }) {
  const c = COLOR_MAP[color];

  return (
    <div className={`flex items-center gap-2.5 rounded-lg py-1.5 px-2.5 border-l-[3px] ${c.bg} ${c.border}`}>
      <span className={`text-[11px] font-bold min-w-[90px] ${c.text}`}>{cmd}</span>
      <span className='text-[11px] opacity-50'>{desc}</span>
    </div>
  );
}

interface HelpData {
  installFlow: { step: string; label: string; cmd: string; desc: string }[];
  controls: { cmd: string; desc: string; color: ColorKey }[];
  tools: { cmd: string; desc: string; color: ColorKey }[];
}

interface ManagerState {
  status: string;
  installed: boolean;
  running: boolean;
  busy: boolean;
  busyTask: string;
  logCount: number;
}

export default function Manage() {
  const [state, setState] = useState<ManagerState>({
    status: '获取中...',
    installed: false,
    running: false,
    busy: false,
    busyTask: '',
    logCount: 0
  });
  const [loading, setLoading] = useState('');
  const [message, setMessage] = useState('');
  const [helpData, setHelpData] = useState<HelpData | null>(null);
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
        const d = data.data as ManagerState & { help?: HelpData };

        setState(d);
        if (d.help) {
          setHelpData(d.help);
        }
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

  const isDisabled = !!loading || state.busy;

  return (
    <div className='py-2 space-y-3'>
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

      {/* ── 状态卡片 + 操作 ── */}
      <div className={`space-y-3 ${state.installed ? 'xl:flex xl:gap-4 xl:space-y-0 xl:items-start' : ''}`}>
        <PrimaryDiv className='rounded-xl p-4 card-hover xl:flex-1'>
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
          <div className='grid grid-cols-2 gap-2.5 xl:flex xl:flex-col xl:gap-2 xl:min-w-[180px]'>
            <SmartDropdown
              buttons={[
                { children: '更新', onClick: () => sendAction('update', '更新'), disabled: isDisabled },
                { children: '强制更新', onClick: () => sendAction('force_update', '强制更新'), disabled: isDisabled },
                { children: '重装依赖', onClick: () => sendAction('install_deps', '安装依赖'), disabled: isDisabled }
              ]}
            >
              <Button className='w-full py-2.5 rounded-xl text-sm font-medium' disabled={isDisabled}>
                更新 ▾
              </Button>
            </SmartDropdown>
            <SmartDropdown
              buttons={[
                {
                  children: `清理日志${state.logCount > 0 ? ` (${state.logCount})` : ''}`,
                  onClick: () => sendAction('clean_logs', '清理日志'),
                  disabled: isDisabled
                },
                { children: '卸载 Yunzai', onClick: () => dangerAction('uninstall', '卸载 Yunzai'), disabled: isDisabled, className: 'text-red-400' }
              ]}
            >
              <Button className='w-full py-2.5 rounded-xl text-sm font-medium' disabled={isDisabled}>
                维护 ▾
              </Button>
            </SmartDropdown>
          </div>
        )}
      </div>

      {/* ── 操作区 ── */}
      {!state.installed && (
        <Button
          className='w-full py-3.5 rounded-xl text-sm font-semibold shadow-sm'
          onClick={() => sendAction('install', '安装 Yunzai')}
          disabled={isDisabled}
          style={{ background: 'linear-gradient(135deg, #d5c8b2 0%, #8f8c76 100%)' }}
        >
          安装 Yunzai
        </Button>
      )}

      {/* ── 帮助 ── */}
      {helpData && (
        <Collapse
          items={[
            {
              key: 'help',
              label: '📖 管理帮助 · 指令参考',
              children: (
                <PrimaryDiv className='rounded-b-xl px-4 py-3 space-y-3'>
                  {/* 安装流程 */}
                  <div>
                    <div className='text-[12px] font-semibold opacity-60 mb-2'>首次安装流程</div>
                    <div className='grid grid-cols-4 gap-2'>
                      {helpData.installFlow.map(s => (
                        <div key={s.step} className='rounded-lg p-2 text-center' style={{ background: 'rgba(128,128,128,.05)' }}>
                          <div className='text-base font-bold opacity-40 mb-1'>{s.step}</div>
                          <div className='text-[11px] font-semibold opacity-70'>{s.label}</div>
                          <div className='text-[10px] font-mono opacity-50 mt-0.5'>{s.cmd}</div>
                        </div>
                      ))}
                    </div>
                    <div className='text-[10px] opacity-30 mt-1.5 text-center'>步骤②可重复执行安装多个插件</div>
                  </div>

                  {/* 进程控制 + 工具指令 */}
                  <div className='grid grid-cols-1 lg:grid-cols-2 gap-3'>
                    <div>
                      <div className='text-[12px] font-semibold opacity-60 mb-2'>进程控制</div>
                      <div className='flex flex-col gap-1.5'>
                        {helpData.controls.map(c => (
                          <CmdRow key={c.cmd} {...c} />
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className='text-[12px] font-semibold opacity-60 mb-2'>工具指令</div>
                      <div className='flex flex-col gap-1.5'>
                        {helpData.tools.map(t => (
                          <CmdRow key={t.cmd} {...t} />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className='text-[10px] opacity-30 text-center'>💡 前缀支持 # ! / · 可用 #yz 或 #云崽</div>
                </PrimaryDiv>
              )
            }
          ]}
        />
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
