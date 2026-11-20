import { maskPhone, type FareRequest, type PaymentProvider, type Receipt } from './provider';

/**
 * MOCK Jipay wallet. Simulates the wallet confirming a fare after a short
 * delay. No network calls and no money moves. Replace with the real Jipay
 * adapter once their API, settlement, refunds, transaction ids and
 * vehicle-level attribution are confirmed.
 */
export const jipayMock: PaymentProvider = {
  id: 'jipay',
  name: 'Jipay',
  async pay(req: FareRequest): Promise<Receipt> {
    await new Promise(r => setTimeout(r, 1400));
    const id = `JPD${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1e4).toString().padStart(4, '0')}`;
    const receipt: Receipt = {
      transactionId: id,
      provider: 'Jipay',
      routeNumber: req.routeNumber,
      routeName: req.routeName,
      vehiclePlate: req.vehiclePlate,
      vehicleId: req.vehicleId,
      boardingStage: req.boardingStage,
      amountKsh: req.amountKsh,
      phoneMasked: maskPhone(req.phone),
      paidAt: new Date().toISOString(),
      status: 'confirmed',
      demo: true,
    };
    saveReceipt(receipt);
    return receipt;
  },
};

const KEY = 'beacon.demo.receipts';

export function readReceipts(): Receipt[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Receipt[];
  } catch {
    return [];
  }
}

function saveReceipt(r: Receipt) {
  try {
    localStorage.setItem(KEY, JSON.stringify([r, ...readReceipts()].slice(0, 50)));
  } catch {
    /* storage blocked */
  }
}
