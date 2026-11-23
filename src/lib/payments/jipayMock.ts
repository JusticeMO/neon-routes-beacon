import { maskPhone, type FareRequest, type PaymentProvider, type Receipt } from './provider';
import { JIPAY_PAYBILL, paybillAccountFor } from '@/lib/demo/demoMode';

/**
 * MOCK Jipay. Jipay gives one fixed PayBill, so the commuter only enters an
 * account number (the vehicle's, shown on the matatu) and confirms the M-PESA
 * prompt; Jipay settles the fare to the SACCO. Simulated after a short delay. No network calls and no money moves. Replace with the real Jipay
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
      method: 'jipay',
      paybill: JIPAY_PAYBILL,
      accountRef: paybillAccountFor(req.accountRef || req.vehiclePlate),
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

/** Adds a receipt, or replaces the one with the same transaction id (a pending fare that later confirmed). */
export function saveReceipt(r: Receipt) {
  try {
    localStorage.setItem(KEY, JSON.stringify([r, ...readReceipts().filter(x => x.transactionId !== r.transactionId)].slice(0, 50)));
  } catch {
    /* storage blocked */
  }
}
