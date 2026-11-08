# Achievement-Plugin · 原神成就

Yunzai-Bot（TRSS-Yunzai / Miao-Yunzai）原神成就插件：录入自己的成就存档，查漏没完成的成就，看各特辑进度，按名称或描述搜成就。

- 成就按游戏内 ID 记录，能直接导入 [YaeAchievement](https://github.com/HolographicHat/YaeAchievement) 导出的 csv 表格 / UIAF json / 椰羊分享链接，以及椰羊小程序导出的 xlsx 表格
- 成就数据整理自 [genshin-db](https://github.com/theBowja/genshin-db)（MIT License），插件自动同步，新版本成就不用等插件更新
- 每个人一份记录，查漏、统计用 Yunzai 自带的渲染器出图

## 安装

在 Yunzai 根目录执行，然后重启 Yunzai：

```bash
git clone https://github.com/Tomato-0914/Achievement-Plugin.git ./plugins/Achievement-Plugin
```

之后发 `#更新成就插件` 即可在线更新。

不需要额外装依赖：用到的 `yaml` 和渲染器都是 Yunzai 自带的。需要 Node.js 18 或更高版本（用到了内置 `fetch`）。

首次启动后插件会在后台下载成就数据（genshin-db 每个成就一个文件，一共 1600 多个，要二三十秒到一两分钟），下载完成前发成就指令会提示稍后再试。服务器要能访问 GitHub（raw.githubusercontent.com），连不上时会自动换 jsdelivr 镜像。

## 指令

| 指令 | 说明 |
| --- | --- |
| `#成就录入` | 单独发送后，2 分钟内再发成就文件（json / xlsx / csv）或椰羊分享链接，整份导入并覆盖原有记录。也可以直接 `#成就录入 椰羊分享链接`，不用传文件。群里的 QQ 官方 Bot 收不到不带 @ 的文件，发文件请私聊 |
| `#成就录入 ID或名称` | 把这些成就标记为已完成，可以一次写多个（空格分开），如 `#成就录入 81622 二十五只甘撒`；多阶段成就同名，要写 ID |
| `#成就取消录入 ID或名称` | 把录错的成就改回未完成 |
| `#成就录入帮助` | 出图说明怎么用 YaeAchievement 导出成就（见下面「导出成就」） |
| `#成就查漏` | 列出没完成的成就：名称、描述、原石、上线版本、是否隐藏、多阶段成就的第几阶段，按特辑分组，每页 40 个。后面可以加筛选，能组合：特辑（`#成就查漏 天地万象`，`#成就查漏 至冬` 会匹配两个至冬特辑）、版本（`#成就查漏 6.0`、`#成就查漏 6.x`）、`隐藏`、页码（`#成就查漏 2`） |
| `#成就统计` / `#成就` | 各特辑完成进度，没完成的特辑排在前面；已获得 / 还能拿的原石 |
| `#成就查询 关键词` | 按 ID、名称、特辑名、名称或描述里的字搜索（`#成就查询 甘撒`、`#成就查询 登月`、`#成就查询 至冬`）；结果出图，排版照游戏里的成就列表（徽章、名称描述、原石、达成状态），存档里有完成时间的（YaeAchievement、UIAF）还会显示达成日期，一次最多显示 40 个。不带「查询」的 `#成就二十五只甘撒`、`#成就天地万象` 只认完整的名称 / 特辑名 / ID，对不上就放行给别的插件 |
| `#成就导出` | 导出成 UIAF v1.1 json 文件，可以导回椰羊、胡桃工具箱（适配器不支持发文件时会提示） |
| `#成就对比` | 和米游社显示的成就达成数核对，看记录是不是过期了（见下面「米游社核对」） |
| `#清空成就记录` | 删除自己的成就记录 |
| `#成就帮助` | 指令说明（出图） |
| `#成就更新` / `#成就强制更新` | 立即同步成就数据 / 重新下载全部（主人） |
| `#更新成就插件` / `#强制更新成就插件` | 从 git 远程更新插件本身并重启（主人，需 git clone 安装） |

## 导出成就

推荐用 [YaeAchievement](https://github.com/HolographicHat/YaeAchievement)（第三方开源工具，GPL-3.0）一次导出全部成就，官服、渠道服、国际服都能用，只支持 Windows 电脑：

1. 到 [发布页](https://github.com/HolographicHat/YaeAchievement/releases/latest) 下载 `YaeAchievement.exe`
2. 双击运行，它会自动启动原神；点「进入游戏」后原神自动关闭，成就数据就读好了
3. 按提示选择导出方式，任选一种：
   - **[0] 椰羊**（推荐）：浏览器会打开椰羊网页，复制地址栏的链接（形如 `https://cocogoat.work/achievement?memo=xxxxxxxxx`），发送 `#成就录入 链接` 即可，不用传文件。分享链接有有效期，导出后尽快发
   - **[4] 表格文件**：在 exe 同一个文件夹里生成 `achievement-时间.csv`，发 `#成就录入` 后把文件发给机器人
   - **[8] UIAF JSON 文件**：生成 `uiaf-时间.json`，同样发给机器人
4. 录入后发 `#成就查漏` 看还差哪些

手机上也可以用椰羊小程序扫描成就，导出 xlsx 表格后发给机器人。

## 支持的存档格式

- **椰羊分享链接**：`cocogoat.work/achievement?memo=分享码`，插件和椰羊网页一样从 `77.cocogoat.cn/v2/memo/分享码` 取回 UIAF 数据；也可以只发 9 位分享码
- **CSV / xlsx 表格**（YaeAchievement 的表格文件、椰羊小程序的 xlsx）：按表头找「ID」「状态」两列。「已完成」「已完成但未领取奖励」（英文版 Finished、Reward not taken）算完成，「未完成」「未知」算未完成；没有状态列时表里的都算已完成。YaeAchievement 的 csv 单元格不加引号，描述里带英文逗号时插件会从行尾取完成时间
- **UIAF**（Uniformed Interchangeable Achievement Format）json：`status` 为 2、3 算完成，0、1 算未完成；没有 `status` 字段的（UIAF v1.0）都算完成
- **其他 JSON**：带 `id` 的成就对象数组、`{ "成就ID": true }` 这类对象也能认出来

这些都是完整存档，导入时整个替换原有记录（手动 `#成就录入 ID` 标记的也会被覆盖）。存档里有、但成就数据里还没有的 ID（比如 genshin-db 还没收录的新版本成就）也会保存下来，数据更新后自动算进统计。

## 米游社核对

米游社战绩只给「成就达成数」这一个总数，不给每个成就完成了没有，所以没法从米游社自动同步记录；但可以拿这个总数核对插件里的记录是不是过期了：

- `#成就对比`：查米游社显示的达成数，和记录里的数量比较。游戏里多完成了就提醒重新导出存档录入；记录比米游社多时，可能是手动标记错了，也可能是米游社数据还没刷新
- `#成就查漏`、`#成就统计` 的图上，数量对不上时顶部会出提醒，一致时显示「✓ 和米游社一致」；`#成就录入` 成功后也会顺带核对一次（配置 `mysCompare`，默认开）

用的是 Yunzai 原神插件（`plugins/genshin`，Miao-Yunzai 自带，TRSS-Yunzai 要装 [Yunzai-genshin](https://github.com/TimeRainStarSky/Yunzai-genshin)）的 UID 绑定和公共 Cookie，和 `#原神卡片` 一样，只要 `#绑定uid` 过就能查，不需要绑定自己的 Cookie。没装原神插件或没绑 UID 时，查漏、统计里的核对自动跳过；`#成就对比` 会提示原因。结果 10 分钟内有缓存。

## 配置

`config/default.yaml` 是默认配置，升级时会被覆盖。要改的话新建 `config/config.yaml`，只写想覆盖的项，例如：

```yaml
pageSize: 60
renderScale: 150
```

装了[锅巴插件](https://github.com/guoba-yunzai/guoba-plugin)的话，也可以在锅巴面板里改，保存后写入 `config/config.yaml`。

- `priority`：默认 -110。比[观测枢图鉴（Tomato-Plugin）](https://github.com/Tomato-0914/Tomato-Plugin)的 -100 靠前，`#成就图鉴` 这类消息不会被图鉴的模糊匹配接走。改完重启生效
- `pageSize`：`#成就查漏` 每页显示多少个成就，默认 40
- `mysCompare`：查漏、统计、录入时顺带和米游社的成就达成数核对，默认开
- `syncHour`：每天几点检查一次 genshin-db 有没有新成就，默认 0 点；插件启动后也会先检查一次。改完重启生效
- `renderScale`：图片渲染精度，50~300，默认 100
- `render.quality` / `render.pageHeight`：JPEG 质量 / 图片超过多高切成多张

## 数据

都在 Yunzai 根目录的 `data/Achievement-Plugin/gs/` 下（目录名跟插件文件夹名一致），不进 git：

- `data.json`：成就数据，从 genshin-db 同步，每天检查一次，只下载新增和有变化的
- `user/<用户ID>.json`：每个人的成就记录（只记已完成的成就 ID 和完成时间）
- `export/`：`#成就导出` 生成的文件

## 数据来源说明

成就数据整理自 [genshin-db](https://github.com/theBowja/genshin-db)（MIT License，Copyright (c) 2020 theBowja），带游戏内成就 ID、所属特辑、原石奖励、是否隐藏、上线版本，和椰羊导出的表格逐条对得上（写这份说明时一共 75 个特辑、1909 个成就）。

没有用米游社观测枢：观测枢的成就条目没有游戏内 ID，和各家工具导出的存档对不上。

原石数以 genshin-db 为准，个别多阶段成就和椰羊表格里写的不一样（比如「伟业的遂成」第三阶段，椰羊写 5，genshin-db 写 20）。

游戏内容版权归米哈游所有。
