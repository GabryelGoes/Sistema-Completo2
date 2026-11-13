/**
 * Reservas “Em Orçamentos”: abate o que já foi entregue na OS via produtos do estoque.
 */
import {
  collectPendingStockReservations,
  buildDeliveredQtyByOsAndPart,
} from '../utils/workshopPartReservations.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const SO = {
  id: 'os-1',
  plate: 'ABC1D23',
  vehicle_model: 'Civic',
  os_number: 12,
  status: 'EM_SERVICO',
};

const budget = {
  id: 'b-1',
  card_name: 'Orçamento 1',
  service_order_id: 'os-1',
  parts: [
    {
      description: 'Fluido de freio',
      quantity: '2',
      fromStock: true,
      workshopPartId: 'part-fluido',
    },
    {
      description: 'Filtro de óleo',
      quantity: 1,
      workshopPartId: 'part-filtro',
      fromStock: true,
    },
  ],
};

{
  const raw = collectPendingStockReservations({
    budgets: [budget],
    serviceOrders: [SO],
  });
  assert(raw.items.length === 2, 'sem baixas: 2 linhas');
  assert(raw.reservedQtyByPartId['part-fluido'] === 2, 'fluido reserved 2');
  assert(raw.reservedQtyByPartId['part-filtro'] === 1, 'filtro reserved 1');
}

{
  const afterFull = collectPendingStockReservations({
    budgets: [budget],
    serviceOrders: [SO],
    deliveries: [{ serviceOrderId: 'os-1', partId: 'part-fluido', quantity: 2 }],
  });
  assert(
    afterFull.items.every((i) => i.workshopPartId !== 'part-fluido'),
    'fluido some após entregar 2 na OS'
  );
  assert(afterFull.items.length === 1, 'resta só o filtro');
  assert(afterFull.reservedQtyByPartId['part-fluido'] == null, 'fluido fora do mapa');
  assert(afterFull.reservedQtyByPartId['part-filtro'] === 1, 'filtro permanece');
}

{
  const partial = collectPendingStockReservations({
    budgets: [budget],
    serviceOrders: [SO],
    deliveries: [{ serviceOrderId: 'os-1', partId: 'part-fluido', quantity: 1 }],
  });
  const fluido = partial.items.find((i) => i.workshopPartId === 'part-fluido');
  assert(fluido?.quantity === 1, 'entrega parcial deixa 1 em orçamento');
  assert(partial.reservedQtyByPartId['part-fluido'] === 1, 'mapa parcial = 1');
}

{
  const otherOs = collectPendingStockReservations({
    budgets: [budget],
    serviceOrders: [SO],
    deliveries: [{ serviceOrderId: 'os-outra', partId: 'part-fluido', quantity: 99 }],
  });
  assert(otherOs.reservedQtyByPartId['part-fluido'] === 2, 'baixa de outra OS não abate');
}

{
  const map = buildDeliveredQtyByOsAndPart([
    { serviceOrderId: 'os-1', partId: 'p1', quantity: 1 },
    { serviceOrderId: 'os-1', partId: 'p1', quantity: 1.5 },
  ]);
  assert(map.get('os-1::p1') === 2.5, 'soma entregas do mesmo produto');
}

{
  const finalized = collectPendingStockReservations({
    budgets: [budget],
    serviceOrders: [{ ...SO, status: 'FINALIZADO' }],
    deliveries: [],
  });
  assert(finalized.items.length === 0, 'OS finalizada não lista reserva');
}

console.log('workshopPartReservations.selftest: ok');
