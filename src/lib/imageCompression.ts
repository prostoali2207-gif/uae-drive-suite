const MAX_IMAGE_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

export async function prepareImageForStorageUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  try {
    const imageUrl = URL.createObjectURL(file);
    try {
      const image = await loadImage(imageUrl);
      const { width, height } = getResizedDimensions(image.width, image.height);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) return file;

      context.drawImage(image, 0, 0, width, height);
      const blob = await canvasToJpegBlob(canvas);
      if (!blob) return file;

      return new File([blob], withJpegExtension(file.name), {
        type: "image/jpeg",
        lastModified: file.lastModified,
      });
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  } catch (error) {
    console.warn("Image compression failed; uploading original image.", error);
    return file;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image for compression."));
    image.src = src;
  });
}

function getResizedDimensions(width: number, height: number): { width: number; height: number } {
  const maxDimension = Math.max(width, height);
  if (maxDimension <= MAX_IMAGE_DIMENSION) return { width, height };

  const scale = MAX_IMAGE_DIMENSION / maxDimension;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
  });
}

function withJpegExtension(fileName: string): string {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  return `${baseName || "image"}.jpg`;
}
