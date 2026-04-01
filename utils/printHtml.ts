/**
 * Abre o diálogo de impressão com HTML (ex.: orçamento) sem depender de pop-up.
 * Evita bloqueio de `window.open` e falhas de timing com `window.onload` na janela nova.
 */
export function printHtmlDocument(htmlFullDocument: string): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(iframe);

  const idoc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!idoc || !win) {
    iframe.remove();
    return;
  }

  idoc.open();
  idoc.write(htmlFullDocument);
  idoc.close();

  const cleanup = () => {
    try {
      iframe.remove();
    } catch {
      /* ignore */
    }
  };

  const runPrint = () => {
    try {
      win.focus();
      win.print();
    } catch {
      /* ignore */
    } finally {
      setTimeout(cleanup, 750);
    }
  };

  setTimeout(runPrint, 200);
}
