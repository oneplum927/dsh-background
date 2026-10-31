# @local/dsh-background

DeepSeek Harness 壁纸插件。**初始状态什么都不做**——不画任何壁纸或玻璃图层，
界面就是 DSH 原生样子（插件仅注入自有的面板/入口样式，以及一条有意的全局
规则：主区域容器始终直角，无论是否设置图片）；只有用户在侧栏底部的「壁纸」
入口里上传图片后，壁纸层与玻璃效果才会出现。清除图片即回到无壁纸的原生底色。

## 能力

- **上传自己的图片**（自动压缩到可存储的尺寸，PNG 透明度尽量保留）
- **位置**：水平 / 垂直偏移（±10cm，步进 0.1cm）
- **玻璃不透明度**：主区域与侧栏分开调节，0%–95%，深浅主题都完全跟滑杆
- **背景模糊**：0–24px
- **适应方式**：填满裁剪（cover）/ 完整显示（contain）/ 平铺（tile）
- **清除图片** / **恢复全部默认**

设置与上传图保存在本机浏览器 localStorage（`dsh-background.settings.v1` /
`dsh-background.image.v1`），实时生效，不上传到任何服务器。

## 组成

- **Host（`index.js`）**：在认证 `/api` 通道注册 `GET /api/background`，
  返回静态 JSON 状态（`{ok:true,name,version}`）作为插件在位标记；不再从磁盘
  提供任何图片。
- **Client（`client.js`）**：
  - 壁纸绘制在 `body::before` 固定层（负 z-index，随模糊半径外扩）；无图片时
    仅显示空白底色。位置 / 模糊 / 适应方式通过文档根上的 `--dsh-bgmap-*`
    变量驱动；`apply` 启动时从 localStorage 恢复设置。
  - 主区域玻璃在 `body::after` 全窗口色调层；`--dsw-alias-bg-base` 置为
    transparent（插件页/设置页根容器不画背景，聊天页画——统一靠 tint 层）。
  - 覆盖 `--dsw-specific-sidebar-fill` 为半透明玻璃；`bg-layer-1/2/3` 不接管
    （保持官方默认不透明）。
  - `body` 与 AppFrame 三个结构层（哈希类名运行时从 `ui-layout` 样式表解析）
    背景清零，避免多层玻璃叠加。
  - 一条有意的全局规则：主区域容器（`_centerCol`，运行时解析哈希）始终直角，
    覆盖原生 Windows 内容圆角——这是唯一在未设图片时也生效的样式。
  - 在 `main` 槽位注册「壁纸设置」面板，在 `sidebar.footer.action` 注册入口
    （order -9）。

## 移除

在侧边栏 Plugins 页面移除本插件，或从 profile 的
`dsh.profile.bundles` 与依赖里删去 `@local/dsh-background` 后重启即可；
样式与运行时变量随插件卸载一并清理。
