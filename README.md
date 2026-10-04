# 棋弈 · BoardGames

五种经典棋类的浏览器小游戏：五子棋、中国象棋、日本将棋、国际象棋与中国军棋。支持同一设备上的本地双人和休闲人机对弈，无需账号，游戏逻辑在本地执行。

[打开棋弈](https://soyungs.github.io/BoardGames/)

## 本地开发

使用 Node.js 22.12+ 和 npm。

```sh
npm ci
npm run dev
```

```sh
npm run lint
npm test
npm run build
npm run preview
```

测试通过 Node 内置测试运行器执行，使用项目已有的 TypeScript 转译器加载源码，无额外测试框架依赖。

## 玩法与规则边界

| 棋类 | 本作规则 |
| --- | --- |
| 五子棋 | 15×15，自由连珠，黑先白后，五子及以上连线获胜，无禁手；满盘无胜者为和棋。 |
| 中国象棋 | 支持马腿、象眼、炮架、将帅照面、将军、将死与困毙；困毙判负。暂不裁定长将、长捉及重复局面。 |
| 日本将棋 | 9×9，持子打入、金将六向、进出敌阵可选升变、强制升变、二步限制、打步诘限制与王手判定。暂不裁定千日手及持将棋。 |
| 国际象棋 | 支持王车易位、吃过路兵、兵升变为后/车/象/马、将死与逼和。暂不裁定五十回合、重复局面与子力不足和棋。 |
| 中国军棋 | **6×12 简化暗棋变体**，每方25子。后两行（行营留空）和前线5格随机布阵，军旗在大本营，地雷在后排。道路仅上下左右；铁路可直行，工兵可转弯；行营内棋子不可被攻击，本营内棋子不可移动。暗子只在交战后亮明，夺旗或令对方无合法走法获胜。 |

人机模式由内置算法执行，适合休闲练习。需要搜索的电脑计算使用浏览器 Web Worker，思考期间仍可重开和操作页面；重开、离开对局会终止旧计算。当前悔棋支持本地双人；刷新或离开对局会清空本局。

将棋规则参照[日本将棋联盟对局规则](https://www.shogi.or.jp/match/taikyoku_rules/)；象棋困毙判负可参照 [GNU XBoard 象棋规则说明](https://www.gnu.org/software/xboard/whats_new/rules/Xiangqi.html)。

## 界面与动画

- 暖白、木色和深绿界面，棋类插画由本地 SVG 绘制，不依赖外部图片或字体服务。
- 页面过渡、棋类卡片交互、落子弹簧、棋子位移、吃子退场及对局结束反馈。
- 棋盘随容器缩放，SVG、棋子与按钮使用同一坐标系，手机默认可完整看盘；也可选择「放大查看」以阅读棋子并精确点击。
- 支持系统「减少动态效果」偏好、键盘操作、焦点提示及回合状态播报。

## GitHub Pages

应用使用 HashRouter，静态站点路径与 `#` 后的游戏路由独立。

仓库 Settings → Pages 将 Source 设置为 GitHub Actions。现有 workflow 会在 PR 中执行 lint、规则测试和生产构建，推送 `main` 或 `master` 后执行检查并部署。

构建仓库子路径时：

```sh
VITE_BASE=/BoardGames/ npm run build
VITE_BASE=/BoardGames/ npm run preview
```

`VITE_BASE` 仅控制资源路径，不要将它用作 HashRouter 的 `basename`。

## 代码结构

```text
src/gameCatalog.ts           棋类信息与规则文案
src/components/              公共对局框架、棋盘缩放、SVG 插画
src/pages/                   大厅、模式选择、游戏路由
src/games/<game>/            独立棋类规则与对局组件
src/styles/theme.css         页面布局与视觉主题
src/index.css                棋盘、棋子与对局样式
tests/                      规则与不可变状态回归测试
```
