import { useCallback, useEffect, useRef } from 'react';

/**
 * Permite arrastar (pan) horizontalmente um contêiner rolável clicando em
 * espaços vazios (colunas/áreas vazias), como no Trello. Só atua com mouse
 * (ponteiro fino); em toque a rolagem nativa continua valendo.
 *
 * Ignora cliques em elementos interativos (cards, botões, links, inputs…) e em
 * qualquer elemento marcado com `data-no-drag-scroll`, para não atrapalhar o
 * clique nos cartões.
 *
 * Retorna um callback ref — funciona mesmo quando o contêiner é montado/desmontado
 * condicionalmente (ex.: trocar o modo de visualização do quadro).
 */
export function useDragScroll<T extends HTMLElement = HTMLDivElement>(enabled = true) {
  const cleanupRef = useRef<(() => void) | null>(null);

  const setNode = useCallback(
    (el: T | null) => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      if (!el || !enabled) return;
      if (
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        !window.matchMedia('(pointer: fine)').matches
      ) {
        return;
      }

      let isDown = false;
      let moved = false;
      let startX = 0;
      let startScroll = 0;

      const isInteractive = (target: EventTarget | null): boolean => {
        const node = target as HTMLElement | null;
        if (!node || typeof node.closest !== 'function') return false;
        return !!node.closest(
          'button, a, input, textarea, select, [role="button"], [contenteditable="true"], [draggable="true"], [data-no-drag-scroll]'
        );
      };

      const onMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return;
        if (isInteractive(e.target)) return;
        if (el.scrollWidth <= el.clientWidth) return;
        isDown = true;
        moved = false;
        startX = e.pageX;
        startScroll = el.scrollLeft;
      };

      const onMouseMove = (e: MouseEvent) => {
        if (!isDown) return;
        const dx = e.pageX - startX;
        if (!moved && Math.abs(dx) > 4) {
          moved = true;
          el.classList.add('cursor-grabbing', 'select-none');
        }
        if (moved) {
          e.preventDefault();
          el.scrollLeft = startScroll - dx;
        }
      };

      const endDrag = () => {
        if (!isDown) return;
        isDown = false;
        el.classList.remove('cursor-grabbing', 'select-none');
        if (moved) {
          // Evita que o clique disparado após o arrasto abra um card por engano.
          const cancelClick = (ev: MouseEvent) => {
            ev.stopPropagation();
            ev.preventDefault();
            window.removeEventListener('click', cancelClick, true);
          };
          window.addEventListener('click', cancelClick, true);
          window.setTimeout(() => window.removeEventListener('click', cancelClick, true), 150);
        }
        moved = false;
      };

      el.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', endDrag);

      cleanupRef.current = () => {
        el.removeEventListener('mousedown', onMouseDown);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', endDrag);
        el.classList.remove('cursor-grabbing', 'select-none');
      };
    },
    [enabled]
  );

  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

  return setNode;
}
