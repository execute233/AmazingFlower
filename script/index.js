// ================================
// 主入口文件：index.js
// 负责初始化整个押花工作室应用
// ================================
import 'konva';

// 导入核心模块
import { createAssetCatalog } from '@app/config/asset-catalog.js'; // 素材目录管理
import { AssetLoader } from '@app/core/asset-loader.js'; // 资源加载器
import { PressedFlowerStudio } from '@app/editor/PressedFlowerStudio.js'; // 编辑器核心
import { I18nService, syncLocaleSelect } from '@app/i18n/I18nService.js'; // 国际化服务
import { renderLayerList } from '@app/ui/render-layer-list.js'; // 图层列表渲染
import { renderAssetPalette } from '@app/ui/render-palette.js'; // 素材调色板渲染
import { bindToolbar, updateToolbarState } from '@app/ui/toolbar.js'; // 工具栏绑定

/**
 * 断言元素为 HTMLElement 的辅助函数
 * @param {*} element - 要检查的元素
 * @param {string} message - 错误消息
 * @returns {HTMLElement} - 转换后的 HTMLElement
 */
function assertHTMLElement(element, message) {
    if (!(element instanceof HTMLElement)) {
        throw new Error(message);
    }

    return element;
}

/**
 * 更新状态栏文本
 * @param {HTMLElement} statusNode - 状态栏 DOM 节点
 * @param {string} message - 要显示的消息
 */
function updateStatus(statusNode, message) {
    statusNode.textContent = message;
}

/**
 * 从拖拽事件中解析素材 ID
 * 支持多种数据格式以确保兼容性
 * @param {DragEvent} event - 拖拽事件对象
 * @returns {string} - 素材 ID
 */
function resolveDraggedAssetId(event) {
    return event.dataTransfer?.getData('application/x-amazing-flower-asset')
        || event.dataTransfer?.getData('text/plain')
        || '';
}

/**
 * 下载 Blob 对象为文件
 * @param {string} fileName - 文件名
 * @param {Blob} blob - 要下载的 Blob 数据
 */
function downloadBlob(fileName, blob) {
    const url = URL.createObjectURL(blob); // 创建临时 URL
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click(); // 触发下载
    setTimeout(() => URL.revokeObjectURL(url), 0); // 清理 URL
}

/**
 * 生成带时间戳的导出文件名
 * 格式：baseName-YYYYMMDDHHmmss.extension
 * @param {string} baseName - 基础文件名
 * @param {string} extension - 文件扩展名
 * @returns {string} - 完整的文件名
 */
function createExportFileName(baseName, extension) {
    const now = new Date();
    const parts = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0'),
    ];

    return `${baseName}-${parts.join('')}.${extension}`;
}

/**
 * 将 Data URL 转换为 Blob 对象
 * @param {string} dataUrl - Data URL 字符串
 * @returns {Promise<Blob>} - Blob 对象
 */
async function dataUrlToBlob(dataUrl) {
    const response = await fetch(dataUrl);
    return response.blob();
}

/**
 * 创建素材调色板的提示消息对象
 * @param {I18nService} i18n - 国际化服务实例
 * @returns {Object} - 包含各种提示消息的对象
 */
function createPaletteMessages(i18n) {
    return {
        libraryTitle: i18n.t('studio.assetLibrary'),
        folderHint: i18n.t('studio.folderHint'),
        pickFolder: i18n.t('studio.folderEmpty'),
        loading: i18n.t('studio.folderLoading'),
        empty: i18n.t('studio.folderEmpty'),
        folderCount: (count) => i18n.t('studio.folderAssetCount', { count }),
        addAsset: (label) => i18n.t('studio.addAsset', { label }),
    };
}

/**
 * 统一的应用错误处理函数
 * @param {HTMLElement} statusNode - 状态栏 DOM 节点
 * @param {I18nService} i18n - 国际化服务实例
 * @param {Error|unknown} error - 错误对象
 */
function handleAppError(statusNode, i18n, error) {
    console.error(error);
    updateStatus(
        statusNode,
        i18n.t('status.loadFailed', {
            message: error instanceof Error ? error.message : i18n.t('status.initFailed'),
        }),
    );
}

/**
 * 绑定画布放置区域的拖拽事件
 * 支持从素材面板拖拽素材到画布
 * @param {HTMLElement} dropZone - 放置区域 DOM 节点
 * @param {PressedFlowerStudio} studio - 工作室实例
 * @param {AssetCatalog} catalog - 素材目录实例
 * @param {HTMLElement} statusNode - 状态栏 DOM 节点
 * @param {I18nService} i18n - 国际化服务实例
 */
function bindDropZone(dropZone, studio, catalog, statusNode, i18n) {
    // 激活/取消激活放置区域的视觉反馈
    const activate = () => dropZone.classList.add('is-drop-target');
    const deactivate = () => dropZone.classList.remove('is-drop-target');

    dropZone.addEventListener('dragenter', (event) => {
        event.preventDefault();
        activate();
    });

    dropZone.addEventListener('dragover', (event) => {
        event.preventDefault();
        activate();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'copy';
        }
    });

    dropZone.addEventListener('dragleave', (event) => {
        if (!dropZone.contains(event.relatedTarget)) {
            deactivate();
        }
    });

    dropZone.addEventListener('drop', async (event) => {
        event.preventDefault();
        deactivate();

        const assetId = resolveDraggedAssetId(event);
        if (!assetId) {
            return;
        }

        try {
            const asset = await catalog.getAsset(assetId);
            if (!asset) {
                return;
            }

            await studio.addAsset(asset, {
                position: studio.toStagePoint({ clientX: event.clientX, clientY: event.clientY }),
            });
        } catch (error) {
            handleAppError(statusNode, i18n, error);
        }
    });
}

function bindKeyboardShortcuts(studio) {
    window.addEventListener('keydown', (event) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.closest('input, textarea, select, button')) {
            return;
        }

        if (studio.isCropModeActive()) {
            switch (event.key) {
                case 'Enter':
                    if (studio.commitCropSelection()) {
                        event.preventDefault();
                    }
                    break;
                case 'Escape':
                    if (studio.cancelCropSelection()) {
                        event.preventDefault();
                    }
                    break;
                default:
                    break;
            }
            return;
        }

        const primaryModifier = event.ctrlKey || event.metaKey;
        const nudgeStep = event.shiftKey ? 24 : 12;

        if (primaryModifier && event.key.toLowerCase() === 'd') {
            if (studio.duplicateSelection()) {
                event.preventDefault();
            }
            return;
        }

        switch (event.key) {
            case 'Delete':
            case 'Backspace':
                if (studio.removeSelection()) {
                    event.preventDefault();
                }
                break;
            case 'Escape':
                studio.clearSelection();
                break;
            case 'ArrowUp':
                if (studio.nudgeSelection(0, -nudgeStep)) {
                    event.preventDefault();
                }
                break;
            case 'ArrowDown':
                if (studio.nudgeSelection(0, nudgeStep)) {
                    event.preventDefault();
                }
                break;
            case 'ArrowLeft':
                if (studio.nudgeSelection(-nudgeStep, 0)) {
                    event.preventDefault();
                }
                break;
            case 'ArrowRight':
                if (studio.nudgeSelection(nudgeStep, 0)) {
                    event.preventDefault();
                }
                break;
            default:
                break;
        }
    });
}

async function main() {
    // ==================== 1. 获取 DOM 元素引用 ====================
    const stageHost = assertHTMLElement(document.querySelector('[data-stage-host]'), '缺少画布容器。');
    const dropZone = assertHTMLElement(document.querySelector('[data-stage-dropzone]'), '缺少放置区域。');
    const paletteNode = assertHTMLElement(document.querySelector('[data-asset-palette]'), '缺少素材面板。');
    const layerListNode = assertHTMLElement(document.querySelector('[data-layer-list]'), '缺少图层栏。');
    const toolbarNode = assertHTMLElement(document.querySelector('[data-toolbar]'), '缺少工具栏。');
    const statusNode = assertHTMLElement(document.querySelector('[data-status]'), '缺少状态栏。');
    const localeSelect = document.querySelector('[data-locale-select]');
    const importInput = document.querySelector('[data-import-input]');

    // ==================== 2. 初始化国际化服务 ====================
    const i18n = new I18nService({
        translationsUrl: new URL('../data/i18n/translations.json', import.meta.url).href,
    });
    await i18n.initialize();

    updateStatus(statusNode, i18n.t('status.loading'));

    // ==================== 3. 加载素材目录和资源 ====================
    const catalog = await createAssetCatalog(); // 创建素材目录管理器
    const assetLoader = new AssetLoader(); // 创建资源加载器

    // 背景异步预加载（不阻塞主初始化）
    const bgLoaderElem = document.querySelector('[data-bg-loader]');
    const backgroundSrc = catalog.getBackgroundAsset().src;
    const backgroundPreload = assetLoader.preloadAll([backgroundSrc]);

    // 素材文件夹状态管理
    let activeFolderId = null; // 当前打开的文件夹 ID
    let activeFolderAssets = []; // 当前文件夹的素材列表
    let isLoadingFolder = false; // 是否正在加载文件夹

    // ==================== 4. 创建编辑器实例 ====================
    const studio = new PressedFlowerStudio({
        mountNode: stageHost, // 画布容器
        frameNode: dropZone, // 放置区域容器
        assetLoader, // 资源加载器
        resolveAssetLabel: (assetId) => i18n.label(assetId, {}, assetId), // 获取素材显示名称
        formatLayerLabel: ({ label, instanceIndex }) => i18n.t('layer.itemLabel', {
            label,
            index: String(instanceIndex).padStart(2, '0'), // 图层编号格式化为两位数
        }),
        formatMessage: (key, values = {}) => i18n.t(key, values), // 格式化消息
        // 选择状态变化时的回调
        onSelectionChange: (selectionState) => {
            updateToolbarState(toolbarNode, selectionState, {
                emptyLabel: i18n.t('toolbar.selectionNone'),
                formatSelection: ({ label, rotation, isCropping }) => (isCropping
                    ? i18n.t('toolbar.selectionCropping', { label, rotation })
                    : i18n.t('toolbar.selectionSummary', { label, rotation })),
            });
        },
        // 图层变化时的回调 - 重新渲染图层列表
        onLayersChange: (layers) => {
            renderLayerList({
                mountNode: layerListNode,
                layers,
                emptyLabel: i18n.t('layer.empty'),
                onSelect: (layerId) => {
                    studio.selectLayer(layerId); // 点击图层选中对应对象
                },
                onReorder: (layerId, targetIndex) => {
                    studio.reorderLayer(layerId, targetIndex); // 拖拽重排图层
                },
            });
        },
        // 状态消息变化时的回调
        onStatusChange: (message) => {
            updateStatus(statusNode, message);
        },
    });

    // 初始化编辑器（创建 Konva Stage，不阻塞背景加载）
    await studio.initialize();

    // 显示背景加载提示，直到背景资源就绪并设置到编辑器
    try {
        if (bgLoaderElem) bgLoaderElem.classList.add('is-loading');
        await backgroundPreload;
        await studio.setBackground(catalog.getBackgroundAsset());
        updateStatus(statusNode, i18n.t('status.assetsReady'));
    } catch (error) {
        // 背景加载失败不阻塞主应用，但记录并显示提示
        handleAppError(statusNode, i18n, error);
    } finally {
        if (bgLoaderElem) bgLoaderElem.classList.remove('is-loading');
    }

    // ==================== 5. 定义素材调色板渲染函数 ====================
    const renderPalette = () => {
        renderAssetPalette({
            mountNode: paletteNode,
            groups: catalog.getGroups(), // 所有素材分组
            activeFolder: activeFolderId ? catalog.getFolder(activeFolderId) : null, // 当前激活的文件夹
            assets: activeFolderAssets, // 当前文件夹的素材列表
            isLoading: isLoadingFolder, // 是否正在加载
            onFolderOpen: openFolder, // 打开文件夹回调
            onAssetAdd: addAssetById, // 添加素材回调
            getLabel: (id) => i18n.label(id, {}, id), // 获取标签文本
            messages: createPaletteMessages(i18n), // UI 提示消息
        });
    };

    /**
     * 通过素材 ID 添加素材到画布
     * @param {string} assetId - 素材 ID
     * @param {Object} options - 添加选项（位置、状态等）
     */
    async function addAssetById(assetId, options = {}) {
        const asset = await catalog.getAsset(assetId);
        if (!asset) {
            return;
        }

        await studio.addAsset(asset, options);
    }

    /**
     * 打开文件夹并懒加载素材
     * @param {string} folderId - 文件夹 ID
     */
    async function openFolder(folderId) {
        // 如果已经是当前文件夹，则跳过
        if (activeFolderId === folderId && activeFolderAssets.length) {
            return;
        }

        activeFolderId = folderId;
        isLoadingFolder = true;
        renderPalette(); // 显示加载状态

        try {
            // 懒加载：只有打开文件夹时才加载该文件夹的素材清单
            activeFolderAssets = await catalog.getFolderAssets(folderId);
            updateStatus(statusNode, i18n.t('status.folderLoaded', { label: i18n.label(folderId, {}, folderId) }));
        } catch (error) {
            handleAppError(statusNode, i18n, error);
        } finally {
            isLoadingFolder = false;
            renderPalette(); // 渲染素材列表
        }
    }

    // ==================== 6. 绑定工具栏事件 ====================
    bindToolbar({
        root: toolbarNode,
        actions: {
            // 图层操作
            'move-up': () => {
                studio.moveSelectionUp(); // 上移图层
            },
            'move-down': () => {
                studio.moveSelectionDown(); // 下移图层
            },
            duplicate: () => {
                studio.duplicateSelection(); // 复制选中素材
            },
            crop: () => {
                studio.startCropSelection(); // 进入裁剪模式
            },
            'crop-apply': () => {
                studio.commitCropSelection(); // 确认裁剪
            },
            'crop-reset': () => {
                studio.resetCropSelection(); // 预览恢复完整裁剪范围
            },
            'crop-cancel': () => {
                studio.cancelCropSelection(); // 取消裁剪
            },
            'reset-rotation': () => {
                studio.resetSelectionRotation(); // 重设为 0 度
            },
            remove: () => {
                studio.removeSelection(); // 移除选中素材
            },
            'clear-canvas': () => {
                if (!window.confirm(i18n.t('confirm.clearCanvas'))) {
                    return;
                }

                studio.clearComposition(); // 清空画布
            },
            // 文件操作
            'import-json': () => {
                if (importInput instanceof HTMLInputElement) {
                    importInput.click(); // 触发文件选择
                }
            },
            'export-json': async () => {
                // 序列化当前作品为 JSON 并下载
                const blob = new Blob([
                    JSON.stringify(
                        studio.serializeComposition({
                            locale: i18n.getLocale(),
                            exportedAt: new Date().toISOString(),
                        }),
                        null,
                        2,
                    ),
                ], { type: 'application/json' });

                downloadBlob(createExportFileName('amazing-flower-layout', 'amazing-flower.json'), blob);
                updateStatus(statusNode, i18n.t('status.exportJsonDone'));
            },
            'export-image': async () => {
                // 导出作品为 PNG 图片（4 倍分辨率）
                const imageBlob = await dataUrlToBlob(studio.exportCompositionImage({ pixelRatio: 4 }));
                downloadBlob(createExportFileName('amazing-flower-bookmark', 'png'), imageBlob);
                updateStatus(statusNode, i18n.t('status.exportImageDone'));
            },
        },
    });

    // ==================== 7. 绑定导入文件输入框事件 ====================
    if (importInput instanceof HTMLInputElement) {
        importInput.addEventListener('change', async () => {
            const [file] = importInput.files ?? [];
            if (!file) {
                return;
            }

            try {
                // 读取并解析 JSON 文件
                const content = await file.text();
                const document = JSON.parse(content);
                // 加载作品到画布
                await studio.loadComposition(document, {
                    resolveAssetById: (assetId) => catalog.getAsset(assetId),
                });
            } catch (error) {
                updateStatus(statusNode, i18n.t('status.importFailed', {
                    message: error instanceof Error ? error.message : String(error),
                }));
            } finally {
                importInput.value = ''; // 重置输入框以便重复导入同一文件
            }
        });
    }

    // ==================== 8. 绑定全局交互事件 ====================
    bindDropZone(dropZone, studio, catalog, statusNode, i18n); // 画布拖拽放置
    bindKeyboardShortcuts(studio); // 键盘快捷键

    // ==================== 9. 国际化相关逻辑 ====================
    /**
     * 应用翻译并刷新所有 UI 组件
     */
    const applyTranslations = () => {
        if (localeSelect instanceof HTMLSelectElement) {
            syncLocaleSelect(localeSelect, i18n); // 同步语言选择器选项
        }

        i18n.applyTo(document); // 应用所有 data-i18n 元素的翻译
        studio.refreshPresentation(); // 刷新编辑器显示文本
        renderPalette(); // 重新渲染素材面板
    };

    // 监听语言切换事件
    if (localeSelect instanceof HTMLSelectElement) {
        localeSelect.addEventListener('change', () => {
            i18n.setLocale(localeSelect.value); // 设置新语言
        });
    }

    i18n.addEventListener('change', applyTranslations);
    applyTranslations(); // 初始化时应用一次
    updateStatus(statusNode, i18n.t('status.assetsReady')); // 显示就绪状态
}

// ==================== 10. 启动应用 ====================
// 执行主函数并捕获错误
main().catch((error) => {
    const statusNode = document.querySelector('[data-status]');
    console.error(error);
    if (statusNode instanceof HTMLElement) {
        statusNode.textContent = error instanceof Error ? error.message : '应用初始化失败。';
    }
});
