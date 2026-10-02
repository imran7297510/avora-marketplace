import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Maximize2, X, ChevronLeft, ChevronRight, Minimize2, Expand } from 'lucide-react';
import { cn } from '../../../lib/utils';
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import { getOptimizedThumbnailUrl } from '../../../utils/imageHelpers';

interface ArenaGalleryProps {
  images: string[];
  title: string;
}

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1555664424-778a1e5e1b48?auto=format&fit=crop&q=80&w=800';

export const ArenaGallery: React.FC<ArenaGalleryProps> = ({ images, title }) => {
  const safeImages = images && images.length > 0 ? images : [FALLBACK_IMAGE];
  const [activeIdx, setActiveIdx] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isFit, setIsFit] = useState(false);

  const nextImage = () => {
    setActiveIdx((prev) => (prev + 1) % safeImages.length);
    setIsZoomed(false);
  };
  
  const prevImage = () => {
    setActiveIdx((prev) => (prev - 1 + safeImages.length) % safeImages.length);
    setIsZoomed(false);
  };

  return (
    <div className="space-y-4">
      {/* Main Display */}
      <div 
        onClick={() => setIsFullscreen(true)}
        className="relative aspect-[4/3] rounded-3xl sm:rounded-[2.5rem] overflow-hidden bg-stone-900 border border-white/5 group shadow-2xl cursor-pointer"
      >
        <AnimatePresence mode="wait">
          <motion.img
            key={activeIdx}
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            src={safeImages[activeIdx] || FALLBACK_IMAGE}
            alt={`${title} - View ${activeIdx + 1}`}
            referrerPolicy="no-referrer"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = FALLBACK_IMAGE;
            }}
            className={cn(
              "w-full h-full transition-all duration-300",
              isFit ? "object-contain bg-stone-955/90" : "object-cover"
            )}
          />
        </AnimatePresence>

        {/* Overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        
        {/* Gallery Controls on Top Right */}
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsFit(!isFit);
            }}
            className="p-2.5 sm:p-3 bg-stone-950/90 border border-stone-800 text-stone-300 hover:text-white rounded-xl hover:bg-stone-900 transition-all hover:scale-115 active:scale-90 shadow-lg flex items-center justify-center"
            title={isFit ? "Switch to Fill Crop View" : "Switch to Fit Full View"}
          >
            {isFit ? <Expand className="w-4 sm:w-5 h-4 sm:h-5 text-amber-500" /> : <Minimize2 className="w-4 sm:w-5 h-4 sm:h-5 text-stone-300" />}
          </button>

          <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsFullscreen(true);
            }}
            className="p-2.5 sm:p-3 bg-stone-950/90 border border-stone-800 text-stone-300 hover:text-white rounded-xl hover:bg-stone-900 transition-all hover:scale-115 active:scale-90 shadow-lg flex items-center justify-center"
            title="Expand Fullscreen Lightbox"
          >
            <Maximize2 className="w-4 sm:w-5 h-4 sm:h-5" />
          </button>
        </div>

        {/* Navigation Arrows */}
        {safeImages.length > 1 && (
          <>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                prevImage();
              }}
              className="absolute left-4 sm:left-6 top-1/2 -translate-y-1/2 p-2 sm:p-3 bg-stone-950 border border-stone-800 text-white lg:opacity-0 lg:group-hover:opacity-100 opacity-100 transition-all hover:bg-rose-600 hover:border-rose-500 rounded-full sm:rounded-none"
            >
              <ChevronLeft className="w-5 sm:w-6 h-5 sm:h-6" />
            </button>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                nextImage();
              }}
              className="absolute right-4 sm:right-6 top-1/2 -translate-y-1/2 p-2 sm:p-3 bg-stone-950 border border-stone-800 text-white lg:opacity-0 lg:group-hover:opacity-100 opacity-100 transition-all hover:bg-rose-600 hover:border-rose-500 rounded-full sm:rounded-none"
            >
              <ChevronRight className="w-5 sm:w-6 h-5 sm:h-6" />
            </button>
          </>
        )}
      </div>

      {/* Thumbnails */}
      {safeImages.length > 1 && (
        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
          {safeImages.map((img, idx) => (
            <button
              key={idx}
              onClick={() => {
                setActiveIdx(idx);
                setIsZoomed(false);
              }}
              className={cn(
                "relative flex-shrink-0 w-20 sm:w-24 aspect-square rounded-2xl overflow-hidden border-2 transition-all",
                activeIdx === idx ? "border-amber-500 scale-105 shadow-lg shadow-amber-500/20" : "border-stone-800 opacity-60 hover:opacity-100"
              )}
            >
              <img 
                src={getOptimizedThumbnailUrl(img || FALLBACK_IMAGE, 180, 75)} 
                alt={`Thumbnail ${idx + 1}`} 
                referrerPolicy="no-referrer" 
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_IMAGE; }}
                className="w-full h-full object-cover" 
              />
            </button>
          ))}
        </div>
      )}

      {/* Fullscreen Viewer */}
      <Lightbox
        open={isFullscreen}
        close={() => setIsFullscreen(false)}
        index={activeIdx}
        slides={safeImages.map((src) => ({ src: src || FALLBACK_IMAGE }))}
        plugins={[Zoom]}
        carousel={{ padding: 0 }}
        on={{
          view: ({ index }) => setActiveIdx(index),
        }}
      />
    </div>
  );
};
