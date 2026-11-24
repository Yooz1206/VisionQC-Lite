# Changelog

## 1.3.0 (2026-11-24)

实拍图缺口检测升级：

- 新增 `src/chip-inspect.js`：Otsu 分割 + 圆标记纹理定位 + 凸包空缺检测，无训练、无依赖。
- 工作台新增第 5 区「实拍缺口检测」：三张实拍样例、一键自动定位圆与检测缺口、OK/NG 判定、圆心坐标与缺口框显示。
- 内置使用指南弹窗与 `docs/USER_GUIDE.md`。
- 圆十字与缺口框叠加到原图与结果图；CSV / JSON 导出增加圆与缺口字段。
- 三张实拍样例实测：样例 1 NG（圆心 277,136，缺口 3209 px / 4.55%）；样例 2、3 OK（设计性小圆角）。结果见 `reports/real_samples_result.json`。
- `build_studio.js` 现在同时内嵌算法与三张实拍样例，单文件离线可用。

## 1.2.0 (2026-11-24)

YOLO 主线升级，规则引擎保留为可解释基线。

- 新增 `src/make_yolo_dataset.js`：导出 800 张 YOLO 格式数据集（640 train / 160 val，3 类缺陷 + 正常样本，含 manifest）
- 新增 `train_yolo.py` / `export_onnx.py` / `requirements-yolo.txt` / `docs/YOLO_TRAINING.md`
- 新增 `studio/index.html` 专业工作台：上传/拖拽/批量检测、ROI 自动定位与手动调整、10 个可启停排序调参的流程模块、四路实时视图、执行日志、CSV/JSON/PNG 导出、流程配置保存/加载
- 工作台接入 onnxruntime-web：载入 YOLO ONNX 后作为主检测器，完成 letterbox / 推理 / 解码 / NMS / 坐标还原；未载入模型时明确提示并回退规则引擎
- 同一画面叠加 YOLO 结果（橙色实线）与规则基线（绿色虚线），支持逐张可解释对照
- 内核新增任意尺寸图像与参数化接口（灰度化、自动对比度、ROI 估计、极坐标展开、通用检测），原 480 图评测数字保持不变
- 创新表述调整为“可控数据构造 + 极坐标先验 + 双引擎对照”，不再把“用了 YOLO”当创新

## 1.0.0 (2026-11-24)

首个可答辩版本。

- 实现 `vision-core.js`：极坐标展开、环向循环平滑、自适应背景抑制、角度一致性滤波
- 实现三种对照方法：全局 Otsu、笛卡尔局部背景抑制、无滤波极坐标
- 实现可复现批量评测 `evaluate.js`（480 张合成图，固定种子 2026）
- 实现交互式浏览器演示 `demo/index.html`
- 生成答辩用结果图 `reports/figures/`
- 补充工程流程文档、自媒体宣发文章、开源许可
- 修复演示页在预览面板 / `file://` 下因相对路径加载 `vision-core.js` 失败的问题：
  `demo/index.html` 改为单文件自包含（算法内嵌），并新增 `src/build_demo.js` 与
  `demo/index.template.html` 便于后续重建
