# AmazingFlower（哎呀花 - 云押花平台）

AmazingFlower 是一个基于浏览器的电子押花排版平台。项目为纯静态前端站点，无构建步骤，使用 ES Modules + Import Map + Konva 实现可视化编辑台。

## 项目特性

- 画布编辑：拖拽/点击素材到画布，支持选中、缩放、旋转、拖动。
- 图层管理：图层列表实时同步，可点击选中与拖拽重排。
- 工具栏操作：上移、下移、复制、旋转、删除、清空画布。
- 导入导出：支持导入 JSON 方案、导出 JSON 方案、导出书签区域 PNG 图片。
- 国际化：支持 `zh-Hans`、`zh-Hant`、`en`，可跟随系统语言或手动切换。
- 资源懒加载：素材按文件夹延迟加载，降低首屏资源压力。

## 页面说明

- `index.html`：编辑台主页面（核心业务逻辑）。
- `gallery.html`：作品展示页（静态内容 + i18n）。
- `aboutUs.html`：关于我们页（静态内容 + i18n）。
- `contact.html`：联系方式页（静态内容 + i18n）。

静态内容页统一通过 `script/pages/static-page.js` 完成语言切换与文本渲染。

## 目录结构

```text
AmazingFlower/
├─ assets/                    # 图片素材（背景/花朵/叶片）
├─ data/
│  ├─ catalog/                # 素材目录与分文件夹清单
│  └─ i18n/translations.json  # 多语言文案与素材标签
├─ script/
│  ├─ index.js                # 编辑台入口
│  ├─ editor/PressedFlowerStudio.js
│  ├─ config/asset-catalog.js
│  ├─ core/asset-loader.js
│  ├─ i18n/I18nService.js
│  ├─ ui/                     # 调色板、图层面板、工具栏渲染与绑定
│  └─ pages/static-page.js
├─ style/index.css
├─ index.html
├─ gallery.html
├─ aboutUs.html
└─ contact.html
```

## 运行方式

> 这是静态站点，但因为使用了 `fetch` 和 ES Module，请勿直接双击 HTML（`file://`）打开。

在项目根目录启动一个本地 HTTP 服务即可：

```bash
# Python
python -m http.server 8080
```

或：

```bash
# Node（无需全局安装）
npx serve . -p 8080
```

然后访问：`http://localhost:8080`

## 编辑台运行逻辑（`index.html` + `script/index.js`）

1. 页面加载 `importmap`，引入 `konva` 与 `@app/*` 模块。
2. 入口脚本初始化 `I18nService`，读取 `data/i18n/translations.json`，应用界面文案。
3. 创建 `AssetCatalog`（读取 `data/catalog/index.json`）和 `AssetLoader`（带缓存的图片加载器）。
4. 初始化 `PressedFlowerStudio`：
   - 创建 Konva Stage / Layer / Group / Transformer；
   - 绑定选中、拖拽、变换、画布自适应（`ResizeObserver`）；
   - 设置背景图并同步场景缩放与偏移。
5. 渲染素材面板：
   - 左侧按 group/folder 展示；
   - 点击文件夹后才拉取对应 `data/catalog/{folder-id}.json`（懒加载）。
6. 绑定交互：
   - 素材卡片点击添加；
   - 素材拖拽到画布时按鼠标位置落点；
   - 图层列表支持选中和拖拽重排；
   - 工具栏触发复制、旋转、删除、导入导出等操作。
7. 绑定快捷键：
   - `Delete/Backspace` 删除；
   - `Esc` 取消选中；
   - `方向键` 微调位置（`Shift` 为大步进）；
   - `Ctrl/Cmd + D` 复制选中素材。

## 关键数据结构

### 素材目录

- `data/catalog/index.json`
  - 定义背景素材、素材分组、文件夹清单、文件夹内素材 ID 列表。
- `data/catalog/{folder-id}.json`
  - 定义该文件夹下具体素材条目（`id`、`fileName`、`defaultScale`）。

### 导入导出 JSON（构图方案）

编辑器导出的方案格式（核心字段）：

```json
{
  "type": "amazing-flower-composition",
  "version": 1,
  "backgroundId": "xxx",
  "metadata": {
    "locale": "zh-Hans",
    "exportedAt": "2026-04-11T12:00:00.000Z"
  },
  "items": [
    {
      "id": "specimen-1",
      "assetId": "xxx",
      "instanceIndex": 1,
      "x": 100,
      "y": 120,
      "rotation": 0,
      "scaleX": 0.54,
      "scaleY": 0.54
    }
  ]
}
```

## 如何扩展

### 新增素材

1. 将图片放入 `assets/`。
2. 在 `data/catalog/{folder-id}.json` 添加素材项。
3. 在 `data/catalog/index.json` 中注册 folder 与 group 的关联关系。
4. 在 `data/i18n/translations.json` 的 `labels` 下补齐素材 ID 的多语言名称。

### 新增界面文案

1. 在 `translations.json` 的 `ui` 下添加键值。
2. 在 HTML 或脚本渲染节点上使用 `data-i18n="your.key"`。

## 技术栈

- 原生 HTML/CSS/JavaScript（ES Modules）
- Import Map
- Konva.js（2D 画布交互）
- 浏览器本地存储（语言偏好）

