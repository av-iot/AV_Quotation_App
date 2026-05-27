import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

export interface PhotoMeta {
  url:            string;
  storagePath:    string;
  comment:        string;
  uploadedBy:     string;
  uploadedByName: string;
  uploadedAt:     string;
  taskId:         string;
  phase:          string;
  sizeKb:         number;
}

const TARGET_KB  = 380;
const MAX_W      = 1920;
const MAX_H      = 1080;

export async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      let { width: w, height: h } = img;
      if (w > MAX_W) { h = Math.round((h * MAX_W) / w); w = MAX_W; }
      if (h > MAX_H) { w = Math.round((w * MAX_H) / h); h = MAX_H; }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);

      const toBlob = (q: number) =>
        new Promise<Blob>(r => canvas.toBlob(b => r(b!), "image/jpeg", q));

      (async () => {
        let lo = 0.30, hi = 0.92;
        let blob = await toBlob(0.78);
        for (let i = 0; i < 7; i++) {
          const mid = (lo + hi) / 2;
          blob = await toBlob(mid);
          const kb = blob.size / 1024;
          if (kb > TARGET_KB + 30) hi = mid;
          else if (kb < TARGET_KB - 80) lo = mid;
          else break;
        }
        resolve(blob);
      })().catch(reject);
    };
    img.onerror = reject;
    img.src = objUrl;
  });
}

function slug(s: string, maxWords = 4) {
  return s.trim()
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(/\s+/)
    .slice(0, maxWords)
    .join("_") || "photo";
}

export async function uploadServicePhoto(params: {
  file:          File;
  projectNo:     string;
  projectName:   string;
  planNo:        string;
  serviceDate:   string;
  taskId:        string;
  phase:         string;
  comment:       string;
  uploaderName:  string;
  uploadedBy:    string;
}): Promise<PhotoMeta> {
  const { file, projectNo, projectName, planNo, serviceDate, taskId, phase, comment, uploaderName, uploadedBy } = params;

  const compressed = await compressImage(file);
  const sizeKb     = Math.round(compressed.size / 1024);

  const safeProject = `${projectNo}_${slug(projectName, 5)}`;
  const safePlan    = `${planNo}_${serviceDate}`;
  const safeTask    = `${taskId}_${phase}`;
  const safeUser    = slug(uploaderName, 2);
  const safeComment = slug(comment, 4);
  const ts          = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName    = `${safeUser}_${ts}_${safeComment}.jpg`;

  const storagePath = `service_photos/${safeProject}/${safePlan}/${safeTask}/${fileName}`;
  const storageRef  = ref(storage, storagePath);
  await uploadBytes(storageRef, compressed, { contentType: "image/jpeg" });
  const url = await getDownloadURL(storageRef);

  return { url, storagePath, comment, uploadedBy, uploadedByName: uploaderName,
           uploadedAt: new Date().toISOString(), taskId, phase, sizeKb };
}
