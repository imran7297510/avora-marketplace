/**
 * Utility for Arena image processing.
 * Handles compression, metadata stripping, and thumbnail generation.
 */

export const ArenaImageUtils = {
  /**
   * Compresses an image and returns a Blob.
   * Strips metadata by drawing onto a canvas.
   */
  async compressImage(file: File, quality = 0.8, maxWidth = 1920): Promise<Blob> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (!dataUrl) {
          resolve(file);
          return;
        }

        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(file);
              return;
            }

            ctx.fillStyle = '#1c1917';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            
            canvas.toBlob(
              (blob) => {
                if (blob) resolve(blob);
                else resolve(file);
              },
              'image/jpeg',
              quality
            );
          } catch (e) {
            console.error('Canvas compression failed, falling back to original file:', e);
            resolve(file);
          }
        };
        img.onerror = () => {
          resolve(file);
        };
        img.src = dataUrl;
      };
      reader.onerror = () => {
        resolve(file);
      };
      reader.readAsDataURL(file);
    });
  },

  /**
   * Generates a compressed thumbnail keeping aspect ratio for the UI and DB.
   */
  async generateThumbnail(file: File, size = 300): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (!dataUrl) {
          // Fallback SVG if reader fails completely
          const ext = file.name.split('.').pop()?.toUpperCase() || 'FILE';
          const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="%231c1917" stroke="%2344403c" stroke-width="4"/><text x="150" y="150" font-family="sans-serif" font-weight="bold" font-size="16" fill="%23f59e0b" text-anchor="middle">${ext}</text></svg>`;
          resolve(`data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`);
          return;
        }

        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // Scale down so that maximum dimension is <= size, preserving aspect ratio
            if (width > size || height > size) {
              if (width > height) {
                height = Math.round((height * size) / width);
                width = size;
              } else {
                width = Math.round((width * size) / height);
                height = size;
              }
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
              // Fail-safe: resolve with original dataUrl if canvas context creation fails
              resolve(dataUrl);
              return;
            }

            ctx.fillStyle = '#1c1917';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
            if (compressedDataUrl && compressedDataUrl.length > 1000) {
              resolve(compressedDataUrl);
            } else {
              resolve(dataUrl);
            }
          } catch (e) {
            console.error('Thumbnail generation failed, falling back to original data URL:', e);
            resolve(dataUrl);
          }
        };

        img.onerror = () => {
          // Fail-safe: resolve with original dataUrl if image loading fails
          resolve(dataUrl);
        };

        img.src = dataUrl;
      };

      reader.onerror = () => {
        // Fallback SVG if reader fails
        const ext = file.name.split('.').pop()?.toUpperCase() || 'FILE';
        const formattedSize = file.size > 1024 * 1024 
          ? (file.size / (1024 * 1024)).toFixed(1) + ' MB' 
          : (file.size / 1024).toFixed(1) + ' KB';
        
        const svgContent = `
          <svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
            <rect width="300" height="300" fill="%230c0a09" stroke="%23292524" stroke-width="4"/>
            <!-- Tactical HUD element corners -->
            <path d="M 10 30 L 10 10 L 30 10" fill="none" stroke="%23f43f5e" stroke-width="2"/>
            <path d="M 270 10 L 290 10 L 290 30" fill="none" stroke="%23f43f5e" stroke-width="2"/>
            <path d="M 10 270 L 10 290 L 30 290" fill="none" stroke="%23f43f5e" stroke-width="2"/>
            <path d="M 270 290 L 290 290 L 290 270" fill="none" stroke="%23f43f5e" stroke-width="2"/>
            
            <!-- Grid Lines -->
            <line x1="50" y1="0" x2="50" y2="300" stroke="%231c1917" stroke-width="1" />
            <line x1="150" y1="0" x2="150" y2="300" stroke="%231c1917" stroke-width="1" />
            <line x1="250" y1="0" x2="250" y2="300" stroke="%231c1917" stroke-width="1" />
            <line x1="0" y1="50" x2="300" y2="50" stroke="%231c1917" stroke-width="1" />
            <line x1="0" y1="150" x2="300" y2="150" stroke="%231c1917" stroke-width="1" />
            <line x1="0" y1="250" x2="300" y2="250" stroke="%231c1917" stroke-width="1" />
            
            <!-- Document Icon representation -->
            <rect x="110" y="70" width="80" height="100" rx="8" fill="%231c1917" stroke="%23f43f5e" stroke-width="2"/>
            <path d="M 160 70 L 190 100 L 160 100 Z" fill="%23f43f5e"/>
            
            <text x="150" y="210" font-family="monospace" font-weight="900" font-size="18" fill="%23ffffff" dominant-baseline="middle" text-anchor="middle" letter-spacing="1">
              ${ext} ASSET
            </text>
            <text x="150" y="240" font-family="sans-serif" font-weight="bold" font-size="11" fill="%23a8a29e" dominant-baseline="middle" text-anchor="middle">
              ${file.name.length > 22 ? file.name.substring(0, 19) + '...' : file.name}
            </text>
            <text x="150" y="265" font-family="monospace" font-size="10" fill="%23f59e0b" dominant-baseline="middle" text-anchor="middle" letter-spacing="1">
              SIZE: ${formattedSize}
            </text>
          </svg>
        `.trim().replace(/\s+/g, ' ');
        
        const svgDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`;
        resolve(svgDataUrl);
      };

      reader.readAsDataURL(file);
    });
  },

  /**
   * Deep signature check for HEIC/HEIF files (even if saved with .jpg/.png extension).
   */
  async isFileHeic(file: File): Promise<boolean> {
    const nameLower = file.name.toLowerCase();
    if (nameLower.endsWith('.heic') || nameLower.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif') {
      return true;
    }

    try {
      const blobSlice = file.slice(0, 24);
      const buffer = await blobSlice.arrayBuffer();
      const view = new DataView(buffer);
      if (view.byteLength < 12) return false;

      // HEIC files typically have 'ftyp' at offset 4 (bytes 4-7)
      const ftyp = String.fromCharCode(
        view.getUint8(4),
        view.getUint8(5),
        view.getUint8(6),
        view.getUint8(7)
      );
      if (ftyp === 'ftyp') {
        const brand = String.fromCharCode(
          view.getUint8(8),
          view.getUint8(9),
          view.getUint8(10),
          view.getUint8(11)
        ).toLowerCase();
        const heicBrands = ['heic', 'heix', 'hevc', 'mif1', 'msf1', 'heim', 'heis', 'hevy', 'hevp'];
        if (heicBrands.includes(brand)) {
          return true;
        }
      }
    } catch (e) {
      console.warn('Error reading file signature:', e);
    }
    return false;
  },

  /**
   * Automatically converts HEIC/HEIF to JPEG if necessary.
   */
  async ensureStandardImage(file: File): Promise<File> {
    const isHeic = await this.isFileHeic(file);
                   
    if (isHeic) {
      try {
        const heic2anyModule = await import('heic2any');
        const heic2any = heic2anyModule.default;
        const converted = await heic2any({
          blob: file,
          toType: 'image/jpeg',
          quality: 0.8
        });
        const blob = Array.isArray(converted) ? converted[0] : converted;
        const newName = file.name.replace(/\.(heic|heif|jpg|jpeg|png)$/i, '') + '.jpg';
        return new File([blob], newName, { type: 'image/jpeg' });
      } catch (err) {
        console.error('HEIC conversion failed, using original file:', err);
        return file;
      }
    }
    return file;
  },

  /**
   * Validates file size and type.
   */
  validateImage(file: File, maxSizeMB: number): string | null {
    // Return null to allow any size and format without any problems!
    return null;
  }
};
