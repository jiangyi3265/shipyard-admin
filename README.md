# 船厂工程管理 · PC 管理后台

## 项目简介

面向船厂工程现场的业务管理后台，基于 RuoYi-Vue3 扩展。管理人员可在电脑端维护船舶工程、工作区域和人员，处理用工审批、报销签字、安全罚款、工资结算与收支台账。

本仓库是 **Vue 3 + JavaScript 的 PC 前端**。PC 后台、微信小程序和 H5 共用配套若依后端与数据库；审批结果、人员状态、工资记录和消息已读状态均通过后端接口同步。前端不独立记账，也不直接连接数据库。

## 关联仓库

| 项目 | 说明 | GitHub |
| --- | --- | --- |
| shipyard-backend | 后端服务 | [shipyard-backend](https://github.com/jiangyi3265/shipyard-backend) |
| shipyard-admin | 管理后台 | [shipyard-admin](https://github.com/jiangyi3265/shipyard-admin) |
| shipyard-app | 小程序与H5 | [shipyard-app](https://github.com/jiangyi3265/shipyard-app) |

## 业务功能

| 模块 | 已实现内容 |
| --- | --- |
| 工作台 | 按权限展示待办申请、工程经营数据与快捷入口 |
| 工程与人员 | 船号、工程、区域、面积、价格、人员时薪维护；人员停用与恢复 |
| 申请与审批 | 包工、点工、加班、报销和罚款申请；凭证上传、详情、退回重提、审批历史与手写签字 |
| 每日出勤 | 按工程、区域和日期查看人员出勤、工时并导出 |
| 工资结算 | 按工程和月份查看工资分项，选择明细结算，区分已结算和待结算 |
| 收支台账 | 手工登记其他收支，查看业务生成的流水、累计余额和月度收支，导出 CSV |
| 完工归档 | 按月查看近三个月的完工区域，按区域定位相关业务单据 |
| 账号权限 | 多角色与工程授权、账号启停、角色权限配置、微信注册审核与已有账号关联 |
| 消息 | 查看审批与处理进度、跳转单据、单条及全部已读 |

角色包括管理员、组长、项目经理、负责人、会计和安全员。菜单与按钮根据后端授权展示；数据范围和业务操作最终由后端校验。组长查询本人工作，管理角色的可见范围由配套后端权限规则决定。

工资预览采用逐人按分舍入后汇总；包工按人员分配金额，提交时校验分配合计。实际工资快照、审批状态和结算金额以后端返回为准。修改单据会携带版本信息，写操作使用请求标识，以配合后端处理并发与重复提交。

## 技术栈

以 `package.json` 和 `package-lock.json` 为准：

- Vue 3.5、JavaScript、Composition API、单文件组件与 `<script setup>`。
- Vite 6、Vue Router 4、Pinia 3。
- Element Plus 2 与 Element Plus Icons。
- Axios 及 Fetch：若依通用接口使用 Axios，船厂业务接口由 `src/api/shipyard.js` 统一封装。
- ECharts 5、Sass、自动导入与 SVG 图标插件。
- Node.js 脚本和 Playwright 浏览器回归；Playwright 需单独安装或通过环境变量指定已有运行时。

这是 JavaScript 工程，不是 TypeScript 版本。后端技术栈、数据库初始化与微信平台配置请查看对应仓库。

## 快速启动

准备 Node.js 20.19+ 或 22.x、npm，以及已初始化船厂业务数据的配套后端。开发代理默认指向 `http://127.0.0.1:8083`。

```bash
git clone https://github.com/jiangyi3265/shipyard-admin.git
cd shipyard-admin
npm ci
cp .env.development.example .env.development
npm run dev
```

Windows PowerShell 将复制命令替换为：

```powershell
Copy-Item .env.development.example .env.development
npm run dev
```

浏览器访问 `http://127.0.0.1:5180`。登录需要你自己的后端账号、权限与验证码；仓库不提供线上账号或默认业务密码。若端口已被占用，Vite 会退出，不会自动切换端口。

开发时的请求路径：

```text
浏览器 /dev-api/login          -> 开发代理 -> 后端 /login
浏览器 /dev-api/shipyard/...   -> 开发代理 -> 后端 /shipyard/...
```

修改代理目标或开发端口，使用 **Shell 环境变量**，因为 `vite.config.js` 从 `process.env` 读取这两项：

```powershell
$env:SHIPYARD_API_TARGET = 'http://127.0.0.1:8083'
$env:SHIPYARD_ADMIN_PORT = '5180'
npm run dev
```

macOS / Linux：

```bash
SHIPYARD_API_TARGET=http://127.0.0.1:8083 SHIPYARD_ADMIN_PORT=5180 npm run dev
```

不要把 `SHIPYARD_API_TARGET` 仅写入 `.env.development` 后期待它改变代理。浏览器的接口前缀则由该文件内的 `VITE_APP_BASE_API` 决定。

## 环境与构建

实际 `.env` 文件不提交。首次使用时复制对应模板，并按你的部署位置修改公开配置：

| 模板 | 复制目标 | 用途 |
| --- | --- | --- |
| `.env.development.example` | `.env.development` | 开发服务器，接口前缀 `/dev-api` |
| `.env.production.example` | `.env.production` | 生产构建，默认部署在 `/admin/`，接口前缀 `/api` |
| `.env.staging.example` | `.env.staging` | 独立测试环境构建 |
| `.env.test.example` | 本地测试环境变量 | 说明集成脚本所需变量，不含凭据 |

关键配置：

| 变量 | 含义 |
| --- | --- |
| `VITE_APP_TITLE` | 页面标题 |
| `VITE_APP_ENV` | 构建环境标记 |
| `VITE_APP_BASE_API` | 浏览器请求的接口前缀 |
| `VITE_APP_BASE_PATH` | 站点根路径，例如 `/` 或 `/admin/` |
| `VITE_BUILD_COMPRESS` | 静态资源压缩配置，例如 `gzip` |

`VITE_` 变量会进入浏览器产物，只能保存公开配置。数据库密码、服务器密码、微信 AppSecret、私钥和管理 Token 应保留在后端或本地秘密配置中。

```bash
# 先复制 .env.production.example 为 .env.production
npm run build:prod

# 先复制 .env.staging.example 为 .env.staging
npm run build:stage

# 本地查看已构建静态产物
npm run preview -- --host 127.0.0.1 --port 4180
```

构建输出为 `dist/`。部署方需同时配置：

1. 将静态产物挂载到与 `VITE_APP_BASE_PATH` 一致的路径。
2. Vue Router 的页面刷新请求回退到对应的 `index.html`。
3. 将 `/api` 转发到配套后端，并按后端路由去除该前缀。
4. 如使用压缩文件，配置 Web 服务器读取构建生成的 gzip 资源。

`npm run build:prod` 只构建，不上传、不发布。`npm run preview` 也不能代替生产环境的 API 反向代理。本仓库没有自动部署工作流；`.github/FUNDING.yml` 是上游项目的赞助链接配置。

## 项目结构

```text
src/
├── api/shipyard.js             船厂接口、文件上传、请求标识与 CSV 导出
├── views/shipyard/
│   ├── index.vue              九个业务模块的工作区
│   ├── useShipyard.js          登录会话、工程范围、权限与数据刷新
│   └── components/            表单、详情、基础资料、账号、微信审核与签字
├── views/login.vue            登录与仅记住账号
├── views/system/              若依系统管理页面
├── views/monitor/             若依监控页面
├── router/                    路由定义与动态路由
├── store/                     Pinia 状态管理
├── utils/                     请求、权限、金额预览等工具
├── layout/                    若依后台布局
└── assets/                    样式与静态资源
scripts/                       浏览器与业务边界回归脚本
vite/                          Vite 插件配置
public/                        不经打包处理的公开资源
.env.*.example                 无凭据环境模板
vite.config.js                 构建、路径别名与开发代理
```

## 回归检查

浏览器脚本默认从本仓库解析 `playwright`。可在本地临时安装，或使用 `PLAYWRIGHT_MODULE` 指向已有模块：

```bash
npm install --no-save --package-lock=false playwright
npx playwright install chromium
```

三组纯 fixture 检查拦截接口，不需要真实业务账号。先启动开发服务器，然后在另一个终端执行：

```powershell
$env:PC_AUDIT_URL = 'http://127.0.0.1:5180'
$env:PC_AUDIT_API_PREFIX = '/dev-api'
node scripts/verify-pc-management-coverage.cjs
node scripts/verify-pc-finance-boundaries.cjs
node scripts/verify-login-remember.cjs
```

以下是仓库已有的真实联调命令。它们会创建数据、审批或结算，必须使用隔离测试后端、数据库和测试账号，不能指向正式业务环境：

```bash
npm run test:cross-client
npm run test:forms
npm run test:work-types
npm run test:session
```

运行前由本地环境注入 `SHIPYARD_TEST_PASSWORD`；未设置会直接失败，没有内置口令或私有文件回退。这些集成脚本保留了原联调环境的本机端口和预置业务数据约定：PC `5181`、H5 `5179`、测试 API `8081`、Redis `6383` 的 DB `1`。部分凭证、微信原生联调记录和工资跨端检查还引用相邻 `../船厂/` 工作区的演示资源；单独克隆本仓库时需准备相应测试夹具并核对路径，不应将这些命令视为开箱即用的生产验收。

截图、下载文件、日志和测试报告写入 `artifacts/`，均不提交。公开仓库中的 fixture 名称与无效 Token 仅用于拦截式测试，不是可登录的真实凭据。

## 登录与凭据处理

“记住账号”只保存账号名和勾选状态，不保存密码。进入登录页时会清理旧版本的 `password` Cookie；再次登录需输入密码。用于历史兼容的 RSA 工具不再内置公私钥，调用者必须显式传入所需参数，登录流程不再使用它持久化密码。

本地 `.env`、`.local/`、密钥、凭据 JSON、数据库导出、构建目录、测试产物与编辑器配置由 `.gitignore` 排除；依赖锁文件 `package-lock.json` 保留，以便使用 `npm ci` 重现依赖安装。

## 简历描述示例

> 基于 Vue 3、Element Plus、Pinia 与 Vite 开发船厂工程管理后台，对接若依权限体系，实现工程人员维护、包工/点工/加班申请、报销签字、罚款、工资结算及财务台账。通过统一接口与小程序、H5 同步业务状态，结合版本校验、请求标识和金额按分舍入处理并发更新与财务精度边界，并编写多角色、审批、结算和会话切换的浏览器回归脚本。

请按个人实际职责调整表述；这里不包含未经测量的性能或规模指标。

## 开源归属与许可

本项目基于 [RuoYi-Vue3](https://github.com/yangzongzhuan/RuoYi-Vue3) 二次开发，保留若依通用后台能力与原作者署名。原项目版权声明为 **Copyright (c) 2018 RuoYi**，详见本仓库 [LICENSE](./LICENSE)。本仓库沿用 MIT 许可；使用、修改和再分发时请保留原版权声明和许可文本。第三方依赖各自遵循其相应许可证。
