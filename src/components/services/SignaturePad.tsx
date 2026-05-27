"use client";
import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw, Check } from "lucide-react";

interface Props {
  onSave: (dataUrl: string) => void;
  existingDataUrl?: string;
  disabled?: boolean;
}

export default function SignaturePad({ onSave, existingDataUrl, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing   = useRef(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!existingDataUrl || !canvasRef.current) return;
    const img = new Image();
    img.onload = () => {
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) { ctx.clearRect(0, 0, 460, 160); ctx.drawImage(img, 0, 0); setHasStrokes(true); setSaved(true); }
    };
    img.src = existingDataUrl;
  }, [existingDataUrl]);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    drawing.current = true;
    setSaved(false);
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const { x, y } = getPos(e, canvas);
    ctx.beginPath(); ctx.moveTo(x, y);
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current || disabled) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = "#0f172a";
    const { x, y } = getPos(e, canvas);
    ctx.lineTo(x, y); ctx.stroke();
    setHasStrokes(true);
  };

  const end = () => { drawing.current = false; };

  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false); setSaved(false);
  };

  const save = () => {
    if (!canvasRef.current || !hasStrokes) return;
    onSave(canvasRef.current.toDataURL("image/png"));
    setSaved(true);
  };

  return (
    <div className="space-y-2">
      <div className={`relative border-2 rounded-xl overflow-hidden ${disabled ? "opacity-60" : "cursor-crosshair"} ${saved ? "border-emerald-400" : "border-slate-300 dark:border-slate-600"}`}>
        <canvas
          ref={canvasRef} width={460} height={160}
          className="w-full bg-white dark:bg-slate-50 touch-none"
          style={{ touchAction: "none" }}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        />
        {!hasStrokes && !disabled && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-slate-400 select-none">Sign here</p>
          </div>
        )}
        {saved && (
          <div className="absolute top-2 right-2 bg-emerald-500 text-white rounded-full h-5 w-5 flex items-center justify-center">
            <Check className="h-3 w-3" />
          </div>
        )}
      </div>
      {!disabled && (
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={clear} className="gap-1.5 text-xs h-8">
            <RotateCcw className="h-3 w-3" /> Clear
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={!hasStrokes || saved}
            className="gap-1.5 text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white flex-1">
            <Check className="h-3 w-3" /> {saved ? "Saved ✓" : "Save Signature"}
          </Button>
        </div>
      )}
    </div>
  );
}
