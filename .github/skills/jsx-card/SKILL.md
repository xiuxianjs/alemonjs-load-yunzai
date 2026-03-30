---
name: jsx-card
description: 'JSX 图片卡片渲染。USE FOR: 创建新的数据展示卡片、修改卡片样式布局、将纯文本响应转为图片卡片、jsxp 渲染配置、Tailwind 样式调整、HTML 包装器修改、游戏特定配色方案。DO NOT USE FOR: 米游社 API 调用逻辑、路由注册、数据处理。'
---

# JSX 图片卡片渲染

## 渲染流程

```
Response Handler → renderComponentIsHtmlToBuffer(Component, props)
  → jsxp 将 JSX 转为 HTML
  → Puppeteer 截图生成 PNG Buffer
  → Format.addImage(buffer)
  → message.send({ format })
```

## 文件结构

```
src/img/views/
├── HTML.tsx              # 通用 HTML 包装器 (字体、Tailwind、SCSS)
├── DailyNoteCard.tsx     # 体力/树脂卡片
├── PlayerIndexCard.tsx   # 角色面板卡片
├── SpiralAbyssCard.tsx   # 深渊卡片
├── WeaponCard.tsx        # 武器卡片
├── LedgerCard.tsx        # 札记卡片
├── RoleExploreCard.tsx   # 探索卡片
├── RoleCombatCard.tsx    # 剧诗卡片
├── BuddyCard.tsx         # 邦布卡片
├── MysNewsCard.tsx       # 公告/资讯卡片
├── QrLoginCard.tsx       # 扫码登录卡片
├── CkHelpCard.tsx        # Cookie 帮助卡片
└── MihoyoHelp.tsx        # 米游社帮助网格 (60+ 命令)
```

## 创建新卡片的步骤

### 1. 定义数据接口

```typescript
interface NewCardData {
  game: 'gs' | 'sr' | 'zzz';
  uid: string;
  // 具体数据字段...
}
```

### 2. 创建组件 (src/img/views/NewCard.tsx)

```tsx
import React from 'react';
import HTML from './HTML';

interface Props {
  data: NewCardData;
}

const GAME_COLORS: Record<string, string> = {
  gs: '#e8d5b0',
  sr: '#c5b4e3',
  zzz: '#b4e3c5'
};

export default function NewCard({ data }: Props) {
  const accentColor = GAME_COLORS[data.game] || GAME_COLORS.gs;

  return (
    <HTML>
      <div style={{ padding: '24px' }}>
        {/* 头部：金色渐变 */}
        <div style={{
          background: `linear-gradient(135deg, ${accentColor}, #d3bc8e)`,
          borderRadius: '12px 12px 0 0',
          padding: '16px 20px',
          color: '#4a3728'
        }}>
          <h2 style={{ margin: 0, fontSize: '20px' }}>标题</h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', opacity: 0.7 }}>
            UID: {data.uid}
          </p>
        </div>

        {/* 内容区：白色 */}
        <div style={{
          background: '#fff',
          borderRadius: '0 0 12px 12px',
          padding: '20px'
        }}>
          {/* 数据内容 */}
        </div>
      </div>
    </HTML>
  );
}
```

### 3. 在 Response Handler 中使用

```typescript
import { renderComponentIsHtmlToBuffer } from 'jsxp';
import NewCard from '@src/img/views/NewCard';

// 在 handler 中：
const img = await renderComponentIsHtmlToBuffer(NewCard, {
  data: { game, uid, ...apiData }
});

if (img) {
  const format = Format.create();
  format.addImage(img);
  void message.send({ format });
}
```

## 设计规范

### 布局

- **不设固定 width** — 由内容自然撑开
- **padding: 24px** — 卡片外边距
- **圆角: 12px** — 头部和底部
- **间距: 12-16px** — 内容区元素间距

### 配色

| 元素 | 色值 |
|------|------|
| 头部渐变 (GS) | `#e8d5b0 → #d3bc8e` |
| 头部渐变 (SR) | `#c5b4e3 → #a894d4` |
| 头部渐变 (ZZZ) | `#b4e3c5 → #8dd4a8` |
| 头部文字 | `#4a3728` |
| 内容背景 | `#ffffff` |
| 整体背景渐变 | `#f0ebe3 → #f5f6fb` |
| 次要文字 | `#888` / `opacity: 0.7` |

### 字体

- 数字专用字体: `font-family: 'tttgbnumber'` (由 HTML.tsx 自动加载)
- 正文字体: 系统默认

### 多游戏适配

使用 `data.game` 字段区分三款游戏，通过 `GAME_COLORS` map 选择配色。字段命名注意游戏差异：
- GS 角色: `name`, `level`, `element`
- SR 角色: `name`, `level`, `element`
- ZZZ 角色: `name_mi18n`, `level`, `element_type` (注意 ZZZ API 返回字段不同)

## HTML 包装器 (HTML.tsx)

所有卡片必须包裹在 `<HTML>` 组件中：

```tsx
<HTML className="可选额外className">
  <div>卡片内容</div>
</HTML>
```

HTML.tsx 提供：
- `input.scss` 全局样式 (含 Tailwind)
- `tttgbnumber.ttf` 字体 @font-face
- `<html>` + `<body>` 标准结构

## jsxp 配置 (jsxp.config.tsx)

```typescript
defineConfig({
  routes: {
    '/route-name': { component: <ComponentName /> }
  }
})
```

预览模式: `yarn view` — 在浏览器中查看卡片渲染效果
