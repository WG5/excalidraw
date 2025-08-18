import { useEffect } from "react";
import JSZip from "jszip";

export function usePdfDropToImages() {
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("application/pdf")) {
        e.preventDefault();
      }
    };

    const onDrop = async (ev: DragEvent) => {
      if (!ev.dataTransfer) return;

      const items = Array.from(ev.dataTransfer.items || []);
      const pdf = items.map(it => it.kind === "file" ? it.getAsFile() : null)
                       .find(f => f && f.type === "application/pdf");
      if (!pdf) return; // PDFでなければ既存処理に任せる

      ev.preventDefault();
      ev.stopPropagation();

      try {
        const fd = new FormData();
        fd.append("pdf", pdf);

        const res = await fetch("/convert?dpi=250", { method: "POST", body: fd });
        if (!res.ok) throw new Error(`convert failed: ${res.status}`);
        const zip = await JSZip.loadAsync(await res.blob());

        const names = Object.keys(zip.files)
          .filter(n => /^page-\d+\.png$/.test(n))
          .sort((a,b)=>parseInt(a.match(/\d+/)![0]) - parseInt(b.match(/\d+/)![0]));

        for (const name of names) {
          const blob = await zip.files[name].async("blob");
          const f = new File([blob], name, { type: "image/png" });
          const dt = new DataTransfer();
          dt.items.add(f);
          const evt = new DragEvent("drop", { dataTransfer: dt });
          document.dispatchEvent(evt); // Excalidraw既存の画像ドロップ処理に委ねる
        }
      } catch (e) {
        console.error(e);
        alert("PDF変換に失敗しました");
      }
    };

    window.addEventListener("dragover", onDragOver as any);
    window.addEventListener("drop", onDrop as any);
    return () => {
      window.removeEventListener("dragover", onDragOver as any);
      window.removeEventListener("drop", onDrop as any);
    };
  }, []);
}
