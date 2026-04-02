import { Button, Input, Select } from '@alemonjs/react-ui';
import React, { useEffect, useState } from 'react';

export default function Form() {
  const [formData, setFormData] = useState({
    // yunzai 命名空间
    master_key: '',
    master_id: '',
    // alemonjs-load-yunzai 命名空间
    gh_proxy: '',
    bot_name: '',
    yunzai_repo: '',
    miao_plugin_repo: '',
    log_level: 'info',
    autoFriend: '1',
    autoQuit: 50,
    disablePrivate: false,
    disableGuildMsg: true
  });

  useEffect(() => {
    if (!window.createDesktopAPI) {
      return;
    }
    const API = window.createDesktopAPI();

    window.API = API;

    API.postMessage({
      type: 'yunzai.init'
    });
    API.onMessage(data => {
      if (data.type === 'yunzai.init') {
        const db = data.data;

        setFormData({
          master_key: Array.isArray(db?.master_key) ? db.master_key.join(',') : (db?.master_key ?? ''),
          master_id: Array.isArray(db?.master_id) ? db.master_id.join(',') : (db?.master_id ?? ''),
          gh_proxy: db?.gh_proxy ?? '',
          bot_name: db?.bot_name ?? '',
          yunzai_repo: db?.yunzai_repo ?? '',
          miao_plugin_repo: db?.miao_plugin_repo ?? '',
          log_level: db?.log_level ?? 'info',
          autoFriend: String(db?.autoFriend ?? '1'),
          autoQuit: db?.autoQuit ?? 50,
          disablePrivate: db?.disablePrivate ?? false,
          disableGuildMsg: db?.disableGuildMsg ?? true
        });
      }
    });
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;

    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    window.API.postMessage({
      type: 'yunzai.form.save',
      data: formData
    });
  };

  return (
    <form onSubmit={handleSubmit} className='py-4 space-y-4'>
      {/* ── 主人配置 ── */}
      <div className='text-sm font-semibold text-gray-500 pt-2'>主人配置</div>
      <div>
        <label htmlFor='master_key' className='block text-sm font-medium text-gray-700'>
          Master Key
        </label>
        <Input
          type='text'
          id='master_key'
          name='master_key'
          value={formData.master_key}
          placeholder='key1,key2,key3'
          onChange={handleChange}
          className='mt-1 block w-full p-2 border rounded-md focus:outline-none focus:ring'
        />
      </div>
      <div>
        <label htmlFor='master_id' className='block text-sm font-medium text-gray-700'>
          主人 ID
        </label>
        <Input
          type='text'
          id='master_id'
          name='master_id'
          value={formData.master_id}
          placeholder='id1,id2,id3'
          onChange={handleChange}
          className='mt-1 block w-full p-2 border rounded-md focus:outline-none focus:ring'
        />
      </div>

      {/* ── 仓库配置 ── */}
      <div className='text-sm font-semibold text-gray-500 pt-2'>仓库配置</div>
      <div>
        <label htmlFor='gh_proxy' className='block text-sm font-medium text-gray-700'>
          GitHub 代理地址
        </label>
        <Input
          type='text'
          id='gh_proxy'
          name='gh_proxy'
          value={formData.gh_proxy}
          placeholder='https://ghfast.top/'
          onChange={handleChange}
          className='mt-1 block w-full p-2 border rounded-md focus:outline-none focus:ring'
        />
      </div>
      <div>
        <label htmlFor='bot_name' className='block text-sm font-medium text-gray-700'>
          Yunzai 目录名
        </label>
        <Input
          type='text'
          id='bot_name'
          name='bot_name'
          value={formData.bot_name}
          placeholder='Miao-Yunzai'
          onChange={handleChange}
          className='mt-1 block w-full p-2 border rounded-md focus:outline-none focus:ring'
        />
      </div>
      <div>
        <label htmlFor='yunzai_repo' className='block text-sm font-medium text-gray-700'>
          Yunzai 仓库地址
        </label>
        <Input
          type='text'
          id='yunzai_repo'
          name='yunzai_repo'
          value={formData.yunzai_repo}
          placeholder='https://github.com/yoimiya-kokomi/Miao-Yunzai.git'
          onChange={handleChange}
          className='mt-1 block w-full p-2 border rounded-md focus:outline-none focus:ring'
        />
      </div>
      <div>
        <label htmlFor='miao_plugin_repo' className='block text-sm font-medium text-gray-700'>
          Miao 插件仓库地址
        </label>
        <Input
          type='text'
          id='miao_plugin_repo'
          name='miao_plugin_repo'
          value={formData.miao_plugin_repo}
          placeholder='https://github.com/yoimiya-kokomi/miao-plugin.git'
          onChange={handleChange}
          className='mt-1 block w-full p-2 border rounded-md focus:outline-none focus:ring'
        />
      </div>

      {/* ── 运行配置 ── */}
      <div className='text-sm font-semibold text-gray-500 pt-2'>运行配置</div>
      <div>
        <label htmlFor='log_level' className='block text-sm font-medium text-gray-700'>
          日志等级
        </label>
        <Select
          id='log_level'
          name='log_level'
          value={formData.log_level}
          onChange={handleChange as any}
          className='mt-1 w-full p-2 rounded-md border focus:outline-none'
        >
          <option value='trace'>trace</option>
          <option value='debug'>debug</option>
          <option value='info'>info</option>
          <option value='warn'>warn</option>
          <option value='error'>error</option>
          <option value='mark'>mark</option>
          <option value='off'>off</option>
        </Select>
      </div>
      <div>
        <label htmlFor='autoFriend' className='block text-sm font-medium text-gray-700'>
          自动同意加好友
        </label>
        <Select
          id='autoFriend'
          name='autoFriend'
          value={formData.autoFriend}
          onChange={handleChange as any}
          className='mt-1 w-full p-2 rounded-md border focus:outline-none'
        >
          <option value='1'>同意</option>
          <option value='0'>不处理</option>
        </Select>
      </div>
      <div>
        <label htmlFor='autoQuit' className='block text-sm font-medium text-gray-700'>
          自动退群人数阈值
        </label>
        <Input
          type='number'
          id='autoQuit'
          name='autoQuit'
          min='0'
          value={formData.autoQuit}
          placeholder='50（0 则不处理）'
          onChange={handleChange}
          className='mt-1 block w-full p-2 border rounded-md focus:outline-none focus:ring'
        />
      </div>
      <div>
        <label className='inline-flex items-center'>
          <Input type='checkbox' id='disablePrivate' name='disablePrivate' checked={formData.disablePrivate} onChange={handleChange} className='mr-2' />
          禁用私聊功能
        </label>
      </div>
      <div>
        <label className='inline-flex items-center'>
          <Input type='checkbox' id='disableGuildMsg' name='disableGuildMsg' checked={formData.disableGuildMsg} onChange={handleChange} className='mr-2' />
          禁用频道消息
        </label>
      </div>
      <Button type='submit' className='w-full p-2 rounded-md transition duration-200'>
        保存
      </Button>
    </form>
  );
}
