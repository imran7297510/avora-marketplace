import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { ZoomIn, ZoomOut, RotateCw, RotateCcw, X, RotateCcw as ResetIcon, Move, ChevronLeft, ChevronRight } from 'lucide-react';

interface KycImageLightboxProps {
  src: string;
  title: string;
  onClose: () => void;
  images?: string[];
  initialIndex?: number;
}

export function KycImageLightbox({ src, title, onClose, images, initialIndex }: KycImageLightboxProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const imageList = images && images.length > 0 ? images : [src];
  const [activeIdx, setActiveIdx] = useState(() => {
    if (initialIndex !== undefined) {
      return Math.max(0, Math.min(initialIndex, imageList.length - 1));
    }
    const idx = images ? images.indexOf(src) : -1;
    return idx !== -1 ? idx : 0;
  });

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.25, 6));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.25, 0.5));
  };

  const handleRotateRight = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleRotateLeft = () => {
    setRotation((prev) => (prev - 90 + 360) % 360);
  };

  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
  };

  const handlePrev = () => {
    setActiveIdx((prev) => (prev - 1 + imageList.length) % imageList.length);
    handleReset();
  };

  const handleNext = () => {
    setActiveIdx((prev) => (prev + 1) % imageList.length);
    handleReset();
  };

  const handlePrevRef = useRef(handlePrev);
  const handleNextRef = useRef(handleNext);
  useEffect(() => {
    handlePrevRef.current = handlePrev;
    handleNextRef.current = handleNext;
  });

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '=' || e.key === '+') handleZoomIn();
      if (e.key === '-') handleZoomOut();
      if (e.key === 'r' || e.key === 'R') handleReset();
      if (e.key === 'ArrowLeft') handlePrevRef.current();
      if (e.key === 'ArrowRight') handleNextRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Only left click
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setIsDragging(true);
      dragStart.current = { x: touch.clientX - position.x, y: touch.clientY - position.y };
      touchStartX.current = touch.clientX;
      touchStartY.current = touch.clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    setPosition({
      x: touch.clientX - dragStart.current.x,
      y: touch.clientY - dragStart.current.y
    });
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    setIsDragging(false);
    if (touchStartX.current !== null && touchStartY.current !== null && scale === 1 && imageList.length > 1) {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const diffX = touchEndX - touchStartX.current;
      const diffY = touchEndY - touchStartY.current;
      
      if (Math.abs(diffX) > 40 && Math.abs(diffY) < 80) {
        if (diffX > 0) {
          handlePrev();
        } else {
          handleNext();
        }
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const zoomFactor = 0.08;
    const direction = e.deltaY < 0 ? 1 : -1;
    setScale((prev) => Math.min(Math.max(prev + direction * zoomFactor, 0.5), 6));
  };

  const currentSrc = imageList[activeIdx] || src;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => { 
        e.stopPropagation(); 
        if (e.target === e.currentTarget) onClose(); 
      }}
      className="fixed inset-0 z-[999999] bg-stone-950/98 backdrop-blur-md flex flex-col justify-between p-3 sm:p-5 md:p-6 select-none cursor-pointer"
    >
      {/* Floating Instant-Close Cross Button on Top Right Corner */}
      <button
        type="button"
        onClick={(e) => { 
          e.stopPropagation(); 
          onClose(); 
        }}
        className="fixed top-4 right-4 sm:top-5 sm:right-5 z-[1000000] bg-stone-900/95 border border-stone-800 hover:bg-rose-600 hover:border-rose-500 text-stone-300 hover:text-white p-3 sm:p-3.5 rounded-full transition-all shadow-2xl active:scale-90 hover:scale-105 cursor-pointer flex items-center justify-center"
        title="Close immediately (X)"
        id="lightbox-close-btn"
      >
        <X className="w-5 sm:w-6 h-5 sm:h-6 stroke-[2.5]" />
      </button>

      {/* Top Header */}
      <div className="flex justify-between items-start w-full max-w-7xl mx-auto z-10 pointer-events-none gap-4 pr-16 sm:pr-20">
        <div className="min-w-0 pointer-events-auto mt-1 sm:mt-0">
          <h4 className="text-white font-black uppercase italic tracking-tighter text-sm sm:text-base md:text-lg truncate">
            {title}
          </h4>
          <p className="text-stone-400 font-mono text-xs md:text-xs uppercase mt-0.5 tracking-widest">
            {imageList.length > 1 ? `Image ${activeIdx + 1} of ${imageList.length} • Swipe/Arrows • Zoom: ${Math.round(scale * 100)}%` : `Scroll/Pinch to Zoom • Drag to Pan`}
          </p>
        </div>
      </div>

      {/* Main Image Stage */}
      <div 
        ref={containerRef}
        onClick={(e) => { 
          e.stopPropagation(); 
          if (e.target === e.currentTarget) onClose(); 
        }}
        onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e); }}
        onMouseMove={(e) => { e.stopPropagation(); handleMouseMove(e); }}
        onMouseUp={(e) => { e.stopPropagation(); handleMouseUpOrLeave(); }}
        onMouseLeave={(e) => { e.stopPropagation(); handleMouseUpOrLeave(); }}
        onTouchStart={(e) => { e.stopPropagation(); handleTouchStart(e); }}
        onTouchMove={(e) => { e.stopPropagation(); handleTouchMove(e); }}
        onTouchEnd={(e) => { e.stopPropagation(); handleTouchEnd(e); }}
        onWheel={(e) => { e.stopPropagation(); handleWheel(e); }}
        className={`flex-1 flex items-center justify-center overflow-hidden my-3 relative rounded-2xl border border-stone-950 bg-stone-950/20 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        {/* Navigation Arrows for Multiple Images */}
        {imageList.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handlePrev(); }}
              className="absolute left-4 z-10 p-3 bg-stone-900/85 border border-stone-800 text-stone-300 hover:text-white rounded-full transition-all hover:bg-rose-600 hover:border-rose-500 focus:outline-none shadow-2xl active:scale-90"
              title="Previous Image (Arrow Left)"
            >
              <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleNext(); }}
              className="absolute right-4 z-10 p-3 bg-stone-900/85 border border-stone-800 text-stone-300 hover:text-white rounded-full transition-all hover:bg-rose-600 hover:border-rose-500 focus:outline-none shadow-2xl active:scale-90"
              title="Next Image (Arrow Right)"
            >
              <ChevronRight className="w-5 h-5 stroke-[2.5]" />
            </button>
          </>
        )}

        <motion.div
          animate={{
            x: position.x,
            y: position.y,
            scale,
            rotate: rotation
          }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 30,
            mass: 0.8,
            ...(isDragging ? { duration: 0 } : {}) // No delay/spring lag when dragging
          }}
          className="max-w-[95%] max-h-[75vh] flex items-center justify-center pointer-events-none"
        >
          <img 
            src={currentSrc} 
            alt={title}
            referrerPolicy="no-referrer"
            className="rounded-xl shadow-2xl border border-stone-900 object-contain max-w-full max-h-[75vh] pointer-events-none" 
          />
        </motion.div>

        {/* Center Target Indicator if scale is high */}
        {scale > 1.2 && (
          <div className="absolute pointer-events-none p-1.5 bg-black/60 rounded-full text-white/50 backdrop-blur-xs">
            <Move className="w-4 h-4" />
          </div>
        )}
      </div>

      {/* Bottom Controls Bar */}
      <div className="w-full max-w-md mx-auto bg-stone-900/90 border border-stone-850 p-4 rounded-3xl shadow-2xl z-10 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        {/* State readout */}
        <div className="flex justify-between items-center text-xs font-black font-mono text-stone-400 uppercase tracking-widest px-1">
          <span>Zoom: <span className="text-amber-400 font-bold">{Math.round(scale * 100)}%</span></span>
          <span>Rotation: <span className="text-amber-400 font-bold">{rotation}°</span></span>
        </div>

        {/* Thumbnail Pagination dots if multiple images */}
        {imageList.length > 1 && (
          <div className="flex justify-center gap-1.5 py-1">
            {imageList.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => { setActiveIdx(idx); handleReset(); }}
                className={`h-2 rounded-full transition-all duration-300 ${activeIdx === idx ? 'w-6 bg-amber-500' : 'w-2 bg-stone-700 hover:bg-stone-600'}`}
                title={`Go to image ${idx + 1}`}
              />
            ))}
          </div>
        )}

        {/* Interaction buttons */}
        <div className="grid grid-cols-5 gap-2">
          <button 
            type="button"
            onClick={handleZoomOut}
            className="flex flex-col items-center justify-center p-2 bg-stone-850 hover:bg-stone-800 text-stone-300 hover:text-white rounded-2xl border border-stone-800 transition-colors"
            title="Zoom Out (-)"
          >
            <ZoomOut className="w-4 h-4 mb-1" />
            <span className="text-xs font-bold uppercase tracking-wide">Out</span>
          </button>
          
          <button 
            type="button"
            onClick={handleZoomIn}
            className="flex flex-col items-center justify-center p-2 bg-stone-850 hover:bg-stone-800 text-stone-300 hover:text-white rounded-2xl border border-stone-800 transition-colors"
            title="Zoom In (+)"
          >
            <ZoomIn className="w-4 h-4 mb-1" />
            <span className="text-xs font-bold uppercase tracking-wide">In</span>
          </button>

          <button 
            type="button"
            onClick={handleRotateLeft}
            className="flex flex-col items-center justify-center p-2 bg-stone-850 hover:bg-stone-800 text-stone-300 hover:text-white rounded-2xl border border-stone-800 transition-colors"
            title="Rotate Counter-Clockwise"
          >
            <RotateCcw className="w-4 h-4 mb-1" />
            <span className="text-xs font-bold uppercase tracking-wide">90° L</span>
          </button>

          <button 
            type="button"
            onClick={handleRotateRight}
            className="flex flex-col items-center justify-center p-2 bg-stone-850 hover:bg-stone-800 text-stone-300 hover:text-white rounded-2xl border border-stone-800 transition-colors"
            title="Rotate Clockwise"
          >
            <RotateCw className="w-4 h-4 mb-1" />
            <span className="text-xs font-bold uppercase tracking-wide">90° R</span>
          </button>

          <button 
            type="button"
            onClick={handleReset}
            className="flex flex-col items-center justify-center p-2 bg-amber-500 hover:bg-amber-400 text-stone-900 rounded-2xl font-black transition-colors"
            title="Reset to Fit (R)"
          >
            <ResetIcon className="w-4 h-4 mb-1 text-stone-900" />
            <span className="text-xs uppercase tracking-wide">Reset</span>
          </button>
        </div>
      </div>
    </motion.div>,
    document.body
  );
}
