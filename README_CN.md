![NPM Version](https://img.shields.io/npm/v/%40desktalk%2Fcore)


# DeskTalk

一个运行在浏览器中的 AI 原生桌面环境。

<!-- demo video -->
<!-- ![DeskTalk Demo](link-to-demo-video) -->

## 这是什么？

DeskTalk 是一个从零开始为 AI 设计操作系统的实验。它不是把 AI 生硬地附加到传统应用上，而是让系统中的每个部分都以原生方式与 AI 协作，同时依然对你完全可见并可直接使用。

<img width="3838" height="1634" alt="tail-based-desktop" src="https://github.com/user-attachments/assets/0d7daf0b-145b-4251-bea0-490a14a5d3d2" />


## 目标

### 完全由 AI 控制的系统

DeskTalk 是 AI 原生的，应用首先为 AI 而设计。你可以用自然语言或语音描述需求，AI 会替你操作窗口、调用动作、编辑内容，并编排整个桌面。每个应用都会暴露可供 AI 调用的动作，让整个系统都可以通过对话进行编程。

### 生成式应用

在 DeskTalk 中，你不需要安装大多数软件——你只需要生成它。告诉 AI 你需要什么，它就会创建一个 **LiveApp**：一个可直接在桌面运行的自包含交互式应用。LiveApp 可以被编辑、持久化保存，并在不同会话之间重新启动。无论是仪表盘、跟踪器、小工具还是可视化界面，都可以通过对话构建出来。

## 快速开始

从 npm 安装 DeskTalk：

```bash
npm install -g @desktalk/core
```

然后启动它：

```bash
desktalk start
```

就这么简单。打开浏览器即可进入。

你也可以自定义 host 和 port：

```bash
desktalk start --host 0.0.0.0 --port 8080
```

### Docker

从 GitHub Container Registry 拉取已发布镜像：

```bash
docker pull ghcr.io/vincentdchan/desktalk:latest
```

可用标签会随 GitHub release 一起发布：

- `latest`：稳定版本
- `<version>`：例如 `0.1.0`
- `alpha`：用于 `*-alpha.*` 版本
- `beta`：用于 `*-beta.*` 版本
- `next`：用于 `*-rc.*` 版本

然后使用持久化卷运行它，以保存 DeskTalk 的数据和配置：

```bash
docker run -p 3000:3000 \
  -v desktalk-data:/home/node/.local/share/desktalk \
  -v desktalk-config:/home/node/.config/desktalk \
  ghcr.io/vincentdchan/desktalk:latest
```

容器启动后，在浏览器中打开 `http://localhost:3000`。

挂载卷会在容器重启后继续保留 DeskTalk 状态：

- `desktalk-data`：存储 LiveApp、AI 会话、MiniApp 数据、用户文件和嵌入式数据库
- `desktalk-config`：存储 DeskTalk 配置和 AI 提供商凭据

如果你想在宿主机上使用不同端口：

```bash
docker run -p 3000:3000 \
  -v desktalk-data:/home/node/.local/share/desktalk \
  -v desktalk-config:/home/node/.config/desktalk \
  ghcr.io/vincentdchan/desktalk:latest
```

如果你想在本地构建镜像：

```bash
docker build -t desktalk .
```

<!-- getting started video -->
<!-- ![Getting Started](link-to-getting-started-video) -->

## LiveApps

LiveApp 是面向用户的核心概念。用户向 AI 提出需求——例如“帮我做一个项目跟踪器”或“显示我的磁盘使用图表”——AI 就会生成一个 LiveApp：一个出现在桌面上并可跨会话持久保存的自包含 HTML 应用。

LiveApp 可以：

- 通过 DeskTalk bridge 执行 shell 命令并读取系统状态
- 使用内置的 KV 和集合存储持久化数据
- 在你提出修改要求时由 AI 原地编辑
- 使用 DeskTalk 完整的 Web 组件库，构建风格一致且带主题的 UI

## 开发

关于开发环境搭建、构建命令、测试和发布说明，请参阅 [docs/development.md](./docs/development.md)。

## 贡献

非常欢迎各种贡献和建议！无论是 Bug 报告、功能想法，还是 Pull Request，都会帮助这个项目不断完善。欢迎随时提交 issue 或 PR，我们很期待听到你的想法。

## 许可证

MIT
