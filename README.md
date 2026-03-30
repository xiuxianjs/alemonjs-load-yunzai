# 阿柠檬-加载Yunzai

这是一个桥接层，通过进程隔离 + IPC 协议，将 Yunzai-Bot 生态无缝桥接到现代 AlemonJS 框架上，同时提供了完整的安装管理、插件管理和跨平台消息适配能力。设计上做到了与 Yunzai 运行时的完全解耦。

- 尽可能的兼容所有效果，因此版本需要 ⚠️ `alemonjs` >= v2.1.46

- 是OneBot优先的，确保最大程度上适用于所有Yunzai插件，其他平台适配情况则完全依赖于框架的通用模型

## 管理指令

所有管理指令⚠️`仅限主人使用`，前缀支持 `#yz` 或 `#云崽`,使用`#yz帮助`了解基本使用

- alemon.config.yaml 新增 uk

```yaml
# https://alemonjs.com/docs/config
# 可发指令后观察控制台 [UserKey:abcdefg] 后得到
# 不配置将无法正常获得主人权限
master_key:
  abcdefg: true
```

- 安装一般操作步骤

`#yz安装` -> `#yz安装miao` -> `#yz安装依赖` -> `#yz启动/#yz重启`

## 安装方式1: Git

### alemongo/alemondesk

- 地址

```sh
https://github.com/xiuxianjs/alemonjs-load-yunzai.git
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
