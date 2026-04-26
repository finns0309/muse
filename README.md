# muse

`muse` 不是“又一个网易云播放器”。

它是一个本地音乐 runtime：负责拿音乐数据、维护 library、生成队列、控制播放，并把准确的播放状态交给真正需要展示的界面。

对这个项目来说，传统意义上的“播放器 UI”并不是中心。工作时听歌的真实路径通常很短：

```text
Command-Tab 到 muse
Command-K
搜一首歌 / 切一个模式 / 跳到 library
Command-Tab 回到工作界面
```

`muse` 服务的是这个瞬间。

它不试图成为你一直盯着看的地方。它更像一个“听歌调度器”。

## 定位

大多数音乐软件把很多职责塞进同一个 app：

- 音乐数据源
- 播放内核
- library
- 推荐和发现
- 播放器 chrome
- 歌词
- 社交和内容运营

`muse` 和 `echo` 把这些职责拆开。

`muse` 负责后台能力：

- 登录网易云
- 镜像“我喜欢”的歌曲库
- 提供快速的 command palette
- 用不同 mode 从 library 里取歌
- 持有真正的 `<audio>` 元素
- 对外发布准确的 now-playing 状态

`echo` 负责可见的听歌界面：

- 始终悬浮在桌面上
- 展示歌词和翻译歌词
- 用专辑封面生成氛围
- 替代传统播放器里真正值得被看见的那一部分

关系大概是这样：

```text
网易云音乐数据
      |
      v
    muse
library / modes / audio / currentTime
      |
      |  GET http://127.0.0.1:10755/now
      v
echo
歌词 / 氛围 / 桌面可视层
```

一句话：

`muse` 不是听歌的地方，而是听歌这件事的调度器。

`echo` 才是音乐愿意留在屏幕上的样子。

## 为什么存在

网易云 Mac 客户端作为音乐数据源是有价值的，但作为工作时的听歌界面太重了。

很多功能在真实使用里几乎不会碰。听歌时真正高频的动作是：

- 想换一首歌
- 想换一种听法
- 想从自己的收藏里重新抽一批歌
- 偶尔想搜一首歌立刻播放
- 想看歌词，但不想打开完整播放器

所以 `muse` 不把目标放在“做一个更极简的网易云客户端”上，而是只保留工作流里需要的部分：library、取数方式、播放控制和稳定状态源。

网易云提供音乐数据，`muse` 提供本地可控的播放 runtime，`echo` 提供真正的视觉界面。

## 核心概念

### Library

`muse` 的 library 是用户网易云“我喜欢”歌单的本地镜像。

第一次启动时，`muse` 会通过二维码登录网易云，拉取“我喜欢”，规范化歌曲结构，并在本地保存一些轻量播放元数据：

- `addedAt`
- `lastPlayedAt`
- `playCount`

网易云仍然是红心歌曲的源头。本地元数据只用来让 mode 更懂你的听歌习惯，不把 library 变成泛泛的播放历史。

### Modes

mode 是队列生成器。

它接收当前 library、播放器状态和时间，然后返回一个 queue。mode 不直接修改全局状态。

当前已有的 mode：

- `all`：打乱整个 library
- `daily`：按最近收听和播放次数生成今日混合
- `dig up`：挖出很久没听或从没听过的歌
- `discover`：网易云每日推荐
- `immersive`：围绕当前歌曲的主歌手深听一段时间
- `similar`：从当前歌曲延展相似歌曲
- `single`：循环当前歌曲

新增 mode 通常只需要在 `renderer/modes/` 下新增一个文件，再注册到 `renderer/modes/index.js`。

### Command Palette

Command palette 是 `muse` 的主界面。

它负责：

- 切 tab
- 切 mode
- 切浅色/深色外观与 accent
- 搜网易云歌曲
- 从搜索结果开启相似歌曲电台

`muse` 的窗口本质上是这个 palette 的容器。它应该让用户快速进入、快速完成动作、快速离开。

常用快捷键：

- `Command-K`：打开 command palette
- `Command-Shift-Space`：直接呼出 command surface
- `Command-→`：下一首
- `Command-←`：上一首
- `Space`：播放 / 暂停（在 cmdk 输入框中无效）
- `Command-P`：播放 / 暂停（任何位置都生效，包括 cmdk）

### Now-Playing State

`muse` 持有真正的 audio 元素，所以它能提供比官方 Now Playing 更可靠的状态：

- 精确的网易云 `songId`
- 专辑封面
- 歌曲时长
- 当前播放进度
- 播放 / 暂停状态

这些状态通过一个很小的本地 HTTP 接口暴露：

```text
GET http://127.0.0.1:10755/now
```

协议文档在 [`./NOW_PLAYING.md`](./NOW_PLAYING.md)。

这也是 `muse` 和 `echo` 之间最重要的连接点。官方网易云客户端发给 macOS Now Playing 的信息不够稳定，尤其是播放进度和事件频率。`echo` 可以退回到 `nowplaying-cli`，但只要 `muse` 在运行，就优先信任 `muse`。

## 和 echo 的关系

`echo` 可以独立运行。

独立运行时，它会通过 `nowplaying-cli` 读取当前播放的歌名和歌手，再用网易云公开接口搜索歌曲、拉歌词、用本地时钟滚动。

这个 fallback 有用，但不完美：

- 官方 Now Playing 事件太少
- elapsed time 可能卡住或缺失
- 用歌名和歌手模糊搜索容易匹配到错误版本

当 `muse` 运行时，`echo` 会先请求 `muse` 的 `/now`。因为 `muse` 自己就在播放音乐，所以它能直接给出准确的 `songId` 和 `currentTime`。这样 `echo` 就不用猜歌，也不用猜进度。

两个项目保持分离是刻意的：

- `muse` 可以保持小、快、偏后台
- `echo` 可以变得更视觉、更有氛围
- 两者通过公开的本地协议连接，而不是互相偷内部状态

## 运行

```bash
git clone git@github.com:finns0309/muse.git
cd muse
npm install
npm start
```

第一次启动需要用网易云音乐手机 App 扫二维码登录。

启动后，`muse` 会开启两个本地服务：

- `127.0.0.1:10754`：本地网易云 API wrapper
- `127.0.0.1:10755`：给 `echo` 使用的 now-playing endpoint

如果已经有另一个 `muse` 实例在提供 `/now`，新实例会弹窗提示并退出，避免端口冲突。

## 代码地图

```text
main.js
  启动本地网易云 API server
  启动 /now endpoint
  持久化 cookie 和 JSON store

renderer/app.js
  启动 prefs、auth、views、library sync 和全局快捷键

renderer/auth.js
  二维码登录和 cookie 失效后的重新登录

renderer/api.js
  本地网易云 API 的轻量封装

renderer/player.js
  持有唯一的 Audio 元素，并把播放状态推给 main

renderer/lib/library.js
  镜像“我喜欢”，记录本地播放元数据

renderer/radio.js
  渲染 mode cards，激活 queue builders

renderer/cmdk.js
  command palette：导航、mode、外观、歌曲搜索

renderer/library.js
  可过滤的红心歌曲列表

renderer/store.js
  小型 pub/sub store，带 selector 和 async race guard
```

## 设计原则

`muse` 应该越来越像一个 runtime，而不是越来越像传统播放器。

好的改动通常会让这些事情更快或更稳：

- 找一首歌
- 切一种听法
- 生成更好的队列
- 维护更有用的 library 元数据
- 向 `echo` 发布更准确的播放状态

需要谨慎的改动通常是：

- 增加常驻的大播放器界面
- 增加复杂的播放页 chrome
- 把 `echo` 应该承担的视觉表达塞回 `muse`
- 复制完整音乐客户端的导航结构

`muse` 的目标不是让用户停留，而是让用户完成一次听歌决策，然后回到正在做的事情。

## 相关文档

- [echo](https://github.com/finns0309/echo) —— 配套的悬浮歌词 / 视觉层
- [`./NOW_PLAYING.md`](./NOW_PLAYING.md) —— 两个项目之间的 /now 协议
