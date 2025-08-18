/* eslint-disable no-restricted-globals */
import { useEffect } from "react";
import JSZip from "jszip";

export function usePdfDropToImages() {
  useEffect(() => {
    // ★ capture phase で document に付ける：既存ハンドラより先に奪う
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

      if (!pdfFile) return; // 画像等は既存処理に任せる

      // ★ ここで完全に横取り（既存PDF処理を走らせない）
      ev.preventDefault();
      ev.stopPropagation();
      (ev as any).stopImmediatePropagation?.();

      // --- 変換フェーズ（例外時のみアラート） ---
      let zip: JSZip;
      try {
        const fd = new FormData();
        fd.append("pdf", pdfFile);
        const res = await fetch("/convert?dpi=250", { method: "POST", body: fd });
        if (!res.ok) throw new Error(`convert failed: ${res.status}`);
        const blob = await res.blob();
        zip = await JSZip.loadAsync(blob);
      } catch (err) {
        console.error(err);
        alert("PDF変換に失敗しました");
        return;
      }

      // --- 貼り付けフェーズ（1枚ずつ安全に試行） ---
      const names = Object.keys(zip.files)
        .filter((n) => /^page-\d+\.png$/.test(n))
        .sort(
          (a, b) => parseInt(a.match(/\d+/)![0], 10) - parseInt(b.match(/\d+/)![0], 10),
        );

      for (const name of names) {
        try {
          const pngBlob = await zip.files[name].async("blob");
          const filePng = new File([pngBlob], name, { type: "image/png" });
          const dt = new DataTransfer();
          dt.items.add(filePng);

          // ★ Excalidraw の既存画像ドロップ処理に“だけ”渡す
          const evt = new DragEvent("drop", { dataTransfer: dt, bubbles: true });
          document.dispatchEvent(evt);
          // 少し間を空けると安定する（重いPDFで有効）
          await new Promise((r) => setTimeout(r, 10));
        } catch (e) {
          console.warn("Failed to insert page:", name, e);
          // 続行（他ページは挿入する）
        }
      }
    };

    // ★ document へ capture=true で登録（横取りが目的）
    document.addEventListener("dragover", onDragOver as any, { capture: true });
    document.addEventListener("drop", onDrop as any, { capture: true });

    return () => {
      document.removeEventListener("dragover", onDragOver as any, { capture: true });
      document.removeEventListener("drop", onDrop as any, { capture: true });
    };
  }, []);
}
