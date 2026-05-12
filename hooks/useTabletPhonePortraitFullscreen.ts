import { useEffect, useState } from "react";

/** Celular/tablet em retrato — mesmo critério do `max-lg` do Tailwind (1023px). */
const MEDIA_QUERY = "(max-width: 1023px) and (orientation: portrait)";

export function useTabletPhonePortraitFullscreen(): boolean {
  const [active, setActive] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.matchMedia(MEDIA_QUERY).matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(MEDIA_QUERY);
    const sync = () => setActive(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return active;
}
