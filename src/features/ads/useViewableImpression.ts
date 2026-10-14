import { useEffect, type RefObject } from 'react';

const MIN_RATIO = 0.5;
const MIN_MS = 1000;

/**
 * Calls `onView` once per `key` when the element has been at least 50% visible for 1 continuous second while the tab
 * is in front (the IAB viewable-impression rule; ADS-013). Scrolling away, switching tabs or a new key resets the
 * timer. Browsers without IntersectionObserver never count, which under-counts rather than over-counts.
 */
export function useViewableImpression(ref: RefObject<Element>, key: string | undefined, onView: () => void) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !key || typeof IntersectionObserver === 'undefined') return;
    let visible = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let done = false;

    const stop = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    };
    const check = () => {
      if (done) return;
      if (visible && document.visibilityState === 'visible') {
        timer ??= setTimeout(() => {
          done = true;
          observer.disconnect();
          onView();
        }, MIN_MS);
      } else {
        stop();
      }
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting && entry.intersectionRatio >= MIN_RATIO;
        check();
      },
      { threshold: [0, MIN_RATIO, 1] },
    );
    observer.observe(el);
    document.addEventListener('visibilitychange', check);
    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', check);
    };
    // onView is read when the timer fires; a new callback identity shouldn't restart the count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, key]);
}
