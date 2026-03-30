# 阿柠檬-加载Yunzai

将 Miao-Yunzai 作为 AlemonJS 插件包加载。

- **完全隔离** — Worker 以 `child_process.fork()` 启动，独立 V8 堆、CWD、全局变量
- **IPC 通信** — 父子进程通过 Node.js 内置 IPC 通道收发结构化消息
- **内置 yarn** — 依赖安装使用内置的 Yarn 1.x，原生支持 `workspaces`

## 管理指令

所有管理指令⚠️`仅限主人使用`，前缀支持 `#yz` 或 `#云崽`,使用`#yz帮助`了解基本使用

- 安装一般操作步骤

`#yz安装` -> `#yz安装miao` -> `#yz安装依赖` -> `#yz启动/#yz重启`

## 安装方式1: Git

### alemongo/alemondesk

- 地址

```sh
https://github.com/xiuxianjs/alemonjs-load-yunzai.git
```

若访问受限，可使用如下加速地址

```sh
https://ghfast.top/https://github.com/xiuxianjs/alemonjs-load-yunzai.git
```

- branch

```sh
release
```

### 本地

```sh
git clone -b release --depth=1 https://github.com/xiuxianjs/alemonjs-load-yunzai.git ./packages/alemonjs-load-yunzai
```

```sh
yarn install #开始模块化
```

- alemon.config.yaml

```yaml
apps:
  alemonjs-load-yunzai: true # 启动扩展
```

## 安装方式2: npm

```sh
yarn add alemonjs-load-yunzai -W
```

- alemon.config.yaml

```yaml
apps:
  alemonjs-load-yunzai: true # 启动扩展
```

## 免责声明

- 勿用于以盈利为目的的场景

- 代码开放，无需征得特殊同意，可任意使用。能备注来源最好，但不强求

- 图片与其他素材均来自于网络，仅供交流学习使用，如有侵权请联系，会立即删除
