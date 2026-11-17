
import React, { useEffect, useState } from "react";
import "./ReferenceOverlay.css";

export default function ReferenceOverlay({
  src,
  visible = true,
  tolerance = 100,
  opacity = 80,
  size = 100,
  horizontal = 50,
  vertical = 50,
}) {
  const [processedImage, setProcessedImage] = useState("");

  useEffect(() => {
    if (!src) {
      setProcessedImage("");
      return;
    }

    let cancelled = false;
    let generatedUrl = "";

    const image = new Image();

    image.onload = () => {
      if (cancelled) return;

      try {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", {
          willReadFrequently: true,
        });

        if (!context) throw new Error("Canvas unavailable");

        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;

        context.drawImage(image, 0, 0);

        const imageData = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height
        );

        const pixels = imageData.data;

        // Higher tolerance removes weaker green shades.
        const threshold = 18 + (255 - tolerance) * 0.30;
        const feather = 18;

        for (let i = 0; i < pixels.length; i += 4) {
          const red = pixels[i];
          const green = pixels[i + 1];
          const blue = pixels[i + 2];

          const greenDominance =
            green - Math.max(red, blue);

          const distance = greenDominance - threshold;

          if (distance > 0) {
            const alpha =
              distance >= feather
                ? 0
                : 1 - distance / feather;

            pixels[i + 3] = Math.round(
              pixels[i + 3] * alpha
            );
          }
        }

        context.putImageData(imageData, 0, 0);

        canvas.toBlob((blob) => {
          if (!blob || cancelled) return;

          generatedUrl = URL.createObjectURL(blob);
          setProcessedImage(generatedUrl);
        }, "image/png");
      } catch (error) {
        console.error("Green removal failed:", error);

        if (!cancelled) {
          setProcessedImage(src);
        }
      }
    };

    image.onerror = () => {
      if (!cancelled) setProcessedImage(src);
    };

    image.src = src;

    return () => {
      cancelled = true;

      if (generatedUrl) {
        URL.revokeObjectURL(generatedUrl);
      }
    };
  }, [src, tolerance]);

  if (!src || !processedImage || !visible) {
    return null;
  }

  return (
    <div className="reference-overlay-layer">
      <img
        className="reference-overlay-image"
        src={processedImage}
        alt="Reference overlay"
        draggable="false"
        style={{
          width: `${size}%`,
          height: `${size}%`,
          left: `${horizontal}%`,
          top: `${vertical}%`,
          opacity: opacity / 100,
        }}
      />
    </div>
  );
}
