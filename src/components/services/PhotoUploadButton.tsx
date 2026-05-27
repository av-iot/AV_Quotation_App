"use client";
import { useRef, useState } from "react";
import { Camera, Loader2, X, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadServicePhoto, type PhotoMeta } from "@/lib/photoUpload";
import type { PhotoPhase } from "@/lib/checklistTasks";
import { PHOTO_PHASE_CONFIG } from "@/lib/checklistTasks";

interface Props {
  phase:         PhotoPhase;
  taskId:        string;
  suggestions:   string[];
  existingPhotos: PhotoMeta[];
  onUploaded:    (photo: PhotoMeta) => void;
  onRemove:      (storagePath: string) => void;
  uploadContext: {
    projectNo:   string;
    projectName: string;
    planNo:      string;
    serviceDate: string;
    uploaderName:string;
    uploadedBy:  string;
  };
  disabled?: boolean;
}

export default function PhotoUploadButton({
  phase, taskId, suggestions, existingPhotos, onUploaded, onRemove, uploadContext, disabled,
}: Props) {
  const inputRef   = useRef<HTMLInputElement>(null);
  const [comment,  setComment]  = useState("");
  const [loading,  setLoading]  = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [preview,  setPreview]  = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const cfg = PHOTO_PHASE_CONFIG[phase];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url); setPendingFile(file);
    setComment(""); setShowInput(true);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleUpload = async () => {
    if (!pendingFile) return;
    setLoading(true);
    try {
      const photo = await uploadServicePhoto({
        file: pendingFile,
        comment: comment || phase,
        taskId, phase,
        ...uploadContext,
      });
      onUploaded(photo);
      setPreview(null); setPendingFile(null); setComment(""); setShowInput(false);
    } catch (err: any) {
      alert("Upload failed: " + (err?.message || "Unknown error"));
    } finally { setLoading(false); }
  };

  const cancel = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null); setPendingFile(null); setComment(""); setShowInput(false);
  };

  return (
    <div className={cn("rounded-xl border p-2.5 space-y-2", cfg.bg)}>
      {/* Phase label */}
      <div className="flex items-center justify-between">
        <span className={cn("text-[10px] font-black uppercase tracking-widest", cfg.color)}>{cfg.label}</span>
        <span className="text-[9px] text-muted-foreground">{existingPhotos.length} photo{existingPhotos.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Existing photos strip */}
      {existingPhotos.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {existingPhotos.map((p, i) => (
            <div key={i} className="relative group">
              <img
                src={p.url} alt={p.comment}
                className="h-14 w-14 rounded-lg object-cover border border-border/50 cursor-pointer"
                onClick={() => setLightbox(p.url)}
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg transition-colors flex items-center justify-center">
                <ZoomIn className="h-3.5 w-3.5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              {!disabled && (
                <button
                  onClick={() => onRemove(p.storagePath)}
                  className="absolute -top-1 -right-1 h-4 w-4 bg-destructive rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-2.5 w-2.5 text-white" />
                </button>
              )}
              {p.comment && (
                <div className="absolute bottom-0 inset-x-0 bg-black/60 rounded-b-lg px-1 py-0.5">
                  <p className="text-[8px] text-white truncate">{p.comment}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Preview + comment before upload */}
      {showInput && preview && (
        <div className="space-y-2">
          <div className="relative">
            <img src={preview} alt="Preview" className="w-full h-28 object-cover rounded-lg border border-border/50" />
            <button onClick={cancel} className="absolute top-1 right-1 h-6 w-6 bg-black/60 rounded-full flex items-center justify-center">
              <X className="h-3.5 w-3.5 text-white" />
            </button>
          </div>
          {/* Comment field + suggestions */}
          <div className="space-y-1.5">
            <input
              type="text"
              value={comment}
              onChange={e => setComment(e.target.value)}
              maxLength={40}
              placeholder="Add a short comment (2–5 words)…"
              className="w-full text-xs rounded-lg border border-border/60 bg-background px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/50"
            />
            {/* Suggestion chips */}
            <div className="flex flex-wrap gap-1">
              {suggestions.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setComment(s)}
                  className={cn(
                    "text-[9px] font-semibold px-1.5 py-0.5 rounded-full border transition-colors",
                    comment === s
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border/60 text-muted-foreground hover:bg-muted"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              onClick={handleUpload}
              disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              {loading ? "Uploading…" : "Upload Photo"}
            </button>
          </div>
        </div>
      )}

      {/* Add photo button */}
      {!showInput && !disabled && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 border-dashed border-current/30 text-xs font-bold opacity-70 hover:opacity-100 hover:bg-white/40 transition-all"
        >
          <Camera className="h-3.5 w-3.5" /> Add {cfg.label} Photo
        </button>
      )}

      <input
        ref={inputRef} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={handleFileChange}
      />

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[999] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button className="absolute top-4 right-4 text-white" onClick={() => setLightbox(null)}>
            <X className="h-6 w-6" />
          </button>
          <img src={lightbox} alt="Full size" className="max-w-full max-h-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
