"""Train a YOLO detector on the controllable synthetic washer dataset.

The detector is a backbone only. The project contribution is the data
construction and the polar-prior inspection pipeline, not the use of YOLO.

Usage (after `pip install -r requirements-yolo.txt`):
    python train_yolo.py --epochs 80 --imgsz 640 --batch 16
"""
import argparse
from pathlib import Path

from ultralytics import YOLO


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--weights", default="yolo11n.pt", help="pretrained weights or yaml")
    ap.add_argument("--data", default="dataset/yolo/data.yaml")
    ap.add_argument("--epochs", type=int, default=80)
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--device", default="", help="e.g. 0 / cpu; empty = auto")
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--project", default="runs/visionqc")
    ap.add_argument("--name", default="washer_yolo11n")
    args = ap.parse_args()

    if not Path(args.data).exists():
        raise SystemExit(f"dataset config not found: {args.data}\nRun: node src/make_yolo_dataset.js 800")

    model = YOLO(args.weights)
    model.train(
        data=args.data,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device or None,
        seed=args.seed,
        project=args.project,
        name=args.name,
        exist_ok=True,
        # augmentation tuned for small, low-contrast surface defects
        hsv_h=0.01, hsv_s=0.3, hsv_v=0.25,
        degrees=180, translate=0.05, scale=0.25,
        fliplr=0.5, flipud=0.5, mosaic=0.6,
        close_mosaic=10,
        patience=20,
    )
    metrics = model.val(data=args.data, imgsz=args.imgsz, device=args.device or None)
    print("\nValidation mAP50:", getattr(metrics, "map50", "n/a"))
    print("Best weights:", Path(args.project) / args.name / "weights" / "best.pt")


if __name__ == "__main__":
    main()
