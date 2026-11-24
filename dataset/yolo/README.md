# YOLO 数据集（生成物）

本目录的 `images/` 与 `labels/` 由脚本生成，已加入 `.gitignore`，不直接提交到仓库。

```bash
node src/make_yolo_dataset.js 800
```

生成后得到 640 张训练图、160 张验证图、对应 YOLO 标签、`data.yaml`、`classes.txt` 与 `manifest.csv`。固定种子保证任何人重跑都得到相同样本。

设计意图：3 类缺陷（划痕 / 缺口 / 污渍）× 3 种光照（均匀 / 渐变 / 局部反光）× 随机角度，真值精确、变量可控，用于小样本场景的可复现训练与对照实验。
