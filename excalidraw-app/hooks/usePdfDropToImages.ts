/* eslint-disable no-restricted-globals */
import { useEffect } from "react";
import JSZip from "jszip";

type API = {
  addFiles?: (files: Map<string, any>) => Promise<void> | void;
  getSceneElements: () => any[];
  getAppState: () => any;
  updateScene: (arg: any) => void;
  generateId?: () => string;
};

export function usePdfDropToImages(excalidrawAPI: API | null) {
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
      const pdfFile = items
        .map((it) => (it.kind === "file" ? it.getAsFile() : null))
        .find((f) => f && f.type === "application/pdf");
      if (!pdfFile) return;

      // 標準PDF処理を完全に止める
      ev.preventDefault();
      ev.stopPropagation();
      (ev as any).stopImmediatePropagation?.();

      // --- /convert 呼び出し ---
      let zip: JSZip;
      try {
        const fd = new FormData();
        fd.append("pdf", pdfFile);
        const res = await fetch("/convert?dpi=250", { method: "POST", body: fd });
        if (!res.ok) throw new Error(`convert failed: ${res.status}`);
        zip = await JSZip.loadAsync(await res.blob());
      } catch (e) {
        console.error(e);
        alert("PDF変換に失敗しました");
        return;
      }

      // --- PNG を番号順に取り出し ---
      const names = Object.keys(zip.files)
        .filter((n) => /^page-\d+\.png$/.test(n))
        .sort((a, b) => parseInt(a.match(/\d+/)![0], 10) - parseInt(b.match(/\d+/)![0], 10));

      if (!names.length) {
        alert("ZIP内に page-*.png が見つかりません");
        return;
      }

      // キャンバス中央座標を取得（おおよそ）
      const appState = excalidrawAPI.getAppState();
      const centerX = (appState.width ?? window.innerWidth) / 2 + (appState.scrollX ?? 0);
      const centerY = (appState.height ?? window.innerHeight) / 2 + (appState.scrollY ?? 0);

      // 現在の要素
      let elements = excalidrawAPI.getSceneElements();

      for (let i = 0; i < names.length; i++) {
        try {
          const name = names[i];
          const blob = await zip.files[name].async("blob");

          // 画像サイズを取得
          // createImageBitmap は Web ワーカー不可だが、ここはUIスレッドなのでOK
          const bmp = await createImageBitmap(blob);
          const width = bmp.width;
          const height = bmp.height;

          // BinaryFiles に登録
          const ab = new Uint8Array(await blob.arrayBuffer());
          const fileId = excalidrawAPI.generateId
            ? excalidrawAPI.generateId()
            : Math.random().toString(36).slice(2) + Date.now();

          await excalidrawAPI.addFiles?.(
            new Map([
              [
                fileId,
                {
                  id: fileId,
                  data: ab,
                  mimeType: "image/png",
                  created: Date.now(),
                  lastRetrieved: Date.now(),
                },
              ],
            ]),
          );

          // 画像エレメントを作成（必要プロパティを明示）
          const imageElement = {
            id: excalidrawAPI.generateId
              ? excalidrawAPI.generateId()
              : Math.random().toString(36).slice(2) + Date.now(),
            type: "image",
            x: centerX - width / 2,          // 中央に配置
            y: centerY - height / 2 + i * (height + 40), // 縦方向に少しずつずらす
            width,
            height,
            angle: 0,
            fileId,
            // 必須プロパティ（Excalidrawの要件に合わせて無難な既定値）
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

          // 少し待つと重いPDFでも安定
          await new Promise((r) => setTimeout(r, 8));
        } catch (e) {
          console.warn("画像挿入に失敗しました（続行します）:", e);
        }
      }
    };

    document.addEventListener("dragover", onDragOver as any, { capture: true });
    document.addEventListener("drop", onDrop as any, { capture: true });
    return () => {
      document.removeEventListener("dragover", onDragOver as any, { capture: true });
      document.removeEventListener("drop", onDrop as any, { capture: true });
    };
  }, [excalidrawAPI]);
}
