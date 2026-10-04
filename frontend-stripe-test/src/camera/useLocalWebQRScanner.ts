import * as React from "react";
import jsQR from "jsqr";
import type { BarcodeScanningResult, CameraPictureOptions, MountErrorListener } from "expo-camera";

type Options = {
  isEnabled: boolean;
  captureOptions: Pick<CameraPictureOptions, "scale" | "isImageMirror">;
  interval?: number;
  onScanned?: (event: { nativeEvent: BarcodeScanningResult }) => void;
  onError?: MountErrorListener;
};

export function decodeAllwainQrFrame(frame: Pick<ImageData, "data" | "width" | "height">): BarcodeScanningResult | null {
  const result = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: "attemptBoth" });
  if (!result) return null;
  const points = [result.location.topLeftCorner, result.location.bottomLeftCorner,
    result.location.topRightCorner, result.location.bottomRightCorner];
  const xs = points.map(p => p.x); const ys = points.map(p => p.y);
  return { type: "qr", data: result.data, cornerPoints: points,
    bounds: { origin: { x: Math.min(...xs), y: Math.min(...ys) },
      size: { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) } } };
}

// Adapter for Expo Camera 17's web hook. No camera request, worker, or network
// is created by importing it. QR decoding uses the pinned, bundled jsQR library.
export function useWebQRScanner(video: React.MutableRefObject<HTMLVideoElement | null>, options: Options) {
  const latest = React.useRef(options);
  latest.current = options;
  React.useEffect(() => {
    if (!options.isEnabled || typeof document === "undefined") return;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function scan() {
      if (stopped) return;
      const { onScanned, onError, captureOptions, interval } = latest.current;
      const source = video.current;
      try {
        if (!document.hidden && source && source.readyState >= 2 && source.videoWidth > 0 && source.videoHeight > 0 && onScanned) {
          const requestedScale = captureOptions.scale ?? 1;
          const scale = Math.min(Number.isFinite(requestedScale) && requestedScale > 0 ? requestedScale : 1,
            640 / Math.max(source.videoWidth, source.videoHeight));
          canvas.width = Math.max(1, Math.round(source.videoWidth * scale));
          canvas.height = Math.max(1, Math.round(source.videoHeight * scale));
          context!.setTransform(captureOptions.isImageMirror ? -1 : 1, 0, 0, 1,
            captureOptions.isImageMirror ? canvas.width : 0, 0);
          context!.drawImage(source, 0, 0, canvas.width, canvas.height);
          const frame = context!.getImageData(0, 0, canvas.width, canvas.height);
          const result = decodeAllwainQrFrame(frame);
          if (result && !stopped) {
            onScanned({ nativeEvent: result });
          }
        }
      } catch {
        // Stop on a capture/decoder error instead of repeatedly reporting it.
        stopped = true;
        onError?.({ nativeEvent: { message: "QR_SCAN_UNAVAILABLE" } });
      }
      if (!stopped && interval !== 0) timer = setTimeout(scan, Math.max(250, interval || 300));
    }
    scan();
    return () => { stopped = true; clearTimeout(timer); canvas.width = 0; canvas.height = 0; };
  }, [video, options.isEnabled]);
}
