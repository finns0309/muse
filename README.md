# muse

`muse` 不是“又一个网易云播放器”。

它是一个本地音乐 runtime，也是一块可召唤的音乐视觉 surface：登录网易云、镜像红心 library、生成播放队列、持有真正的 `<audio>` 元素，并在需要时用一个轻、快、漂亮的界面完成听歌决策。

对这个项目来说，传统意义上的常驻播放器 UI 不是中心。工作时听歌的真实路径通常很短：

```text
Option-Space 召唤 muse
看一眼封面、进度和氛围
搜一首歌 / 切一种 mode / 看一眼 queue
Esc / Command-Tab 回到工作界面
```

`muse` 服务的是这个瞬间。

它不试图成为你一直盯着看的地方。它更像一个短暂出现的听歌控制台：足够快，也足够值得看。

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

`muse` 负责可召唤的本地体验：

- 登录网易云
- 镜像“我喜欢”的歌曲库
- 提供快速的 command palette
- 从 library / playlist / 推荐接口生成 queue
- 持有唯一的 `<audio>` 元素
- 用封面、accent、ambient 和动效呈现当前音乐
- 向外发布准确的 now-playing 和 spectrum 状态

`echo` 负责常驻的桌面视觉层：

- 始终悬浮在桌面上
- 展示歌词和翻译歌词
- 用专辑封面生成氛围
- 消费 `muse` 提供的准确 songId、进度和音频频谱

关系大概是这样：

```text
网易云音乐数据
      |
      v
    muse
library / modes / queue / audio / command surface / spectrum
      |
      |  GET http://127.0.0.1:10755/now
      |  WS  ws://127.0.0.1:10755/spectrum
      v
echo
歌词 / 氛围 / 桌面可视层
```

一句话：

`muse` 是听歌决策发生的地方：一半是 runtime，一半是召唤出来的视觉仪式。

`echo` 则是音乐愿意长时间留在屏幕上的样子。

## 为什么存在

网易云 Mac 客户端作为音乐数据源是有价值的，但作为工作时的听歌界面太重了。

很多功能在真实使用里几乎不会碰。听歌时真正高频的动作是：

- 想换一首歌
- 想换一种听法
- 想从自己的收藏里重新抽一批歌
- 偶尔想搜一首歌立刻播放
- 想看歌词，但不想打开完整播放器

所以 `muse` 不把目标放在“做一个更极简的网易云客户端”上，而是保留工作流里真正需要的部分：library、取数方式、播放控制、稳定状态源，以及一个被召唤时让人愿意多看一眼的界面。

网易云提供音乐数据，`muse` 提供本地可控的播放 runtime 和瞬时视觉入口，`echo` 提供常驻的桌面视觉层。

## 核心概念

### Library

`muse` 的 library 是用户网易云“我喜欢”歌单的本地镜像。

第一次启动时，`muse` 会通过二维码登录网易云，拉取“我喜欢”，规范化歌曲结构，并在本地保存一些轻量播放元数据：

- `addedAt`
- `lastPlayedAt`
- `playCount`

网易云仍然是红心歌曲的源头。本地元数据只用来让 mode 更懂你的听歌习惯，不把 library 变成泛泛的播放历史。

通过搜索、discover、similar 或 playlist 临时播放到的歌，不会自动进入 library。想让一首歌进入 library，需要真正对它点红心；`muse` 会调用网易云 `/like` 并同步本地镜像。

### Queue

queue 是 `muse` 当前要播放的一组歌。

queue 可以来自：

- 一个 mode
- command palette 搜索结果
- `/queue` 里手动跳转
- `/pl <playlist id or url>` 加载的网易云歌单
- 从某首歌扩展出的 similar radio

播放器会自动跳过不可播歌曲。queue 播到末尾默认回到第一首；`single` mode 则使用单曲循环。

### Playback Session

`playbackSession` 跟踪当前队列的来源语义。它不是 queue 本身，而是对 "这批歌是怎么来的" 的描述：

- `mode`：用户选了一个 mode，队列由 mode.build() 生成
- `manual`：用户通过搜索手选了一首歌
- `radio`：用户从某首歌开启了 similar radio
- `playlist`：用户通过 `/pl` 加载了一个网易云歌单

session 的存在让几件事变得自然：
- 选歌时可以决定是打断当前 mode 还是在 mode 上下文里播放
- 队列快播完时可以按 session 类型自动续歌或停止
- immersive 模式的自动重建只在 session 仍然是 immersive 时触发

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

Command palette 是 `muse` 的主界面，也是它的 visual surface。

它负责：

- 搜本地 library 和网易云歌曲
- 切 mode
- 浏览当前 queue
- 浏览红心 library
- 加载和记住网易云 playlist
- 切浅色 / 深色外观
- 设置 accent
- 从任意歌曲开启 similar radio
- 对搜索结果或 queue item 点红心 / 取消红心

`muse` 的窗口本质上是这个 palette 的容器。它应该让用户快速进入、快速完成动作、快速离开；但在被召唤出来的几秒钟里，它也应该有自己的音乐气质。

### Visual Surface

`muse` 有意保留一层轻量视觉表达。

它不是要替代 `echo` 的歌词和桌面氛围，而是让每次呼出 command surface 都像一次小型舞台切换：

- idle 状态展示当前歌曲封面、标题、歌手、进度和时间
- 搜索状态把 now-playing 收成紧凑 strip，让注意力回到输入和列表
- 专辑封面会提取 accent 和 ambient tint
- 切歌时有封面 pop、标题 scramble 和 now-playing transition
- 列表选中态使用 gliding cursor，而不是硬切高亮
- 窗口出现和隐藏都有轻量动画

视觉层的原则是：它可以被欣赏，但不应该拖慢决策。动画服务状态变化，封面和颜色服务音乐本身。

常用输入：

```text
<关键词>              搜 library；关键词长度 >= 2 时同时搜网易云
/queue               浏览当前播放队列
/queue <关键词>      在当前队列里过滤
/library             浏览红心 library
/library <关键词>    在红心 library 里过滤
/pl                  浏览已保存 playlist
/pl <id or url>      加载网易云 playlist，并在本地记住它
/mode                查看所有 mode
/daily               切到 daily mode
/digup               切到 dig up mode
/discover            切到 discover mode
/light               切到浅色外观
/dark                切到深色外观
/accent #d8b35f      设置 accent
```

常用快捷键：

- `Command-K`：打开 command palette
- `Option-Space`：全局呼出 command surface
- `Command-Shift-Space`：全局呼出 command surface 的备用快捷键
- `Command-Right`：下一首
- `Command-Left`：上一首
- `Command-P`：播放 / 暂停
- `Space`：播放 / 暂停（在输入框中无效）
- `N`：下一首（在输入框中无效）
- `Enter`：执行当前选中项
- `Option-Enter`：执行当前选中项的 alternate action，通常是开启 similar radio
- `Command-D`：对当前选中歌曲点红心 / 取消红心
- `Esc`：清空输入；输入为空时隐藏窗口

### Now-Playing State

`muse` 持有真正的 audio 元素，所以它能提供比官方 Now Playing 更可靠的状态：

- 精确的网易云 `songId`
- 歌名、歌手、专辑、封面
- 歌曲时长
- 当前播放进度
- 播放 / 暂停状态
- timeline discontinuity 信号

这些状态通过一个很小的本地 HTTP 接口暴露：

```text
GET http://127.0.0.1:10755/now
```

协议文档在 [`./NOW_PLAYING.md`](./NOW_PLAYING.md)。

这也是 `muse` 和 `echo` 之间最重要的连接点。官方网易云客户端发给 macOS Now Playing 的信息不够稳定，尤其是播放进度和事件频率。`echo` 可以退回到 `nowplaying-cli`，但只要 `muse` 在运行，就优先信任 `muse`。

### Spectrum

`muse` 还会把当前 audio 的实时频谱推给消费者：

```text
WS ws://127.0.0.1:10755/spectrum
```

频谱通道用于 `echo` 或其他可视层做音频反应式视觉。它和 `/now` 分开，是因为两者节奏完全不同：

- `/now` 是低频、可轮询、权威的播放状态
- `/spectrum` 是高频、实时、只在播放时推送的视觉数据

`/spectrum` 的握手、band 数量、频率范围和归一化方式同样写在 [`./NOW_PLAYING.md`](./NOW_PLAYING.md)。

## 和 echo 的关系

`echo` 可以独立运行。

独立运行时，它会通过 `nowplaying-cli` 读取当前播放的歌名和歌手，再用网易云公开接口搜索歌曲、拉歌词、用本地时钟滚动。

这个 fallback 有用，但不完美：

- 官方 Now Playing 事件太少
- elapsed time 可能卡住或缺失
- 用歌名和歌手模糊搜索容易匹配到错误版本

当 `muse` 运行时，`echo` 会先请求 `muse` 的 `/now`。因为 `muse` 自己就在播放音乐，所以它能直接给出准确的 `songId`、`currentTime` 和 `stateVersion`。这样 `echo` 就不用猜歌，也不用猜进度。

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
- `127.0.0.1:10755`：`/now` HTTP endpoint 和 `/spectrum` WebSocket

如果已经有另一个 `muse` 实例在提供 `/now`，新实例会弹窗提示并退出，避免端口冲突。

## 本地数据

`muse` 会在 Electron 的 `userData` 目录下保存少量本地数据：

- `cookie.txt`：网易云登录 cookie
- `data/library.json`：红心 library 镜像和本地播放元数据
- `data/history.json`：播放事件历史，默认保留 365 天
- `data/ui-prefs.json`：mode、appearance、accent
- `data/saved-playlists.json`：通过 `/pl` 记住的 playlist

JSON store 使用原子写入；如果某个文件损坏，会被隔离成 `.bad-<timestamp>.bak`，避免下一次启动继续读坏数据。

## 代码地图

```text
main.js
  设置 Electron app 身份、菜单、窗口和全局快捷键
  启动本地网易云 API server
  启动 /now endpoint 和 /spectrum WebSocket
  持久化 cookie、JSON store 和播放 history

preload.js
  暴露受限的 window.muse API
  连接 renderer 和 main 的 IPC 边界

lib/store.js
  本地 JSON store：一 key 一文件、原子写入、坏文件隔离

renderer/index.html
  登录 pane 和 command palette 的挂载点

renderer/app.js
  启动 prefs、auth、cmdk、library sync、mode runner 和快捷键

renderer/auth.js
  二维码登录、cookie 读取保存、cookie 失效后的重新登录

renderer/api.js
  本地网易云 API 的轻量封装：cookie、realIP、timeout、retry、auth fail hook

renderer/store.js
  小型 pub/sub store，带 selector、selectKey 和 async race guard

renderer/player.js
  持有唯一 Audio 元素
  管理 queue、播放控制、scrobble、/now 状态推送和 spectrum 采样

renderer/cmdk.js
  command palette 的 DOM、渲染、光标、键盘交互和窗口 resize

renderer/commands.js
  command palette 的命令构建器：queue、library、playlist、mode、appearance、song search

renderer/playlist.js
  网易云 playlist 加载和本地 bookmark

renderer/accent.js
  从专辑封面提取 accent 和 ambient tint

renderer/transitions.js
  command surface 的出现、隐藏、封面、标题和切歌动画

renderer/lib/library.js
  镜像“我喜欢”，维护本地播放元数据，记录播放 history，处理红心切换

renderer/lib/similar.js
  从网易云 /simi/song 拉相似歌曲并规范化为 Track

renderer/lib/artist.js
  从网易云 /artist/songs 拉歌手歌曲，用于 immersive mode

renderer/modes/
  queue builders：all、daily、digup、discover、immersive、similar、single

renderer/modes/session.js
  playback session：跟踪 queue 来源语义，协调 mode/manual/radio/playlist 之间的切换

scripts/export_library.py
  从本地 library 和网易云听歌记录导出 library.xlsx
```

## 设计原则

`muse` 应该越来越像一个可召唤的音乐 runtime，而不是越来越像传统播放器。

好的改动通常会让这些事情更快或更稳：

- 找一首歌
- 切一种听法
- 生成更好的队列
- 维护更有用的 library 元数据
- 向 `echo` 发布更准确的播放状态
- 让用户更快完成一次听歌决策
- 让 Option-Space 呼出的几秒钟更有音乐感

需要谨慎的改动通常是：

- 增加常驻的大播放器界面
- 增加复杂的播放页 chrome
- 把 `echo` 应该承担的歌词、桌面氛围和长时间观看体验塞回 `muse`
- 复制完整音乐客户端的导航结构
- 让 command surface 变成一个需要长期停留才有意义的页面

`muse` 的目标不是让用户长期停留，而是让用户完成一次听歌决策，然后带着一点音乐的余味回到正在做的事情。

## 相关文档

- [echo](https://github.com/finns0309/echo) —— 配套的悬浮歌词 / 视觉层
- [`./NOW_PLAYING.md`](./NOW_PLAYING.md) —— 两个项目之间的 `/now` 和 `/spectrum` 协议
