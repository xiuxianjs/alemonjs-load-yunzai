---
name: mihoyo-api
description: '米游社 API 集成开发。USE FOR: 新增米游社 API 端点、修改 DS 签名逻辑、调试 retcode 错误、添加新游戏支持、Cookie/Stoken 管理、device_fp 指纹生成、API 请求头构建、区服映射、查询缓存策略。DO NOT USE FOR: JSX 卡片渲染、路由注册、前端样式。'
---

# 米游社 API 集成

## 文件结构

```
src/model/mihoyo/
├── mysApi.ts       # HTTP 客户端核心 (DS签名、headers、device_fp、fetch)
├── apiMap.ts       # API 端点映射表 (CN/OS × GS/SR/ZZZ)
├── region.ts       # UID → 区服/regionType 解析
├── query.ts        # 统一查询封装 (Cookie获取 + UID解析 + API调用 + retcode处理)
├── account.ts      # Cookie/UID 绑定管理 (Redis CRUD)
├── stoken.ts       # Stoken + 扫码登录
├── sign.ts         # 游戏/米游社签到
├── cookie.ts       # Cookie 解析工具
└── types.ts        # 类型定义 (MihoyoGame, MihoyoRegionType, etc.)
```

## 关键类型

```typescript
type MihoyoGame = 'gs' | 'sr' | 'zzz';
type MihoyoRegionType = 'cn' | 'global';
interface MihoyoRegionProfile {
  game: MihoyoGame;
  server: string;
  type: MihoyoRegionType;
}
```

## DS 签名机制

```
DS = "{timestamp},{random6位},{md5(salt=SALT&t=TIMESTAMP&r=RANDOM&b=BODY&q=QUERY)}"
```

- `q` = URL query string (不含 `?`)，GET 请求时有值
- `b` = JSON body string，POST 请求时有值
- CN Salt: `xV8v4Qu54lUKrEYFZkJhB8cuOh9Asafs`
- OS Salt: `okr4obncj8bw5a65hbnn5oo6ixjc3l9w`

## 请求头 (CN)

```
x-rpc-app_version: 2.40.1
x-rpc-client_type: 5
User-Agent: Mozilla/5.0 ... miHoYoBBS/2.40.1
Referer: https://webstatic.mihoyo.com/
DS: {签名}
Cookie: {用户cookie}
x-rpc-device_fp: {设备指纹}  (可选)
```

## device_fp 获取

POST `https://public-data-api.mihoyo.com/device-fp/api/getFp`

Body 必须包含: `seed_id`, `device_id`, `platform`, `seed_time`, `ext_fields`, `app_name`, `device_fp`

- CN: platform=1, app_name=bbs_cn, ext_fields 模拟 iOS
- OS: platform=2, app_name=bbs_oversea, ext_fields 模拟 Android
- 缓存 1 小时 in Redis (`data:alemonjs-mhy:device_fp:{uid}`)

## UID 区服映射 (region.ts)

| UID 前缀 | GS server | SR server          | 类型   |
| -------- | --------- | ------------------ | ------ |
| 1-4      | cn_gf01   | prod_gf_cn         | cn     |
| 5        | cn_qd01   | prod_qd_cn         | cn     |
| 6        | os_usa    | prod_official_usa  | global |
| 7        | os_euro   | prod_official_euro | global |
| 8/18     | os_asia   | prod_official_asia | global |
| 9        | os_cht    | prod_official_cht  | global |

ZZZ 使用不同的前缀映射（10/15/13/17 对应不同海外区服）。

## Retcode 常见错误

| retcode | 含义                   |
| ------- | ---------------------- |
| 0       | 成功                   |
| -100    | Cookie 已失效          |
| 10001   | Cookie 无效            |
| 10101   | 查询次数超限 (30次/天) |
| 10102   | 数据未公开             |
| 10103   | Cookie 无效            |
| 5003    | 接口数据异常           |
| 1008    | 账号已封禁             |

## 调试要点

- 日志格式: `[米游社接口][apiName][uid] message`
- 使用 `logger.info` 输出请求 URL 和 Headers 进行调试
- 对比 Miao-Yunzai (`/Miao-Yunzai/plugins/genshin/model/mys/`) 的实现进行排查
- Salt、DS、Version 三个游戏共用，不区分游戏
- 查询缓存 300 秒，仅 retcode===0 时写入
