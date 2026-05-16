# Pi Cloud Agent

基于 [`@earendil-works/pi-coding-agent`](https://github.com/earendil-works/pi)、NestJS、MySQL、React、Ant Design 和 Ant Design X 构建的云端 Agent 脚手架。

## 已实现功能

- 两层后端架构：API 后端 + 沙箱服务。
- Pi RPC 进程运行在沙箱中，而非后端。
- 用户隔离的工作空间，以及用户隔离的 Pi 配置/技能文件夹。
- 基于 NestJS + TypeORM 实体 + MySQL DDL 的后端。
- 仅使用 Ant Design 和 Ant Design X 基础组件的 React 前端。
- Zinc 风格深色主题。
- 浏览器连接页面，支持检测 Playwright 扩展心跳、接收扩展令牌、优先使用用户浏览器模式，并将连接标记为仅新标签页模式。

## 快速开始

```bash
npm install
cp .env.example .env
mysql < database/schema.sql
npm run dev
```

打开 `http://localhost:5173`。

## 服务地址

- Web 前端：`http://localhost:5173`
- 后端 API：`http://localhost:3000/api`
- 沙箱服务：`http://localhost:3001`

## 说明

沙箱服务以 RPC 模式启动 Pi，并将 `cwd` 设置为该用户的工作空间，`PI_CODING_AGENT_DIR` 设置为该用户的私有 Pi 文件夹。这一机制确保 Pi 的文件操作、Shell 操作、会话和技能与 API 后端解耦，并按用户隔离。
