export const resizeImageFile = (file: File, maxSize = 1000, quality = 0.85): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        const img = new Image();
        img.src = event.target.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          if (width > maxSize || height > maxSize) {
            if (width > height) {
              height *= maxSize / width;
              width = maxSize;
            } else {
              width *= maxSize / height;
              height = maxSize;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#1c1917';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
          } else {
            reject(new Error("Could not get canvas context"));
          }
        };
        img.onerror = () => reject(new Error("Image load error"));
      } else {
        reject(new Error("Reader result empty"));
      }
    };
    reader.onerror = () => reject(new Error("File read error"));
    reader.readAsDataURL(file);
  });
};

/**
 * Safely transforms thumbnail URLs for known image providers that support dynamic resizing (Unsplash).
 * Keeps all other image URLs (Firebase Storage, base64 data URLs, custom hosts) 100% untouched.
 */
export function getOptimizedThumbnailUrl(
  url: string | undefined | null,
  width = 480,
  quality = 75
): string {
  if (!url || typeof url !== 'string') return '';

  // Only transform Unsplash URLs where dynamic query parameters are verified and supported
  if (url.includes('images.unsplash.com')) {
    try {
      const parsed = new URL(url);
      parsed.searchParams.set('w', width.toString());
      parsed.searchParams.set('q', quality.toString());
      parsed.searchParams.set('auto', 'format');
      parsed.searchParams.set('fit', 'crop');
      return parsed.toString();
    } catch {
      return url;
    }
  }

  // Firebase Storage, base64 data: URLs, and other endpoints remain unmodified
  return url;
}

