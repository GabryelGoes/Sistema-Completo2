/**
 * Rode: npx tsx scripts/chaveLabelSvg.selftest.ts
 */
import {
  formatChaveLabelCliente,
  formatChaveLabelCor,
  formatChaveLabelModelo,
  formatChaveLabelPlate,
  prepareChaveLabelSvgMarkupForTest,
  resolveChaveLabelValues,
  chaveBaseSvg,
  mapaCampos,
  CHAVE_FIELD_BASE_POS,
} from '../utils/chaveLabelSvg.ts';
import {
  createDefaultChaveSvgOptions,
  createDefaultChaveTemplate,
  normalizeChaveSvgOptions,
  normalizeLabelTemplate,
} from '../utils/labelTemplates.ts';

let failed = 0;

function ok(label: string, cond: boolean) {
  if (cond) console.log(`  OK  ${label}`);
  else {
    failed += 1;
    console.log(`  FAIL ${label}`);
  }
}

console.log('chaveLabelSvg selftest\n');

ok('SVG-base não vazio', String(chaveBaseSvg).includes('viewBox="0 0 500 300"'));
ok('SVG tem modelo-1/2', /id="modelo-1"/.test(chaveBaseSvg) && /id="modelo-2"/.test(chaveBaseSvg));
ok('SVG tem cor-1/2', /id="cor-1"/.test(chaveBaseSvg) && /id="cor-2"/.test(chaveBaseSvg));
ok('SVG tem cliente-1/2', /id="cliente-1"/.test(chaveBaseSvg) && /id="cliente-2"/.test(chaveBaseSvg));
ok('SVG tem placa-1/2', /id="placa-1"/.test(chaveBaseSvg) && /id="placa-2"/.test(chaveBaseSvg));
ok('SVG textos a -90°', /rotate\(-90/.test(chaveBaseSvg));
ok('modelo/cor na faixa preta (classe)', /chave-field-on-black/.test(chaveBaseSvg));
ok('modelo base dentro da faixa', CHAVE_FIELD_BASE_POS.modelo.x >= 12 && CHAVE_FIELD_BASE_POS.modelo.x <= 90);
ok('cor base dentro da faixa', CHAVE_FIELD_BASE_POS.cor.onBlack === true);
ok('cliente fora da faixa', CHAVE_FIELD_BASE_POS.cliente.onBlack === false);
ok('mapa_campos 50×30', mapaCampos.dimensions.width_mm === 50 && mapaCampos.dimensions.height_mm === 30);
ok('mapa fold 250', mapaCampos.dimensions.fold_line_x === 250);
ok('mapa modelo faixa_preta', mapaCampos.fields.modelo.region === 'faixa_preta');

ok('placa antiga sem hífen inventado', formatChaveLabelPlate('jaw 1941') === 'JAW 1941' || formatChaveLabelPlate('jaw1941') === 'JAW1941');
ok('placa mercosul preserva chars', formatChaveLabelPlate('azk4b21') === 'AZK4B21');
ok('placa só limpa espaços', formatChaveLabelPlate('  abc 1d23 ') === 'ABC 1D23');
ok('modelo upper', formatChaveLabelModelo('wrangler') === 'WRANGLER');
ok('cor upper', formatChaveLabelCor('branca') === 'BRANCA');
ok('cliente com prefixo', formatChaveLabelCliente('Mecânica Líder') === 'Cliente: Mecânica Líder');

const sample = resolveChaveLabelValues({
  vehicleModel: 'WRANGLER',
  vehicleColor: 'BRANCA',
  customerName: 'MECÂNICA LÍDER',
  plate: 'JAW1941',
});
ok('sample modelo', sample.modelo === 'WRANGLER');
ok('sample cor', sample.cor === 'BRANCA');
ok('sample cliente', sample.cliente === 'Cliente: MECÂNICA LÍDER');
ok('sample placa', sample.placa === 'JAW1941');

const filled = prepareChaveLabelSvgMarkupForTest({
  vehicleModel: 'WRANGLER',
  vehicleColor: 'BRANCA',
  customerName: 'MECÂNICA LÍDER',
  plate: 'JAW1941',
});

function textContentOf(id: string, markup: string): string | null {
  const m = markup.match(new RegExp(`<text\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</text>`, 'i'));
  return m ? m[1] : null;
}

const m1 = textContentOf('modelo-1', filled.svgMarkup);
const m2 = textContentOf('modelo-2', filled.svgMarkup);
const c1 = textContentOf('cor-1', filled.svgMarkup);
const c2 = textContentOf('cor-2', filled.svgMarkup);
const cl1 = textContentOf('cliente-1', filled.svgMarkup);
const cl2 = textContentOf('cliente-2', filled.svgMarkup);
const p1 = textContentOf('placa-1', filled.svgMarkup);
const p2 = textContentOf('placa-2', filled.svgMarkup);

ok('faces modelo idênticas', m1 === 'WRANGLER' && m1 === m2);
ok('faces cor idênticas', c1 === 'BRANCA' && c1 === c2);
ok('faces cliente idênticas', cl1 === 'Cliente: MECÂNICA LÍDER' && cl1 === cl2);
ok('faces placa idênticas', p1 === 'JAW1941' && p1 === p2);

const long = prepareChaveLabelSvgMarkupForTest({
  vehicleModel: 'LAND ROVER RANGE ROVER SPORT HSE DYNAMIC',
  vehicleColor: 'PRETO METÁLICO PEROLIZADO',
  customerName: 'Transportadora Brasileira de Veículos Especiais LTDA',
  plate: 'ABC1D23',
});
ok(
  'modelo longo preenchido nas duas faces',
  textContentOf('modelo-1', long.svgMarkup) === textContentOf('modelo-2', long.svgMarkup) &&
    (textContentOf('modelo-1', long.svgMarkup) || '').includes('LAND')
);
ok(
  'placa mercosul sem hífen forçado',
  textContentOf('placa-1', long.svgMarkup) === 'ABC1D23'
);

const missing = prepareChaveLabelSvgMarkupForTest({
  vehicleModel: '',
  vehicleColor: '',
  customerName: '',
  plate: '',
});
ok('campo ausente vira traço', textContentOf('modelo-1', missing.svgMarkup) === '—');
ok(
  'cliente ausente com prefixo',
  textContentOf('cliente-1', missing.svgMarkup) === 'Cliente: —'
);

ok('modelo preenchido em branco', /id="modelo-1"[^>]*fill="#ffffff"/.test(filled.svgMarkup));
ok('cor preenchida em branco', /id="cor-1"[^>]*fill="#ffffff"/.test(filled.svgMarkup));
ok('cliente em preto', /id="cliente-1"[^>]*fill="#000000"/.test(filled.svgMarkup));
ok('modelo na faixa ampliada (x=42)', /id="modelo-1"[^>]*x="42"/.test(filled.svgMarkup));
ok('faixa preta ampliada no SVG', /id="faixa-preta-1"[^>]*width="102"/.test(chaveBaseSvg));
ok('placa menor no SVG', /width="68" height="220"/.test(chaveBaseSvg));

const shifted = prepareChaveLabelSvgMarkupForTest(
  {
    vehicleModel: 'WRANGLER',
    vehicleColor: 'BRANCA',
    customerName: 'MECÂNICA LÍDER',
    plate: 'JAW1941',
  },
  normalizeChaveSvgOptions({
    fields: {
      ...createDefaultChaveSvgOptions().fields,
      modelo: {
        ...createDefaultChaveSvgOptions().fields.modelo,
        offsetX: 4,
        offsetY: -10,
        fontSize: 32,
      },
    },
  })
);
ok(
  'offset X/Y aplicados',
  /id="modelo-1"[^>]*x="46"/.test(shifted.svgMarkup) &&
    /id="modelo-1"[^>]*y="140"/.test(shifted.svgMarkup)
);
ok('fontSize do editor aplicado', /id="modelo-1"[^>]*font-size="32"/.test(shifted.svgMarkup));

const tpl = createDefaultChaveTemplate();
ok('template chave v5+', tpl.version >= 5 && !!tpl.chaveSvgOptions);
ok(
  'normalize injeta chaveSvgOptions',
  !!normalizeLabelTemplate('chave', { version: 3 }).chaveSvgOptions
);

// Garante que o markup de teste não usa interpolação solta quebrando tags
ok('SVG ainda bem formado', filled.svgMarkup.includes('</svg>'));
ok('sem script injetado', !/<script/i.test(filled.svgMarkup));

if (failed > 0) {
  console.log(`\n${failed} falha(s)`);
  process.exit(1);
}
console.log('\nchaveLabelSvg.selftest: ok');
