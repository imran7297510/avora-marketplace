import React, { useRef } from 'react';

export function useDragScroll(ref: React.RefObject<HTMLDivElement | null>) {
  const dragInfo = useRef({
    isDown: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    maxScroll: 0,
    isScrollingVertically: false,
    isScrollingHorizontally: false,
  });

  const handleStart = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    dragInfo.current.isDown = true;
    dragInfo.current.startX = clientX;
    dragInfo.current.startY = clientY;
    dragInfo.current.scrollLeft = el.scrollLeft;
    dragInfo.current.maxScroll = el.scrollWidth - el.clientWidth;
    dragInfo.current.isScrollingVertically = false;
    dragInfo.current.isScrollingHorizontally = false;

    el.classList.remove('scroll-smooth');
    el.style.scrollBehavior = 'auto';
  };

  const handleEnd = () => {
    dragInfo.current.isDown = false;
    dragInfo.current.isScrollingVertically = false;
    dragInfo.current.isScrollingHorizontally = false;
    const el = ref.current;
    if (el) {
      el.classList.add('scroll-smooth');
      el.style.scrollBehavior = 'smooth';
    }
  };

  const handleMove = (clientX: number, clientY: number, e: { preventDefault: () => void; cancelable?: boolean }) => {
    const info = dragInfo.current;
    if (!info.isDown) return;
    
    // We only process mouse events now, so vertical/horizontal checking is less strictly needed
    // However, we'll keep it for robustness.
    if (info.isScrollingVertically) return;

    const el = ref.current;
    if (!el) return;

    const dx = Math.abs(clientX - info.startX);
    const dy = Math.abs(clientY - info.startY);

    if (!info.isScrollingHorizontally && !info.isScrollingVertically) {
       if (dx > 5 || dy > 5) {
         if (dy > dx) {
           info.isScrollingVertically = true;
           return;
         } else {
           info.isScrollingHorizontally = true;
         }
       } else {
         return;
       }
    }

    if (info.isScrollingHorizontally) {
       if (e.cancelable !== false) {
           e.preventDefault();
       }
       const walk = (clientX - info.startX) * 1.5;
       let newScroll = info.scrollLeft - walk;
       newScroll = Math.max(0, Math.min(newScroll, info.maxScroll));
       el.scrollLeft = newScroll;
    }
  };

  return {
    onMouseDown: (e: React.MouseEvent) => handleStart(e.pageX, e.pageY),
    onMouseLeave: handleEnd,
    onMouseUp: handleEnd,
    onMouseMove: (e: React.MouseEvent) => handleMove(e.pageX, e.pageY, e),
    // Touch events are intentionally omitted. 
    // This allows native CSS 'overflow-x-auto' to handle mobile 
    // swipes natively, eliminating scroll-vs-swipe gesture conflicts.
  };
}

export function scrollContainer(ref: React.RefObject<HTMLDivElement | null>, direction: 'left' | 'right') {
  if (ref.current) {
    const scrollAmount = window.innerWidth < 768 ? window.innerWidth * 0.8 : 400;
    const targetScroll = ref.current.scrollLeft + (direction === 'left' ? -scrollAmount : scrollAmount);
    ref.current.scrollTo({
      left: targetScroll,
      behavior: 'smooth'
    });
  }
}

