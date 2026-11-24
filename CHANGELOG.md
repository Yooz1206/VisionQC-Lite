# Changelog

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
