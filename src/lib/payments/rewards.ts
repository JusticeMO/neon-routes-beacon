import { maskPhone, type FareRequest, type Receipt } from './provider';
import { saveReceipt } from './jipayMock';
import { DEMO_SACCO_PAYMENTS, paybillAccountFor } from '@/lib/demo/demoMode';
import { redeemVoucher, type FareVoucher } from '@/lib/demo/tapLeaderboard';
import { pointsForFare, spendPoints } from '@/lib/demo/adPoints';

/**
 * MOCK fares the commuter doesn't pay for: a Beacon Tap prize (the round's
 * sponsor pays) or Beacon points (advertisers fund them). Either way the full
 * fare goes into the SACCO's PayBill with the vehicle plate as account number,
 * so the crew and SACCO are paid as for any other fare.
 */
function receiptFor(req: FareRequest, method: 'prize' | 'points', provider: string, prefix: string): Receipt {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  return {
    transactionId: prefix + Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''),
    provider,
    method,
    paybill: DEMO_SACCO_PAYMENTS.mpesaPaybill,
    accountRef: paybillAccountFor(req.vehiclePlate),
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
}

export async function payWithPrize(req: FareRequest, voucher: FareVoucher): Promise<Receipt> {
  await new Promise(r => setTimeout(r, 900));
  const receipt = receiptFor(req, 'prize', `Beacon Tap prize (${voucher.sponsor})`, 'BT');
  saveReceipt(receipt);
  redeemVoucher();
  return receipt;
}

export async function payWithPoints(req: FareRequest): Promise<Receipt> {
  await new Promise(r => setTimeout(r, 900));
  const pts = pointsForFare(req.amountKsh);
  if (!spendPoints(pts)) throw new Error('Not enough points');
  const receipt = receiptFor(req, 'points', `Beacon points (${pts} pts)`, 'BP');
  saveReceipt(receipt);
  return receipt;
}
