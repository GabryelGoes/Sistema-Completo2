/**
 * Rode: npx tsx scripts/pecasLabelSvg.selftest.ts
 */
import {
  formatPecasLabelCliente,
  formatPecasLabelCor,
  formatPecasLabelModelo,
  formatPecasLabelPlate,
  preparePecasLabelSvgMarkupForTest,
  resolvePecasLabelValues,
  pecasBaseSvg,
  mapaCamposPecas,
  PECAS_FIELD_IDS,
} from '../utils/pecasLabelSvg.ts';

let failed = 0;

function ok(label: string, cond: boolean) {
  if (cond) console.log(`  OK  ${label}`);
  else {
    failed += 1;
    console.log(`  FAIL ${label}`);
  }
}

console.log('pecasLabelSvg selftest\n');

ok('SVG-base não vazio', String(pecasBaseSvg).includes('viewBox="0 0 500 300"'));
ok('SVG tem marca-pecas', /id="marca-pecas"/.test(pecasBaseSvg));
ok('SVG tem texto PEÇAS', /PEÇAS/.test(pecasBaseSvg));
ok('SVG tem BRASIL fixo', />BRASIL</.test(pecasBaseSvg));
ok('SVG tem campo-modelo', /id="campo-modelo"/.test(pecasBaseSvg));
ok('SVG tem campo-cor', /id="campo-cor"/.test(pecasBaseSvg));
ok('SVG tem campo-cliente', /id="campo-cliente"/.test(pecasBaseSvg));
ok('SVG tem campo-placa', /id="campo-placa"/.test(pecasBaseSvg));
ok(
  'mapa 50×30',
  mapaCamposPecas.dimensions.width_mm === 50 && mapaCamposPecas.dimensions.height_mm === 30
);
ok('mapa 4 campos', mapaCamposPecas.fields.length === 4);
ok('ids alinhados', PECAS_FIELD_IDS.modelo === 'campo-modelo');

ok('placa upper sem inventar hífen', formatPecasLabelPlate('jaw1941') === 'JAW1941');
ok('placa mercosul preserva', formatPecasLabelPlate('azk4b21') === 'AZK4B21');
ok('modelo upper', formatPecasLabelModelo('wrangler') === 'WRANGLER');
ok('cor upper', formatPecasLabelCor('branca') === 'BRANCA');
ok('cliente sem prefixo', formatPecasLabelCliente('Mecânica Líder') === 'Mecânica Líder');
ok(
  'cliente remove prefixo se vier',
  formatPecasLabelCliente('Cliente: João') === 'João'
);

const sample = resolvePecasLabelValues({
  vehicleModel: 'WRANGLER',
  vehicleColor: 'BRANCA',
  customerName: 'MECÂNICA LÍDER',
  plate: 'JAW1941',
});
ok('sample modelo', sample.modelo === 'WRANGLER');
ok('sample cor', sample.cor === 'BRANCA');
ok('sample cliente', sample.cliente === 'MECÂNICA LÍDER');
ok('sample placa', sample.placa === 'JAW1941');

const filled = preparePecasLabelSvgMarkupForTest({
  vehicleModel: 'WRANGLER',
  vehicleColor: 'BRANCA',
  customerName: 'MECÂNICA LÍDER',
  plate: 'JAW1941',
});

function textContentOf(id: string, markup: string): string | null {
  const m = markup.match(new RegExp(`<text\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</text>`, 'i'));
  return m ? m[1] : null;
}

ok('fill modelo', textContentOf('campo-modelo', filled.svgMarkup) === 'WRANGLER');
ok('fill cor', textContentOf('campo-cor', filled.svgMarkup) === 'BRANCA');
ok('fill cliente', textContentOf('campo-cliente', filled.svgMarkup) === 'MECÂNICA LÍDER');
ok('fill placa', textContentOf('campo-placa', filled.svgMarkup) === 'JAW1941');
ok('fill não hardcoda exemplos no base vazio', !/>WRANGLER</.test(pecasBaseSvg));

const long = preparePecasLabelSvgMarkupForTest({
  vehicleModel: 'JEEP WRANGLER UNLIMITED RUBICON 4XE',
  vehicleColor: 'PRETO METÁLICO BRILHANTE',
  customerName: 'Oficina Mecânica Especializada do Vale do Paraíba Ltda',
  plate: 'ABC1D23',
});
ok(
  'modelo longo preenchido',
  (textContentOf('campo-modelo', long.svgMarkup) || '').includes('JEEP')
);
ok('placa mercosul fill', textContentOf('campo-placa', long.svgMarkup) === 'ABC1D23');

const empty = preparePecasLabelSvgMarkupForTest({
  vehicleModel: '',
  vehicleColor: '',
  customerName: '',
  plate: '',
});
ok('ausentes viram traço', textContentOf('campo-modelo', empty.svgMarkup) === '—');
ok('ausentes cor', textContentOf('campo-cor', empty.svgMarkup) === '—');

if (failed) {
  console.error(`\npecasLabelSvg.selftest: ${failed} falha(s)`);
  process.exit(1);
}
console.log('\npecasLabelSvg.selftest: ok');
