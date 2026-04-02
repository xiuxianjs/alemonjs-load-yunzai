import { Button, PrimaryDiv, SecondaryDiv } from '@alemonjs/react-ui';
import { useState } from 'react';
import From from './From';
import Manage from './Manage';

type Tab = 'config' | 'manage';

export default function App() {
  const [tab, setTab] = useState<Tab>('manage');

  return (
    <SecondaryDiv className='flex items-center justify-center p-8'>
      <PrimaryDiv className='rounded-lg shadow-inner w-full p-8'>
        <div className='flex justify-center text-3xl mb-4'>Yunzai 管理</div>
        <div className='flex gap-2 mb-4'>
          <Button
            className={`flex-1 p-2 rounded-md transition duration-200 ${tab === 'manage' ? 'opacity-100' : 'opacity-50'}`}
            onClick={() => setTab('manage')}
          >
            管理
          </Button>
          <Button
            className={`flex-1 p-2 rounded-md transition duration-200 ${tab === 'config' ? 'opacity-100' : 'opacity-50'}`}
            onClick={() => setTab('config')}
          >
            配置
          </Button>
        </div>
        {tab === 'config' ? <From /> : <Manage />}
      </PrimaryDiv>
    </SecondaryDiv>
  );
}
