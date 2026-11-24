"""Export the trained YOLO weights to ONNX for the browser studio.

Usage:
    python export_onnx.py --weights runs/visionqc/washer_yolo11n/weights/best.pt

The output ONNX is loaded by studio/index.html via onnxruntime-web.
"""
import argparse
from pathlib import Path

from ultralytics import YOLO


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--weights", default="runs/visionqc/washer_yolo11n/weights/best.pt")
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--opset", type=int, default=17)
    args = ap.parse_args()

    if not Path(args.weights).exists():
        raise SystemExit(f"weights not found: {args.weights}")

    model = YOLO(args.weights)
    path = model.export(format="onnx", imgsz=args.imgsz, opset=args.opset, simplify=True)
    print("ONNX exported:", path)
    print("In studio/index.html click '载入 YOLO 模型' and select this file.")


if __name__ == "__main__":
    main()
