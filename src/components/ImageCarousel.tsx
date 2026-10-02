import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, Maximize2, Image as ImageIcon } from "lucide-react";
import { getOptimizedThumbnailUrl } from "../utils/imageHelpers";

interface ImageCarouselProps {
  images: string[];
  title: string;
  activeIndex: number;
  onChangeIndex: (index: number) => void;
  onOpenLightbox: (index: number) => void;
}

export const ImageCarousel: React.FC<ImageCarouselProps> = ({
  images,
  title,
  activeIndex,
  onChangeIndex,
  onOpenLightbox,
}) => {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [direction, setDirection] = useState<number>(0);
  const thumbnailContainerRef = useRef<HTMLDivElement>(null);

  const total = images.length;

  const goToNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (total <= 1) return;
    setDirection(1);
    const nextIdx = (activeIndex + 1) % total;
    onChangeIndex(nextIdx);
  };

  const goToPrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (total <= 1) return;
    setDirection(-1);
    const prevIdx = (activeIndex - 1 + total) % total;
    onChangeIndex(prevIdx);
  };

  // Handle Touch Swipe for mobile
  const minSwipeDistance = 40;

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (touchStart === null || touchEnd === null) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      goToNext();
    } else if (isRightSwipe) {
      goToPrev();
    }
  };

  // Auto-scroll active thumbnail into view
  useEffect(() => {
    if (thumbnailContainerRef.current) {
      const activeThumb = thumbnailContainerRef.current.children[activeIndex] as HTMLElement;
      if (activeThumb) {
        activeThumb.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      }
    }
  }, [activeIndex]);

  if (!images || images.length === 0) {
    return (
      <div className="w-full aspect-[4/3] bg-stone-100 flex flex-col items-center justify-center text-stone-400 rounded-2xl border border-stone-200 shadow-sm p-4">
        <ImageIcon className="w-12 h-12 text-stone-300 mb-2 stroke-[1.5]" />
        <span className="font-semibold text-sm">No Image Available</span>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col">
      {/* Main Carousel Container */}
      <div
        className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-stone-950 shadow-md border border-stone-200 select-none touch-pan-y group"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={activeIndex}
            custom={direction}
            initial={{ opacity: 0, x: direction > 0 ? 80 : direction < 0 ? -80 : 0 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction > 0 ? -80 : direction < 0 ? 80 : 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute inset-0 flex items-center justify-center cursor-pointer"
            onClick={() => onOpenLightbox(activeIndex)}
          >
            <img
              src={images[activeIndex]}
              alt={`${title} - Photo ${activeIndex + 1}`}
              referrerPolicy="no-referrer"
              decoding="async"
              loading="eager"
              className="w-full h-full object-contain bg-black/40"
            />
          </motion.div>
        </AnimatePresence>

        {/* Hover overlay hint */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
          <div className="bg-stone-900/85 backdrop-blur-md text-white px-4 py-2 rounded-full font-bold text-xs shadow-xl flex items-center gap-2 border border-white/20 transform translate-y-1 group-hover:translate-y-0 transition-transform">
            <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
            <span>Tap to view full screen</span>
          </div>
        </div>

        {/* Top-Right Photo Count Indicator */}
        {total > 1 && (
          <div className="absolute top-3 right-3 bg-stone-900/80 backdrop-blur-md text-stone-100 text-xs font-black px-3 py-1.5 rounded-full border border-white/15 shadow-lg flex items-center gap-1.5 z-10">
            <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
            <span>
              {activeIndex + 1} / {total}
            </span>
          </div>
        )}

        {/* Top-Left Expand Fullscreen Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenLightbox(activeIndex);
          }}
          className="absolute top-3 left-3 bg-stone-900/80 backdrop-blur-md hover:bg-stone-900 text-white p-2 rounded-full border border-white/15 shadow-lg transition-all active:scale-90 z-10"
          title="Open Fullscreen Lightbox"
        >
          <Maximize2 className="w-4 h-4 text-stone-200" />
        </button>

        {/* Left Navigation Arrow */}
        {total > 1 && (
          <button
            type="button"
            onClick={goToPrev}
            className="absolute left-3 top-1/2 -translate-y-1/2 bg-stone-900/80 backdrop-blur-md hover:bg-amber-500 hover:text-stone-950 text-white p-2.5 sm:p-3 rounded-full border border-white/20 shadow-xl transition-all active:scale-90 z-10 focus:outline-none"
            aria-label="Previous photo"
          >
            <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
          </button>
        )}

        {/* Right Navigation Arrow */}
        {total > 1 && (
          <button
            type="button"
            onClick={goToNext}
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-stone-900/80 backdrop-blur-md hover:bg-amber-500 hover:text-stone-950 text-white p-2.5 sm:p-3 rounded-full border border-white/20 shadow-xl transition-all active:scale-90 z-10 focus:outline-none"
            aria-label="Next photo"
          >
            <ChevronRight className="w-5 h-5 stroke-[2.5]" />
          </button>
        )}

        {/* Bottom Dots Navigation */}
        {total > 1 && (
          <div className="absolute bottom-3 inset-x-0 flex justify-center items-center gap-1.5 px-4 z-10 pointer-events-none">
            <div className="bg-stone-900/75 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/15 flex items-center gap-1.5 pointer-events-auto shadow-md">
              {images.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDirection(idx > activeIndex ? 1 : -1);
                    onChangeIndex(idx);
                  }}
                  className={`transition-all duration-300 rounded-full h-2 ${
                    idx === activeIndex
                      ? "w-6 bg-amber-400 shadow-sm"
                      : "w-2 bg-white/50 hover:bg-white/80"
                  }`}
                  aria-label={`Go to photo ${idx + 1}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Swipe Banner for Mobile Devices */}
      {total > 1 && (
        <div className="sm:hidden text-center text-[11px] font-bold text-stone-400 mt-2 flex items-center justify-center gap-1.5 uppercase tracking-wider">
          <ChevronLeft className="w-3.5 h-3.5 text-amber-500" />
          <span>Swipe left / right to view photos</span>
          <ChevronRight className="w-3.5 h-3.5 text-amber-500" />
        </div>
      )}

      {/* Thumbnails Bar */}
      {total > 1 && (
        <div
          ref={thumbnailContainerRef}
          className="flex gap-2.5 mt-3 overflow-x-auto pb-2 pt-1 scrollbar-thin scroll-smooth"
        >
          {images.map((img, idx) => {
            const isActive = idx === activeIndex;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setDirection(idx > activeIndex ? 1 : -1);
                  onChangeIndex(idx);
                }}
                className={`relative flex-shrink-0 w-20 h-20 sm:w-22 sm:h-22 rounded-xl overflow-hidden border-2 transition-all duration-200 ${
                  isActive
                    ? "border-amber-500 ring-2 ring-amber-500/40 shadow-md scale-[1.02] opacity-100"
                    : "border-stone-200 opacity-60 hover:opacity-100 hover:border-amber-300"
                }`}
              >
                <img
                  src={getOptimizedThumbnailUrl(img, 180, 75)}
                  alt={`Thumbnail ${idx + 1}`}
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  decoding="async"
                  width={88}
                  height={88}
                  className="w-full h-full object-cover"
                />
                {isActive && (
                  <div className="absolute inset-0 border-2 border-amber-400 rounded-xl pointer-events-none" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
