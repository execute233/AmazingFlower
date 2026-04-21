// ================================
// 押花工作室核心编辑器
// 基于 Konva.js 实现画布编辑功能
// ================================

/**
 * 辅助函数：将数值限制在指定范围内
 * @param {number} value - 要限制的数值
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @returns {number} - 限制后的数值
 */
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const MIN_CROP_SIZE = 32;
const CROP_HANDLE_IDS = [
  'top-left',
  'top',
  'top-right',
  'right',
  'bottom-right',
  'bottom',
  'bottom-left',
  'left',
];
const CROP_HANDLE_CURSORS = {
  'top-left': 'nwse-resize',
  top: 'ns-resize',
  'top-right': 'nesw-resize',
  right: 'ew-resize',
  'bottom-right': 'nwse-resize',
  bottom: 'ns-resize',
  'bottom-left': 'nesw-resize',
  left: 'ew-resize',
  move: 'grab',
};

/**
 * PressedFlowerStudio 类
 * 负责管理整个押花编辑器的核心功能：
 * - 画布渲染（基于 Konva）
 * - 素材管理
 * - 图层控制
 * - 用户交互
 */
export class PressedFlowerStudio {
  // ==================== 私有属性声明 ====================
  #assetLoader; // 资源加载器实例
  #mountNode; // DOM 挂载点
  #frameNode; // 外框 DOM 节点
  #resolveAssetLabel; // 获取素材标签的回调
  #formatLayerLabel; // 格式化图层标签的回调
  #formatMessage; // 格式化消息的回调
  #onSelectionChange = null; // 选择变化回调
  #onLayersChange = null; // 图层变化回调
  #onStatusChange = null; // 状态变化回调
  #Konva = null; // Konva 库引用
  #stage = null; // Konva Stage 实例
  #mainLayer = null; // 主渲染层
  #overlayLayer = null; // 叠加层（用于变换器等）
  #sceneGroup = null; // 场景组（包含背景和构图）
  #overlaySceneGroup = null; // 叠加层场景组（用于裁剪辅助控件）
  #compositionGroup = null; // 构图组（包含所有素材）
  #transformer = null; // 变换器（用于缩放旋转）
  #cropOverlay = null; // 裁剪辅助组
  #cropSourceRect = null; // 原图范围辅助框
  #cropFrameRect = null; // 当前裁剪框
  #cropHandles = new Map(); // 裁剪控制点映射
  #backgroundNode = null; // 背景图片节点
  #selectedNode = null; // 当前选中的节点
  #resizeObserver = null; // 尺寸监听器
  #nodeSequence = 0; // 节点序列号生成器
  #backgroundAsset = null; // 背景素材资源
  #isCropMode = false; // 是否处于裁剪模式
  #cropSnapshot = null; // 进入裁剪模式前的节点快照
  #activeCropHandle = ''; // 当前正在拖拽的裁剪控制点或移动模式
  #cropDragOrigin = null; // 裁剪拖拽起点
  #cropDragOriginCrop = null; // 裁剪拖拽开始时的裁剪状态
  #sceneMetrics = { // 场景度量信息
    width: 1, // 场景宽度
    height: 1, // 场景高度
    scale: 1, // 显示缩放比例
    offsetX: 0, // X 轴偏移
    offsetY: 0, // Y 轴偏移
  };
  #handleWindowPointerUp = () => {
    this.#finishCropDrag();
  };

  /**
   * 构造函数
   * @param {Object} options - 配置选项
   * @param {HTMLElement} options.mountNode - 画布容器 DOM 节点
   * @param {HTMLElement} options.frameNode - 外框 DOM 节点
   * @param {AssetLoader} options.assetLoader - 资源加载器
   * @param {Function} options.resolveAssetLabel - 获取素材标签函数
   * @param {Function} options.formatLayerLabel - 格式化图层标签函数
   * @param {Function} options.formatMessage - 格式化消息函数
   * @param {Function} options.onSelectionChange - 选择变化回调
   * @param {Function} options.onLayersChange - 图层变化回调
   * @param {Function} options.onStatusChange - 状态变化回调
   */
  constructor({
    mountNode,
    frameNode,
    assetLoader,
    resolveAssetLabel,
    formatLayerLabel,
    formatMessage,
    onSelectionChange,
    onLayersChange,
    onStatusChange,
  }) {
    this.#mountNode = mountNode;
    this.#frameNode = frameNode;
    this.#assetLoader = assetLoader;
    this.#resolveAssetLabel = resolveAssetLabel;
    this.#formatLayerLabel = formatLayerLabel;
    this.#formatMessage = formatMessage;
    this.#onSelectionChange = onSelectionChange;
    this.#onLayersChange = onLayersChange;
    this.#onStatusChange = onStatusChange;
  }

  /**
   * 初始化编辑器
   * @param {Object} options - 配置选项
   * @param {Object} options.backgroundAsset - 背景素材对象
   */
  async initialize({ backgroundAsset } = {}) {
    this.#Konva = globalThis.Konva; // 从全局获取 Konva 库
    if (!this.#Konva) {
      throw new Error('Konva 未加载，无法初始化编辑器。');
    }

    // 背景可以异步加载：如果提供 backgroundAsset，则异步去设置，不阻塞初始化
    this.#backgroundAsset = backgroundAsset;
    this.#createStage(); // 创建 Konva Stage
    this.#bindStageEvents(); // 绑定画布事件
    this.#bindResizeObserver(); // 监听尺寸变化

    if (backgroundAsset) {
      // 启动异步加载但不阻塞 initialize
      this.#setBackground(backgroundAsset)
        .then(() => {
          this.#syncStageSize();
          this.#setStatusByKey('status.backgroundLoaded');
        })
        .catch(() => {
          // 背景加载失败不应阻塞主流程，错误由调用方处理
        });
    }

    this.#syncStageSize(); // 同步画布尺寸（使用默认度量）
    this.#emitSelectionChange(); // 触发选择变化
    this.#emitLayersChange(); // 触发图层变化
    this.#setStatusByKey('status.initialHint'); // 显示初始提示
  }

  /**
   * 公共方法：异步设置背景并确保舞台尺寸同步
   * @param {Object} backgroundAsset
   */
  async setBackground(backgroundAsset) {
    this.#backgroundAsset = backgroundAsset;
    await this.#setBackground(backgroundAsset);
    this.#syncStageSize();
    this.#setStatusByKey('status.backgroundLoaded');
  }

  /**
   * 刷新展示内容（用于语言切换等场景）
   */
  refreshPresentation() {
    this.#emitSelectionChange();
    this.#emitLayersChange();
  }

  /**
   * 是否处于裁剪模式
   * @returns {boolean}
   */
  isCropModeActive() {
    return this.#isCropMode;
  }

  /**
   * 添加素材到画布
   * @param {Object} asset - 素材对象
   * @param {Object} options - 选项
   * @param {{x: number, y: number}} [options.position] - 放置位置（可选）
   * @param {Object} [options.state] - 状态数据（用于导入时恢复）
   * @param {boolean} [options.silent=false] - 是否静默模式（不显示提示）
   * @returns {Promise<Konva.Image>} - 创建的图像节点
   */
  async addAsset(asset, { position, state, silent = false } = {}) {
    if (this.#isCropMode) {
      this.commitCropSelection();
    }

    // 加载素材图片
    const image = await this.#assetLoader.load(asset.src);
    // 创建构图节点
    const node = this.#createCompositionNode(asset, image, {
      position: state
        ? { x: state.x, y: state.y }
        : position ?? this.getCanvasCenter(),
      state,
    });

    this.#compositionGroup.add(node); // 添加到构图组
    this.#bindNodeEvents(node); // 绑定节点事件
    this.selectNode(node); // 选中新创建的节点
    this.#emitLayersChange(); // 通知图层变化
    this.#requestDraw(); // 请求重绘

    if (!silent) {
      this.#setStatusByKey('status.added', { label: this.#getAssetLabel(asset.id) });
    }

    return node;
  }

  /**
   * 选中指定节点
   * @param {Konva.Image} node - 要选中的节点
   */
  selectNode(node) {
    if (this.#isCropMode && this.#selectedNode !== node) {
      return;
    }

    if (this.#selectedNode === node) {
      return; // 已经是当前选中节点，跳过
    }

    this.#selectedNode = node;
    this.#transformer.nodes([node]); // 更新变换器目标
    this.#emitSelectionChange(); // 触发选择变化
    this.#emitLayersChange(); // 触发图层变化
    this.#requestDraw(); // 请求重绘
  }

  /**
   * 通过图层 ID 选中图层
   * @param {string} layerId - 图层 ID
   * @returns {boolean} - 是否成功选中
   */
  selectLayer(layerId) {
    const node = this.#findNodeById(layerId);
    if (!node) {
      return false;
    }

    if (this.#isCropMode && this.#selectedNode !== node) {
      return false;
    }

    this.selectNode(node);
    return true;
  }

  /**
   * 清除当前选择
   */
  clearSelection() {
    if (this.#isCropMode) {
      return;
    }

    if (!this.#selectedNode) {
      return; // 没有选中任何对象
    }

    this.#selectedNode = null;
    this.#transformer.nodes([]); // 清空变换器
    this.#emitSelectionChange();
    this.#emitLayersChange();
    this.#requestDraw();
    this.#setStatusByKey('status.selectionCleared');
  }

  /**
   * 复制选中的素材
   * @returns {boolean} - 是否成功复制
   */
  duplicateSelection() {
    if (!this.#selectedNode || this.#isCropMode) {
      return false;
    }

    // 生成新的节点元数据（唯一 ID 和实例索引）
    const metadata = this.#createNodeMetadata();
    // 克隆节点并设置新属性
    const clonedNode = this.#selectedNode.clone({
      id: metadata.id,
      x: this.#selectedNode.x() + 96, // 向右下偏移 96px
      y: this.#selectedNode.y() + 96,
      assetId: this.#selectedNode.getAttr('assetId'),
      instanceIndex: metadata.instanceIndex,
      image: this.#selectedNode.image(),
    });

    this.#compositionGroup.add(clonedNode);
    this.#bindNodeEvents(clonedNode);
    this.selectNode(clonedNode); // 选中克隆的节点
    this.#emitLayersChange();
    this.#requestDraw();
    this.#setStatusByKey('status.duplicated', { label: this.#getNodeLabel(clonedNode) });
    return true;
  }

  /**
   * 移除选中的素材
   * @returns {boolean} - 是否成功移除
   */
  removeSelection() {
    if (!this.#selectedNode || this.#isCropMode) {
      return false;
    }

    const label = this.#getNodeLabel(this.#selectedNode);
    this.#selectedNode.destroy(); // 销毁节点
    this.#selectedNode = null;
    this.#transformer.nodes([]);
    this.#emitSelectionChange();
    this.#emitLayersChange();
    this.#requestDraw();
    this.#setStatusByKey('status.removed', { label });
    return true;
  }

  /**
   * 上移选中图层的层级
   * @returns {boolean} - 是否成功移动
   */
  moveSelectionUp() {
    if (!this.#selectedNode || this.#isCropMode) {
      return false;
    }

    const moved = this.#selectedNode.moveUp(); // Konva 内置方法
    if (!moved) {
      return false; // 已经在最顶层
    }

    this.#emitLayersChange();
    this.#requestDraw();
    this.#setStatusByKey('status.layerMovedUp');
    return true;
  }

  /**
   * 下移选中图层的层级
   * @returns {boolean} - 是否成功移动
   */
  moveSelectionDown() {
    if (!this.#selectedNode || this.#isCropMode) {
      return false;
    }

    const moved = this.#selectedNode.moveDown(); // Konva 内置方法
    if (!moved) {
      return false; // 已经在最底层
    }

    this.#emitLayersChange();
    this.#requestDraw();
    this.#setStatusByKey('status.layerMovedDown');
    return true;
  }

  /**
   * 重排图层到指定位置
   * @param {string} layerId - 图层 ID
   * @param {number} targetIndex - 目标索引（从 0 开始）
   * @returns {boolean} - 是否成功重排
   */
  reorderLayer(layerId, targetIndex) {
    if (this.#isCropMode) {
      return false;
    }

    const node = this.#findNodeById(layerId);
    const children = this.#compositionGroup.getChildren();
    if (!node || targetIndex < 0 || targetIndex >= children.length) {
      return false;
    }

    // 计算目标 Z 轴索引（Konva 的 Z 轴从上到下递增）
    const targetZIndex = children.length - 1 - targetIndex;
    node.setZIndex(targetZIndex); // 设置新的 Z 轴顺序
    this.#emitLayersChange();
    this.#requestDraw();
    this.#setStatusByKey('status.layerReordered');
    return true;
  }

  /**
   * 旋转选中的素材
   * @param {number} deltaDegrees - 旋转角度增量
   * @returns {boolean} - 是否成功旋转
   */
  rotateSelection(deltaDegrees) {
    if (!this.#selectedNode || this.#isCropMode) {
      return false;
    }

    // 累加旋转角度
    this.#selectedNode.rotation(this.#selectedNode.rotation() + deltaDegrees);
    this.#requestDraw();
    this.#emitSelectionChange();
    this.#setStatusByKey('status.rotatedTo', {
      rotation: Math.round(this.#selectedNode.rotation()),
    });
    return true;
  }

  /**
   * 将选中素材的旋转角度重置为 0
   * @returns {boolean}
   */
  resetSelectionRotation() {
    if (!this.#selectedNode || this.#isCropMode) {
      return false;
    }

    this.#selectedNode.rotation(0);
    this.#requestDraw();
    this.#emitSelectionChange();
    this.#setStatusByKey('status.rotationReset', {
      label: this.#getNodeLabel(this.#selectedNode),
    });
    return true;
  }

  /**
   * 微调选中素材的位置
   * @param {number} deltaX - X 轴移动距离
   * @param {number} deltaY - Y 轴移动距离
   * @returns {boolean} - 是否成功移动
   */
  nudgeSelection(deltaX, deltaY) {
    if (!this.#selectedNode || this.#isCropMode) {
      return false;
    }

    this.#selectedNode.position({
      x: this.#selectedNode.x() + deltaX,
      y: this.#selectedNode.y() + deltaY,
    });

    this.#requestDraw();
    return true;
  }

  /**
   * 进入选中素材的裁剪模式
   * @returns {boolean}
   */
  startCropSelection() {
    if (!this.#selectedNode || this.#isCropMode) {
      return false;
    }

    this.#isCropMode = true;
    this.#cropSnapshot = this.#createNodeSnapshot(this.#selectedNode);
    this.#activeCropHandle = '';
    this.#setAllNodesDraggable(false);
    this.#transformer.nodes([]);
    this.#mountNode.classList.add('is-cropping');
    this.#mountNode.style.cursor = 'crosshair';
    this.#refreshCropOverlay();
    this.#emitSelectionChange();
    this.#requestDraw();
    this.#setStatusByKey('status.cropStarted', { label: this.#getNodeLabel(this.#selectedNode) });
    return true;
  }

  /**
   * 确认当前裁剪结果
   * @returns {boolean}
   */
  commitCropSelection() {
    if (!this.#isCropMode || !this.#selectedNode) {
      return false;
    }

    const label = this.#getNodeLabel(this.#selectedNode);
    this.#resetCropMode({ restore: false, silent: true });
    this.#setStatusByKey('status.cropApplied', { label });
    return true;
  }

  /**
   * 取消当前裁剪并恢复进入裁剪模式前的状态
   * @returns {boolean}
   */
  cancelCropSelection() {
    if (!this.#isCropMode || !this.#selectedNode) {
      return false;
    }

    const label = this.#getNodeLabel(this.#selectedNode);
    this.#resetCropMode({ restore: true, silent: true });
    this.#setStatusByKey('status.cropCancelled', { label });
    return true;
  }

  /**
   * 在裁剪模式中将素材恢复为未裁剪状态，但不自动保存
   * @returns {boolean}
   */
  resetCropSelection() {
    if (!this.#isCropMode || !this.#selectedNode) {
      return false;
    }

    const crop = this.#getNodeCropState(this.#selectedNode);
    const nextBox = {
      left: -crop.cropWidth / 2 - crop.cropX,
      right: crop.cropWidth / 2 + (crop.sourceWidth - crop.cropX - crop.cropWidth),
      top: -crop.cropHeight / 2 - crop.cropY,
      bottom: crop.cropHeight / 2 + (crop.sourceHeight - crop.cropY - crop.cropHeight),
    };

    this.#applyCropBox(this.#selectedNode, nextBox);
    this.#setStatusByKey('status.cropResetPreview', {
      label: this.#getNodeLabel(this.#selectedNode),
    });
    return true;
  }

  /**
   * 清空画布上的所有素材
   * @param {Object} options - 选项
   * @param {boolean} [options.silent=false] - 是否静默模式
   */
  clearComposition({ silent = false } = {}) {
    this.#resetCropMode({ restore: false, silent: true });
    this.#compositionGroup.destroyChildren(); // 销毁所有子节点
    this.#selectedNode = null;
    this.#transformer.nodes([]);
    this.#emitSelectionChange();
    this.#emitLayersChange();
    this.#requestDraw();

    if (!silent) {
      this.#setStatusByKey('status.canvasCleared');
    }
  }

  /**
   * 序列化当前作品为 JSON 对象
   * @param {Object} metadata - 附加元数据
   * @returns {Object} - 序列化的 JSON 对象
   */
  serializeComposition(metadata = {}) {
    return {
      type: 'amazing-flower-composition', // 标识文件类型
      version: 2, // 版本号
      backgroundId: this.#backgroundAsset?.id ?? '', // 背景素材 ID
      metadata, // 附加元数据（语言、导出时间等）
      items: this.#compositionGroup.getChildren().map((node) => {
        const crop = this.#getNodeCropState(node);
        return {
          id: node.id(), // 节点唯一 ID
          assetId: node.getAttr('assetId'), // 素材 ID
          instanceIndex: node.getAttr('instanceIndex'), // 实例索引
          x: node.x(), // X 坐标
          y: node.y(), // Y 坐标
          rotation: node.rotation(), // 旋转角度
          scaleX: node.scaleX(), // X 轴缩放
          scaleY: node.scaleY(), // Y 轴缩放
          cropX: crop.cropX, // 裁剪区域左上角 X
          cropY: crop.cropY, // 裁剪区域左上角 Y
          cropWidth: crop.cropWidth, // 裁剪区域宽度
          cropHeight: crop.cropHeight, // 裁剪区域高度
        };
      }),
    };
  }

  /**
   * 加载 JSON 作品文件到画布
   * @param {Object} document - JSON 文档对象
   * @param {Object} options - 选项
   * @param {Function} options.resolveAssetById - 通过 ID 解析素材的函数
   */
  async loadComposition(document, { resolveAssetById }) {
    // 验证文件格式
    if (!document || document.type !== 'amazing-flower-composition' || !Array.isArray(document.items)) {
      throw new Error('不是有效的导入文件。');
    }

    this.clearComposition({ silent: true }); // 清空当前画布

    // 逐个加载素材
    for (const item of document.items) {
      const asset = await resolveAssetById(item.assetId);
      if (!asset) {
        throw new Error(`缺少素材 ${item.assetId}`);
      }

      // 使用保存的状态数据恢复素材
      await this.addAsset(asset, { state: item, silent: true });
    }

    // 重置选择状态
    if (this.#selectedNode) {
      this.#selectedNode = null;
      this.#transformer.nodes([]);
    }

    this.#emitSelectionChange();
    this.#emitLayersChange();
    this.#requestDraw();
    this.#setStatusByKey('status.importDone', { count: document.items.length });
  }

  /**
   * 导出作品为图片 DataURL
   * @param {Object} options - 选项
   * @param {number} [options.pixelRatio=2] - 像素比例（用于高分辨率导出）
   * @returns {string} - Data URL 字符串
   */
  exportCompositionImage({ pixelRatio = 2 } = {}) {
    // 获取导出裁剪区域
    const crop = this.#getExportCropRect();
    // 使用 Konva Layer 的 toDataURL 方法导出
    return this.#mainLayer.toDataURL({
      x: crop.x,
      y: crop.y,
      width: crop.width,
      height: crop.height,
      pixelRatio,
    });
  }

  /**
   * 将屏幕坐标转换为画布场景坐标
   * @param {{clientX: number, clientY: number}} param0 - 鼠标事件坐标
   * @returns {{x: number, y: number}} - 画布场景坐标
   */
  toStagePoint({ clientX, clientY }) {
    const bounds = this.#mountNode.getBoundingClientRect(); // 获取容器边界
    const localX = clientX - bounds.left; // 相对于容器的 X 坐标
    const localY = clientY - bounds.top; // 相对于容器的 Y 坐标
    // 考虑缩放和偏移，转换为场景坐标
    const sceneX = (localX - this.#sceneMetrics.offsetX) / this.#sceneMetrics.scale;
    const sceneY = (localY - this.#sceneMetrics.offsetY) / this.#sceneMetrics.scale;

    return {
      x: clamp(sceneX, 0, this.#sceneMetrics.width), // 限制在场景范围内
      y: clamp(sceneY, 0, this.#sceneMetrics.height),
    };
  }

  /**
   * 获取画布中心点坐标
   * @returns {{x: number, y: number}} - 中心点坐标
   */
  getCanvasCenter() {
    return {
      x: this.#sceneMetrics.width / 2,
      y: this.#sceneMetrics.height / 2,
    };
  }

  /**
   * 获取所有图层的当前状态
   * @returns {Array} - 图层状态数组（从上到下排序）
   */
  getLayersState() {
    return this.#compositionGroup.getChildren().slice().reverse().map((node) => ({
      id: node.id(),
      label: this.#formatLayerLabel({
        assetId: node.getAttr('assetId'),
        label: this.#getNodeLabel(node),
        instanceIndex: node.getAttr('instanceIndex'),
      }),
      isSelected: node === this.#selectedNode, // 是否被选中
    }));
  }

  /**
   * 获取当前选择状态
   * @returns {Object} - 选择状态对象
   */
  getSelectionState() {
    if (!this.#selectedNode) {
      return {
        hasSelection: false,
        label: '',
        rotation: 0,
        isCropping: false,
      };
    }

    return {
      hasSelection: true,
      label: this.#getNodeLabel(this.#selectedNode),
      rotation: Math.round(this.#selectedNode.rotation()), // 四舍五入到整数度
      isCropping: this.#isCropMode,
    };
  }

  #createStage() {
    const Konva = this.#Konva;
    this.#stage = new Konva.Stage({
      container: this.#mountNode,
      width: 1,
      height: 1,
    });

    this.#mainLayer = new Konva.Layer();
    this.#overlayLayer = new Konva.Layer();
    this.#sceneGroup = new Konva.Group({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    this.#overlaySceneGroup = new Konva.Group({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    this.#compositionGroup = new Konva.Group();

    this.#transformer = new Konva.Transformer({
      rotateEnabled: true,
      keepRatio: true,
      enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
      anchorSize: 20,
      padding: 14,
      rotateAnchorOffset: 44,
      anchorCornerRadius: 10,
      anchorFill: '#f0ede3',
      anchorStroke: '#1a3a32',
      anchorStrokeWidth: 1.5,
      borderStroke: '#1a3a32',
      borderDash: [8, 6],
      centeredScaling: false,
      flipEnabled: false,
      ignoreStroke: true,
    });

    this.#createCropOverlay();
    this.#sceneGroup.add(this.#compositionGroup);
    this.#mainLayer.add(this.#sceneGroup);
    this.#overlaySceneGroup.add(this.#cropOverlay);
    this.#overlayLayer.add(this.#overlaySceneGroup, this.#transformer);
    this.#stage.add(this.#mainLayer, this.#overlayLayer);
  }

  #createCropOverlay() {
    const Konva = this.#Konva;
    this.#cropOverlay = new Konva.Group({
      visible: false,
      listening: true,
      name: 'crop-overlay',
    });

    this.#cropSourceRect = new Konva.Rect({
      stroke: 'rgba(26, 58, 50, 0.38)',
      strokeWidth: 1.5,
      strokeScaleEnabled: false,
      dash: [10, 8],
      fill: 'rgba(22, 35, 31, 0.08)',
      listening: false,
    });

    this.#cropFrameRect = new Konva.Rect({
      stroke: '#b66a3c',
      strokeWidth: 2,
      strokeScaleEnabled: false,
      dash: [10, 6],
      fill: 'rgba(255, 255, 255, 0.08)',
      listening: true,
    });

    this.#cropOverlay.add(this.#cropSourceRect, this.#cropFrameRect);

    this.#cropFrameRect.on('mousedown touchstart', (event) => {
      event.cancelBubble = true;
      this.#beginCropDrag('move');
    });

    this.#cropFrameRect.on('mouseenter', () => {
      if (!this.#isCropMode || this.#activeCropHandle) {
        return;
      }

      this.#mountNode.style.cursor = CROP_HANDLE_CURSORS.move;
    });

    this.#cropFrameRect.on('mouseleave', () => {
      if (!this.#isCropMode || this.#activeCropHandle) {
        return;
      }

      this.#mountNode.style.cursor = 'crosshair';
    });

    CROP_HANDLE_IDS.forEach((handleId) => {
      const handle = new Konva.Rect({
        width: 18,
        height: 18,
        offsetX: 9,
        offsetY: 9,
        cornerRadius: 6,
        fill: '#f0ede3',
        stroke: '#1a3a32',
        strokeWidth: 1.5,
        strokeScaleEnabled: false,
        shadowColor: 'rgba(16, 37, 32, 0.18)',
        shadowBlur: 10,
        shadowOffset: { x: 0, y: 4 },
        name: 'crop-handle',
        handleId,
      });

      handle.on('mousedown touchstart', (event) => {
        event.cancelBubble = true;
        this.#beginCropDrag(handleId);
      });

      handle.on('mouseenter', () => {
        if (!this.#isCropMode) {
          return;
        }

        this.#mountNode.style.cursor = CROP_HANDLE_CURSORS[handleId] ?? 'crosshair';
      });

      handle.on('mouseleave', () => {
        if (!this.#isCropMode || this.#activeCropHandle) {
          return;
        }

        this.#mountNode.style.cursor = 'crosshair';
      });

      this.#cropHandles.set(handleId, handle);
      this.#cropOverlay.add(handle);
    });
  }

  #bindStageEvents() {
    this.#stage.on('click tap', (event) => {
      if (this.#isCropMode) {
        return;
      }

      if (event.target === this.#stage || event.target === this.#backgroundNode) {
        this.clearSelection();
      }
    });

    this.#stage.on('mousemove touchmove', () => {
      this.#handleCropDragMove();
    });

    this.#stage.on('mouseup touchend', () => {
      this.#finishCropDrag();
    });

    window.addEventListener('pointerup', this.#handleWindowPointerUp);
    window.addEventListener('pointercancel', this.#handleWindowPointerUp);
  }

  #bindResizeObserver() {
    this.#resizeObserver = new ResizeObserver(() => {
      this.#syncStageSize();
    });

    this.#resizeObserver.observe(this.#frameNode);
  }

  async #setBackground(backgroundAsset) {
    const image = await this.#assetLoader.load(backgroundAsset.src);
    const Konva = this.#Konva;
    this.#sceneMetrics.width = image.naturalWidth || image.width;
    this.#sceneMetrics.height = image.naturalHeight || image.height;

    if (!this.#backgroundNode) {
      this.#backgroundNode = new Konva.Image({
        x: 0,
        y: 0,
        image,
        listening: true,
        name: 'canvas-background',
      });
      this.#sceneGroup.add(this.#backgroundNode);
      this.#backgroundNode.moveToBottom();
    } else {
      this.#backgroundNode.image(image);
    }

    this.#backgroundNode.setAttrs({
      width: this.#sceneMetrics.width,
      height: this.#sceneMetrics.height,
      opacity: 0.96,
    });
  }

  #createCompositionNode(asset, image, { position, state }) {
    const Konva = this.#Konva;
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const metadata = this.#createNodeMetadata(state?.instanceIndex);
    const fallbackScale = clamp(300 / Math.max(sourceWidth, sourceHeight), 0.28, 0.72);
    const scaleX = state?.scaleX ?? asset.defaultScale ?? fallbackScale;
    const scaleY = state?.scaleY ?? asset.defaultScale ?? fallbackScale;
    const crop = this.#normalizeCropState({
      sourceWidth,
      sourceHeight,
      cropX: state?.cropX,
      cropY: state?.cropY,
      cropWidth: state?.cropWidth,
      cropHeight: state?.cropHeight,
    });

    return new Konva.Image({
      id: state?.id ?? metadata.id,
      image,
      x: position.x,
      y: position.y,
      rotation: state?.rotation ?? 0,
      width: crop.cropWidth,
      height: crop.cropHeight,
      offsetX: crop.cropWidth / 2,
      offsetY: crop.cropHeight / 2,
      scaleX,
      scaleY,
      draggable: true,
      shadowColor: 'rgba(16, 37, 32, 0.18)',
      shadowBlur: 24,
      shadowOffset: { x: 0, y: 12 },
      name: 'composition-item',
      crop: {
        x: crop.cropX,
        y: crop.cropY,
        width: crop.cropWidth,
        height: crop.cropHeight,
      },
      assetId: asset.id,
      instanceIndex: metadata.instanceIndex,
      sourceWidth,
      sourceHeight,
    });
  }

  #bindNodeEvents(node) {
    node.on('mousedown touchstart dragstart transformstart', () => {
      this.selectNode(node);
    });

    node.on('dragstart transformstart', () => {
      if (this.#isCropMode) {
        node.stopDrag();
        return;
      }

      this.#mountNode.classList.add('is-dragging');
      this.#mountNode.style.cursor = 'grabbing';
    });

    node.on('transform dragmove', () => {
      if (this.#isCropMode) {
        return;
      }

      if (node === this.#selectedNode) {
        this.#emitSelectionChange();
      }
      this.#requestDraw();
    });

    node.on('dragend transformend', () => {
      if (this.#isCropMode) {
        return;
      }

      this.#mountNode.classList.remove('is-dragging');
      this.#mountNode.style.cursor = 'default';
      this.#emitSelectionChange();
      this.#requestDraw();
    });
  }

  #syncStageSize() {
    if (!this.#stage) {
      return;
    }

    const frameStyles = getComputedStyle(this.#frameNode);
    const availableWidth = Math.max(
      this.#frameNode.clientWidth - parseFloat(frameStyles.paddingLeft) - parseFloat(frameStyles.paddingRight),
      1,
    );
    const availableHeight = Math.max(
      this.#frameNode.clientHeight - parseFloat(frameStyles.paddingTop) - parseFloat(frameStyles.paddingBottom),
      1,
    );
    const sceneRatio = this.#sceneMetrics.width / this.#sceneMetrics.height;
    const availableRatio = availableWidth / availableHeight;

    const width = availableRatio > sceneRatio
      ? availableHeight * sceneRatio
      : availableWidth;
    const height = availableRatio > sceneRatio
      ? availableHeight
      : availableWidth / sceneRatio;

    this.#mountNode.style.width = `${Math.max(width, 1)}px`;
    this.#mountNode.style.height = `${Math.max(height, 1)}px`;
    this.#stage.size({ width: Math.max(width, 1), height: Math.max(height, 1) });

    const sceneScale = Math.min(width / this.#sceneMetrics.width, height / this.#sceneMetrics.height);
    this.#sceneMetrics.scale = sceneScale;
    this.#sceneMetrics.offsetX = (width - this.#sceneMetrics.width * sceneScale) / 2;
    this.#sceneMetrics.offsetY = (height - this.#sceneMetrics.height * sceneScale) / 2;

    this.#sceneGroup.setAttrs({
      x: this.#sceneMetrics.offsetX,
      y: this.#sceneMetrics.offsetY,
      scaleX: sceneScale,
      scaleY: sceneScale,
    });

    this.#overlaySceneGroup.setAttrs({
      x: this.#sceneMetrics.offsetX,
      y: this.#sceneMetrics.offsetY,
      scaleX: sceneScale,
      scaleY: sceneScale,
    });

    if (this.#isCropMode) {
      this.#refreshCropOverlay();
    }

    this.#requestDraw();
  }

  #getExportCropRect() {
    const region = this.#backgroundAsset?.exportRegion;
    if (!region) {
      return {
        x: 0,
        y: 0,
        width: this.#stage.width(),
        height: this.#stage.height(),
      };
    }

    return {
      x: this.#sceneMetrics.offsetX + this.#sceneMetrics.width * region.x * this.#sceneMetrics.scale,
      y: this.#sceneMetrics.offsetY + this.#sceneMetrics.height * region.y * this.#sceneMetrics.scale,
      width: this.#sceneMetrics.width * region.width * this.#sceneMetrics.scale,
      height: this.#sceneMetrics.height * region.height * this.#sceneMetrics.scale,
    };
  }

  #normalizeCropState({ sourceWidth, sourceHeight, cropX, cropY, cropWidth, cropHeight }) {
    const safeSourceWidth = Math.max(Number(sourceWidth) || 1, 1);
    const safeSourceHeight = Math.max(Number(sourceHeight) || 1, 1);
    const minWidth = Math.min(MIN_CROP_SIZE, safeSourceWidth);
    const minHeight = Math.min(MIN_CROP_SIZE, safeSourceHeight);
    const nextCropX = clamp(Number(cropX ?? 0), 0, safeSourceWidth - minWidth);
    const nextCropY = clamp(Number(cropY ?? 0), 0, safeSourceHeight - minHeight);
    const nextCropWidth = clamp(Number(cropWidth ?? safeSourceWidth), minWidth, safeSourceWidth - nextCropX);
    const nextCropHeight = clamp(Number(cropHeight ?? safeSourceHeight), minHeight, safeSourceHeight - nextCropY);

    return {
      sourceWidth: safeSourceWidth,
      sourceHeight: safeSourceHeight,
      cropX: nextCropX,
      cropY: nextCropY,
      cropWidth: nextCropWidth,
      cropHeight: nextCropHeight,
    };
  }

  #getNodeCropState(node) {
    const image = node.image();
    const sourceWidth = node.getAttr('sourceWidth') ?? image?.naturalWidth ?? image?.width ?? node.width();
    const sourceHeight = node.getAttr('sourceHeight') ?? image?.naturalHeight ?? image?.height ?? node.height();
    const crop = node.crop();

    return this.#normalizeCropState({
      sourceWidth,
      sourceHeight,
      cropX: crop?.x ?? 0,
      cropY: crop?.y ?? 0,
      cropWidth: crop?.width ?? node.width(),
      cropHeight: crop?.height ?? node.height(),
    });
  }

  #applyNodeCropState(node, cropState) {
    const normalized = this.#normalizeCropState(cropState);
    node.setAttrs({
      width: normalized.cropWidth,
      height: normalized.cropHeight,
      offsetX: normalized.cropWidth / 2,
      offsetY: normalized.cropHeight / 2,
      sourceWidth: normalized.sourceWidth,
      sourceHeight: normalized.sourceHeight,
    });
    node.crop({
      x: normalized.cropX,
      y: normalized.cropY,
      width: normalized.cropWidth,
      height: normalized.cropHeight,
    });
    return normalized;
  }

  #createNodeSnapshot(node) {
    return {
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
      crop: this.#getNodeCropState(node),
    };
  }

  #restoreNodeSnapshot(node, snapshot) {
    if (!snapshot) {
      return;
    }

    node.position({
      x: snapshot.x,
      y: snapshot.y,
    });
    node.rotation(snapshot.rotation);
    node.scaleX(snapshot.scaleX);
    node.scaleY(snapshot.scaleY);
    this.#applyNodeCropState(node, snapshot.crop);
  }

  #setAllNodesDraggable(draggable) {
    this.#compositionGroup?.getChildren().forEach((node) => {
      node.draggable(draggable);
    });
  }

  #refreshCropOverlay() {
    if (!this.#cropOverlay) {
      return;
    }

    if (!this.#isCropMode || !this.#selectedNode) {
      this.#cropOverlay.hide();
      return;
    }

    const node = this.#selectedNode;
    const crop = this.#getNodeCropState(node);
    const left = -crop.cropWidth / 2;
    const right = crop.cropWidth / 2;
    const top = -crop.cropHeight / 2;
    const bottom = crop.cropHeight / 2;

    this.#cropOverlay.setAttrs({
      visible: true,
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
    });

    this.#cropSourceRect.setAttrs({
      x: left - crop.cropX,
      y: top - crop.cropY,
      width: crop.sourceWidth,
      height: crop.sourceHeight,
    });

    this.#cropFrameRect.setAttrs({
      x: left,
      y: top,
      width: crop.cropWidth,
      height: crop.cropHeight,
    });

    const handlePositions = {
      'top-left': { x: left, y: top },
      top: { x: 0, y: top },
      'top-right': { x: right, y: top },
      right: { x: right, y: 0 },
      'bottom-right': { x: right, y: bottom },
      bottom: { x: 0, y: bottom },
      'bottom-left': { x: left, y: bottom },
      left: { x: left, y: 0 },
    };

    this.#cropHandles.forEach((handle, handleId) => {
      const point = handlePositions[handleId];
      handle.setAttrs({
        x: point.x,
        y: point.y,
        scaleX: 1 / Math.max(node.scaleX(), 0.001),
        scaleY: 1 / Math.max(node.scaleY(), 0.001),
      });
    });
  }

  #beginCropDrag(handleId) {
    if (!this.#isCropMode || !this.#selectedNode) {
      return;
    }

    this.#activeCropHandle = handleId;
    this.#cropDragOrigin = handleId === 'move'
      ? this.#getCropLocalPointerPosition()
      : null;
    this.#cropDragOriginCrop = handleId === 'move'
      ? this.#getNodeCropState(this.#selectedNode)
      : null;
    this.#mountNode.classList.add('is-dragging');
    this.#mountNode.style.cursor = handleId === 'move'
      ? 'grabbing'
      : CROP_HANDLE_CURSORS[handleId] ?? 'crosshair';
  }

  #handleCropDragMove() {
    if (!this.#activeCropHandle || !this.#selectedNode) {
      return;
    }

    const pointer = this.#getCropLocalPointerPosition();
    if (!pointer) {
      return;
    }

    if (this.#activeCropHandle === 'move') {
      if (!this.#cropDragOrigin || !this.#cropDragOriginCrop) {
        return;
      }

      this.#applyCropTranslation(this.#selectedNode, this.#cropDragOriginCrop, {
        x: pointer.x - this.#cropDragOrigin.x,
        y: pointer.y - this.#cropDragOrigin.y,
      });
      return;
    }

    const crop = this.#getNodeCropState(this.#selectedNode);
    const minWidth = Math.min(MIN_CROP_SIZE, crop.sourceWidth);
    const minHeight = Math.min(MIN_CROP_SIZE, crop.sourceHeight);
    const left = -crop.cropWidth / 2;
    const right = crop.cropWidth / 2;
    const top = -crop.cropHeight / 2;
    const bottom = crop.cropHeight / 2;
    const availableLeft = crop.cropX;
    const availableRight = crop.sourceWidth - crop.cropX - crop.cropWidth;
    const availableTop = crop.cropY;
    const availableBottom = crop.sourceHeight - crop.cropY - crop.cropHeight;

    const nextBox = { left, right, top, bottom };

    if (this.#activeCropHandle.includes('left')) {
      nextBox.left = clamp(pointer.x, left - availableLeft, right - minWidth);
    }

    if (this.#activeCropHandle.includes('right')) {
      nextBox.right = clamp(pointer.x, left + minWidth, right + availableRight);
    }

    if (this.#activeCropHandle.includes('top')) {
      nextBox.top = clamp(pointer.y, top - availableTop, bottom - minHeight);
    }

    if (this.#activeCropHandle.includes('bottom')) {
      nextBox.bottom = clamp(pointer.y, top + minHeight, bottom + availableBottom);
    }

    this.#applyCropBox(this.#selectedNode, nextBox);
  }

  #finishCropDrag() {
    if (!this.#activeCropHandle) {
      return;
    }

    const lastHandle = this.#activeCropHandle;
    this.#activeCropHandle = '';
    this.#cropDragOrigin = null;
    this.#cropDragOriginCrop = null;
    this.#mountNode.classList.remove('is-dragging');
    this.#mountNode.style.cursor = this.#isCropMode
      ? (lastHandle === 'move' ? CROP_HANDLE_CURSORS.move : 'crosshair')
      : 'default';
    this.#emitSelectionChange();
    this.#requestDraw();
  }

  #getCropLocalPointerPosition() {
    const pointer = this.#stage?.getPointerPosition();
    if (!pointer || !this.#cropOverlay?.isVisible()) {
      return null;
    }

    const transform = this.#cropOverlay.getAbsoluteTransform().copy();
    transform.invert();
    return transform.point(pointer);
  }

  #applyCropBox(node, nextBox) {
    const current = this.#getNodeCropState(node);
    const currentBox = {
      left: -current.cropWidth / 2,
      right: current.cropWidth / 2,
      top: -current.cropHeight / 2,
      bottom: current.cropHeight / 2,
    };

    const requestedTrimLeft = nextBox.left - currentBox.left;
    const requestedTrimRight = currentBox.right - nextBox.right;
    const requestedTrimTop = nextBox.top - currentBox.top;
    const requestedTrimBottom = currentBox.bottom - nextBox.bottom;
    const nextCrop = this.#normalizeCropState({
      sourceWidth: current.sourceWidth,
      sourceHeight: current.sourceHeight,
      cropX: current.cropX + requestedTrimLeft,
      cropY: current.cropY + requestedTrimTop,
      cropWidth: current.cropWidth - requestedTrimLeft - requestedTrimRight,
      cropHeight: current.cropHeight - requestedTrimTop - requestedTrimBottom,
    });
    const actualTrimLeft = nextCrop.cropX - current.cropX;
    const actualTrimTop = nextCrop.cropY - current.cropY;
    const actualTrimRight = (current.cropX + current.cropWidth) - (nextCrop.cropX + nextCrop.cropWidth);
    const actualTrimBottom = (current.cropY + current.cropHeight) - (nextCrop.cropY + nextCrop.cropHeight);
    const localDelta = {
      x: (actualTrimLeft - actualTrimRight) / 2,
      y: (actualTrimTop - actualTrimBottom) / 2,
    };
    const sceneDelta = this.#translateLocalDeltaToScene(node, localDelta);

    node.position({
      x: node.x() + sceneDelta.x,
      y: node.y() + sceneDelta.y,
    });
    this.#applyNodeCropState(node, nextCrop);
    this.#refreshCropOverlay();
    this.#requestDraw();
  }

  #applyCropTranslation(node, originCrop, delta) {
    const nextCrop = this.#normalizeCropState({
      sourceWidth: originCrop.sourceWidth,
      sourceHeight: originCrop.sourceHeight,
      cropX: originCrop.cropX + delta.x,
      cropY: originCrop.cropY + delta.y,
      cropWidth: originCrop.cropWidth,
      cropHeight: originCrop.cropHeight,
    });

    this.#applyNodeCropState(node, nextCrop);
    this.#refreshCropOverlay();
    this.#requestDraw();
  }

  #translateLocalDeltaToScene(node, delta) {
    const radians = (node.rotation() * Math.PI) / 180;
    const scaledX = delta.x * node.scaleX();
    const scaledY = delta.y * node.scaleY();

    return {
      x: scaledX * Math.cos(radians) - scaledY * Math.sin(radians),
      y: scaledX * Math.sin(radians) + scaledY * Math.cos(radians),
    };
  }

  #resetCropMode({ restore = false, silent = false } = {}) {
    const node = this.#selectedNode;
    this.#finishCropDrag();

    if (restore && node && this.#cropSnapshot) {
      this.#restoreNodeSnapshot(node, this.#cropSnapshot);
    }

    this.#isCropMode = false;
    this.#cropSnapshot = null;
    this.#cropOverlay?.hide();
    this.#setAllNodesDraggable(true);
    this.#mountNode.classList.remove('is-cropping');
    this.#mountNode.classList.remove('is-dragging');
    this.#mountNode.style.cursor = 'default';
    this.#transformer.nodes(node ? [node] : []);
    this.#emitSelectionChange();

    if (!silent) {
      this.#requestDraw();
    } else {
      this.#requestDraw();
    }
  }

  #emitSelectionChange() {
    this.#onSelectionChange?.(this.getSelectionState());
  }

  #emitLayersChange() {
    this.#onLayersChange?.(this.getLayersState());
  }

  #requestDraw() {
    this.#mainLayer?.batchDraw();
    this.#overlayLayer?.batchDraw();
  }

  #setStatus(message) {
    this.#onStatusChange?.(message);
  }

  #setStatusByKey(key, values = {}) {
    this.#setStatus(this.#formatMessage(key, values));
  }

  #createNodeMetadata(instanceIndex = null) {
    const nextIndex = instanceIndex ?? this.#nodeSequence + 1;
    this.#nodeSequence = Math.max(this.#nodeSequence, nextIndex);
    return {
      id: `specimen-${nextIndex}`,
      instanceIndex: nextIndex,
    };
  }

  #getAssetLabel(assetId) {
    return this.#resolveAssetLabel?.(assetId) ?? assetId;
  }

  #getNodeLabel(node) {
    return this.#getAssetLabel(node.getAttr('assetId'));
  }

  #findNodeById(nodeId) {
    return this.#compositionGroup.getChildren().find((node) => node.id() === nodeId) ?? null;
  }
}
