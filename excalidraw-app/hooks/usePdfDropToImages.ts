/* eslint-disable no-restricted-globals */
import { useEffect } from "react";
import JSZip from "jszip";
import type {
  ExcalidrawImperativeAPI,
  BinaryFileData,
  DataURL, // ★ 追加：ブランド型
} from "@excalidraw/excalidraw/types";
import type { FileId } from "@excalidraw/element/types";

/** string → FileId（ブランド型） */
const makeFileId = (s: string) => s as unknown as FileId;
/** string → DataURL（ブランド型） */
const makeDataURL = (s: string) => s as unknown as DataURL;

/** Blob → dataURL(string) */
const blobToDataURL = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });

export function usePdfDropToImages(
  excalidrawAPI: ExcalidrawImperativeAPI | null,
) {
  useEffect(() => {
    if (!excalidrawAPI) return;

    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("application/pdf")) {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
      }
    };

    const onDrop = async (ev: DragEvent) => {
      if (!ev.dataTransfer) return;

      const items = Array.from(ev.dataTransfer.items || []);
      const pdf = items
        .map((it) => (it.kind === "file" ? it.getAsFile() : null))
        .find((f) => f && f.type === "application/pdf");
      if (!pdf) return;

      // 既存のPDF処理を止める
      ev.preventDefault();
      ev.stopPropagation();
      (ev as any).stopImmediatePropagation?.();

      // ----- /convert（ZIP返却） -----
      let zip: JSZip;
      try {
        const fd = new FormData();
        fd.append("pdf", pdf);
        const res = await fetch("/convert?dpi=250", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) throw new Error(`convert failed: ${res.status}`);
        zip = await JSZip.loadAsync(await res.blob());
      } catch (e) {
        console.error(e);
        alert("PDF変換に失敗しました");
        return;
      }

      // ----- page-*.png を抽出して並べ替え -----
      const names = Object.keys(zip.files)
        .filter((n) => /^page-\d+\.png$/.test(n))
        .sort(
          (a, b) =>
            parseInt(a.match(/\d+/)![0], 10) -
            parseInt(b.match(/\d+/)![0], 10),
        );
      if (!names.length) {
        alert("ZIP内に page-*.png が見つかりません");
        return;
      }

      // 配置基準：キャンバス中央
      const appState = excalidrawAPI.getAppState();
      const centerX =
        (appState.width ?? window.innerWidth) / 2 + (appState.scrollX ?? 0);
      const centerY =
        (appState.height ?? window.innerHeight) / 2 + (appState.scrollY ?? 0);

      let elements = excalidrawAPI.getSceneElements();

      for (let i = 0; i < names.length; i++) {
        try {
          const name = names[i];
          const blob = await zip.files[name].async("blob");

          // 画像の自然サイズ取得
          const bmp = await createImageBitmap(blob);
          const width = bmp.width;
          const height = bmp.height;

          // BinaryFileData は dataURL(ブランド型) を要求
          const dataURL = makeDataURL(await blobToDataURL(blob));
          const fileId = makeFileId(
            Math.random().toString(36).slice(2) + Date.now(),
          );

          const fileData: BinaryFileData = {
            id: fileId,
            dataURL,               // ★ DataURL 型
            mimeType: "image/png",
            created: Date.now(),
            lastRetrieved: Date.now(),
          };
          excalidrawAPI.addFiles([fileData]);

          // 画像要素をシーンへ追加
          const imageElement: any = {
            id: Math.random().toString(36).slice(2) + Date.now(),
            type: "image",
            x: centerX - width / 2,
            y: centerY - height / 2 + i * (height + 40), // 縦にずらす
            width,
            height,
            angle: 0,
            fileId, // FileId（ブランド済み）
            strokeColor: "transparent",
            backgroundColor: "transparent",
            fillStyle: "hachure",
            strokeWidth: 1,
            strokeStyle: "solid",
            roundness: null,
            roughness: 0,
            opacity: 100,
            groupIds: [],
            frameId: null,
            seed: Math.floor(Math.random() * 2 ** 31),
            version: 1,
            versionNonce: Math.floor(Math.random() * 2 ** 31),
            isDeleted: false,
            boundElements: null,
            updated: Date.now(),
            locked: false,
          };

          elements = [...elements, imageElement];
          excalidrawAPI.updateScene({ elements });

          await new Promise((r) => setTimeout(r, 8));
        } catch (e) {
          console.warn("画像挿入に失敗（続行）:", e);
        }
      }
    };

    document.addEventListener("dragover", onDragOver as any, { capture: true });
    document.addEventListener("drop", onDrop as any, { capture: true });
    return () => {
      document.removeEventListener("dragover", onDragOver as any, {
        capture: true,
      });
      document.removeEventListener("drop", onDrop as any, { capture: true });
    };
  }, [excalidrawAPI]);
}
