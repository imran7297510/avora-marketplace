import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, X, Star, MoveHorizontal, AlertCircle, Maximize2 } from 'lucide-react';
import { ArenaImageUtils } from '../utils/image';
import { ARENA_CONFIG } from '../constants';
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import Zoom from "yet-another-react-lightbox/plugins/zoom";

interface ArenaImageManagerProps {
  images: File[];
  coverIndex: number;
  onChange: (images: File[], coverIndex: number) => void;
}

export const ArenaImageManager: React.FC<ArenaImageManagerProps> = ({ images, coverIndex, onChange }) => {
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const loadPreviews = async () => {
      const urls = await Promise.all(
        images.map(async (img) => {
          try {
            return await ArenaImageUtils.generateThumbnail(img);
          } catch (e) {
            console.error(`Preview generation failed for ${img.name}:`, e);
            // Return an inline SVG placeholder indicating unsupported/invalid image format
            return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="%231c1917" stroke="%23dc2626" stroke-width="2"/><text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="12" fill="%23dc2626">UNSUPPORTED</text><text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="10" fill="%23a8a29e">Format/Corrupt</text></svg>`;
          }
        })
      );
      if (active) {
        setPreviews(urls);
      }
    };
    loadPreviews();
    return () => {
      active = false;
    };
  }, [images]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    setError(null);

    if (images.length + files.length > ARENA_CONFIG.MAX_IMAGES) {
      setError(`Maximum ${ARENA_CONFIG.MAX_IMAGES} images allowed.`);
      return;
    }

    setProcessing(true);
    try {
      const validFiles: File[] = [];
      for (const file of files) {
        const err = ArenaImageUtils.validateImage(file, ARENA_CONFIG.MAX_IMAGE_SIZE_MB);
        if (err) {
          setError(err);
        } else {
          // Process and convert if it's HEIC/HEIF
          const processedFile = await ArenaImageUtils.ensureStandardImage(file);
          validFiles.push(processedFile);
        }
      }

      if (validFiles.length > 0) {
        onChange([...images, ...validFiles], coverIndex);
      }
    } catch (err: any) {
      console.error('Image processing error:', err);
      setError(err?.message || 'Error processing selected images.');
    } finally {
      setProcessing(false);
      // Clear file input value to allow selecting same files again if needed
      e.target.value = '';
    }
  };

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    let newCover = coverIndex;
    if (coverIndex === index) newCover = 0;
    else if (coverIndex > index) newCover = coverIndex - 1;
    
    onChange(newImages, newCover);
  };

  const setCover = (index: number) => {
    onChange(images, index);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('index', index.toString());
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    const sourceIndex = parseInt(e.dataTransfer.getData('index'));
    if (sourceIndex === targetIndex) return;

    const newImages = [...images];
    const [movedItem] = newImages.splice(sourceIndex, 1);
    newImages.splice(targetIndex, 0, movedItem);

    // Adjust cover index
    let newCover = coverIndex;
    if (coverIndex === sourceIndex) {
      newCover = targetIndex;
    } else if (sourceIndex < coverIndex && targetIndex >= coverIndex) {
      newCover--;
    } else if (sourceIndex > coverIndex && targetIndex <= coverIndex) {
      newCover++;
    }

    onChange(newImages, newCover);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-black uppercase italic tracking-tighter text-white">
          Combat Visuals ({images.length}/{ARENA_CONFIG.MAX_IMAGES})
        </label>
        <span className="text-xs text-stone-400 font-bold uppercase tracking-widest">
          Min {ARENA_CONFIG.MIN_IMAGES} Required
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
        <AnimatePresence>
          {previews.map((preview, i) => (
            <motion.div
              key={`${preview}-${i}`}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              draggable
              onDragStart={(e) => handleDragStart(e, i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, i)}
               className={`relative aspect-square rounded-2xl overflow-hidden border-2 transition-all cursor-move group ${
                coverIndex === i ? 'border-amber-500 shadow-lg shadow-amber-500/20' : 'border-stone-800'
              }`}
            >
              <img src={preview} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              
              {/* Always visible remove button for mobile friendliness */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                className="absolute top-2 right-2 p-1.5 bg-stone-900/90 text-rose-500 rounded-full hover:bg-rose-500 hover:text-white transition-all shadow-md z-10 border border-stone-800"
                title="Remove Image"
              >
                <X className="w-3.5 h-3.5" />
              </button>

              <div 
                onClick={() => setZoomIndex(i)}
                className="absolute inset-0 bg-stone-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 cursor-zoom-in"
              >
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setCover(i); }}
                  className={`p-2 rounded-lg transition-all ${coverIndex === i ? 'bg-amber-500 text-stone-950' : 'bg-stone-900 text-white hover:bg-amber-500 hover:text-stone-950'}`}
                  title="Set as Cover"
                >
                  <Star className="w-4 h-4" fill={coverIndex === i ? 'currentColor' : 'none'} />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setZoomIndex(i); }}
                  className="p-2 bg-stone-900 text-stone-300 rounded-lg hover:bg-amber-500 hover:text-stone-950 transition-all"
                  title="Zoom Image"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>

              {coverIndex === i && (
                <div className="absolute top-2 left-2 bg-amber-500 text-stone-950 px-2 py-0.5 rounded-full text-xs font-black uppercase tracking-widest">
                  Cover
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {images.length < ARENA_CONFIG.MAX_IMAGES && (
          <label className={`relative aspect-square rounded-2xl border-2 border-dashed border-stone-800 transition-all flex flex-col items-center justify-center gap-2 group ${processing ? 'cursor-not-allowed opacity-60 bg-stone-900/25' : 'hover:border-rose-500/50 hover:bg-stone-900/50 cursor-pointer'}`}>
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
              disabled={processing}
            />
            {processing ? (
              <>
                <div className="w-6 h-6 border-2 border-stone-500 border-t-amber-500 rounded-full animate-spin" />
                <span className="text-xs font-black text-stone-400 uppercase tracking-widest animate-pulse">Converting...</span>
              </>
            ) : (
              <>
                <Upload className="w-6 h-6 text-stone-400 group-hover:text-rose-500 group-hover:scale-110 transition-all" />
                <span className="text-xs font-black text-stone-600 uppercase tracking-widest">Add Image</span>
              </>
            )}
          </label>
        )}
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-rose-500 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20"
        >
          <AlertCircle className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-wider">{error}</span>
        </motion.div>
      )}

      <div className="flex items-center gap-2 text-stone-400 px-1">
        <MoveHorizontal className="w-3 h-3" />
        <span className="text-xs font-medium uppercase tracking-[0.2em]">Drag to reorder thumbnails</span>
      </div>

      <Lightbox
        open={zoomIndex !== null}
        close={() => setZoomIndex(null)}
        index={zoomIndex ?? 0}
        slides={previews.map((src) => ({ src }))}
        plugins={[Zoom]}
        carousel={{ padding: 0 }}
        on={{
          view: ({ index }) => setZoomIndex(index),
        }}
      />
    </div>
  );
};
