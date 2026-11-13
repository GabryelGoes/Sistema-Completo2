import { collectMaintenanceVisitParts } from '../utils/vehicleMaintenanceParts.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

{
  const parts = collectMaintenanceVisitParts({
    budgetParts: [
      { description: 'Pastilha genérica', quantity: '2', approved: true },
      {
        description: 'Fluido de freio',
        quantity: '2',
        approved: true,
        fromStock: true,
        workshopPartId: 'p-fluido',
        budgetId: 'b1',
      },
      {
        description: 'Filtro',
        quantity: 1,
        approved: true,
        workshopPartId: 'p-filtro',
        fromStock: true,
      },
    ],
    deliveries: [],
  });
  assert(parts.length === 1, 'sem retirada: só peça fora do estoque');
  assert(parts[0]?.description === 'Pastilha genérica', 'pastilha ok');
  assert(parts[0]?.fromStock === false, 'pastilha não é estoque');
}

{
  const parts = collectMaintenanceVisitParts({
    budgetParts: [
      {
        description: 'Fluido de freio',
        quantity: '2',
        approved: true,
        fromStock: true,
        workshopPartId: 'p-fluido',
        budgetId: 'b1',
      },
      { description: 'Pastilha', quantity: '1', approved: true },
    ],
    deliveries: [
      { partId: 'p-fluido', quantity: 1, partName: 'Fluido DOT4' },
      { partId: 'p-fluido', quantity: 1, partName: 'Fluido DOT4' },
    ],
  });
  assert(parts.length === 2, 'pastilha + fluido retirado');
  const fluido = parts.find((p) => p.workshopPartId === 'p-fluido');
  assert(fluido?.quantity === '2', 'qtd = soma das baixas');
  assert(fluido?.fromStock === true, 'fluido fromStock');
  assert(fluido?.budgetId === 'b1', 'liga ao orçamento');
  assert(fluido?.description === 'Fluido DOT4', 'nome da baixa');
  assert(parts.some((p) => p.description === 'Pastilha' && !p.fromStock), 'pastilha permanece');
}

{
  const parts = collectMaintenanceVisitParts({
    budgetParts: [
      {
        description: 'Fluido',
        quantity: '2',
        approved: true,
        fromStock: true,
        workshopPartId: 'p-fluido',
      },
    ],
    deliveries: [{ partId: 'p-extra', quantity: 1, partName: 'Óleo 5W30' }],
  });
  assert(parts.length === 1, 'só a baixa confirmada; fluido aprovado sem retirada some');
  assert(parts[0]?.description === 'Óleo 5W30', 'baixa avulsa entra');
  assert(parts[0]?.fromStock === true, 'extra é estoque');
}

console.log('vehicleMaintenanceParts.selftest: ok');
