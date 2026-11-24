# YOLO 训练与评测说明

## 定位：YOLO 是骨干，不是创新点

答辩通知明确写了“不能把用了 YOLO / AI 当创新”。因此本项目的贡献表述为：

1. **可控数据集构造**：缺陷类型（划痕 / 缺口 / 污渍）× 光照工况（均匀 / 渐变 / 局部反光）× 随机角度，程序化生成且带像素级真值，可无限扩展。
2. **极坐标先验流程**：环形 ROI 展开把旋转不变性显式编码进数据表示；可作为 YOLO 输入增强通道，也可独立作为零训练基线。
3. **双引擎可解释对照**：同一张样本上同时给出 YOLO 检测结果与规则方法结果，用消融证明各自适用边界。

YOLO 只是完成“检测”这一环节的工具，换成其他检测器不影响上述贡献。

## 1. 生成数据集

```bash
node src/make_yolo_dataset.js 800
```

输出：

```
dataset/yolo/
├── images/{train,val}/*.png      # 128×128 灰度图（RGB 编码）
├── labels/{train,val}/*.txt      # YOLO 归一化标签 class cx cy w h
├── data.yaml
├── classes.txt
└── manifest.csv                  # 种子 / 类型 / 光照 / 真值框
```

800 张按 4:1 划分为 640 train / 160 val；三类缺陷各 200 个标注对象，另有 200 张正常样本（空标签）。

## 2. 训练

```bash
pip install -r requirements-yolo.txt
python train_yolo.py --epochs 80 --imgsz 640 --batch 16
```

默认使用 `yolo11n.pt` 预训练权重；`degrees=180` 适配垫片任意旋转，`hsv_v=0.25` 覆盖光照变化。训练完成后在 `runs/visionqc/washer_yolo11n/weights/best.pt`。

> 本机没有深度学习环境，上述训练未在此环境执行；交付的是可直接复现的脚本和配置。答辩中应如实说明这一点，并展示数据集与推理链路的完整性。

## 3. 导出 ONNX

```bash
python export_onnx.py --weights runs/visionqc/washer_yolo11n/weights/best.pt
```

## 4. 网页推理

打开 `studio/index.html` → 点击“载入 YOLO 模型”选择导出的 `.onnx` → 上传或拖入图片 → 点击“运行流程”。页面会从 CDN 加载 `onnxruntime-web`，完成 letterbox、归一化、推理、解码、NMS 与坐标还原。

若未载入模型，页面明确显示“YOLO 模型未载入”，并自动使用规则引擎作为基线，不会伪造 YOLO 结果。

## 5. 建议的答辩表述

> “我们没有把 YOLO 当作创新。创新在于：如何用可控数据构造覆盖真实产线难以收集的小样本缺陷，以及如何用极坐标先验把旋转不变性显式编码进表示。YOLO 负责检测，规则引擎负责可解释对照，两者在同一工作台里可以逐张比对。”
