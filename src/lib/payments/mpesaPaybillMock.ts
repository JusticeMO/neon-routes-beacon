import { maskPhone, type FareRequest, type PaymentProvider, type Receipt } from './provider';
import { saveReceipt } from './jipayMock';
import { DEMO_SACCO_PAYMENTS, paybillAccountFor } from '@/lib/demo/demoMode';

/**
 * MOCK M-PESA PayBill to the SACCO's own PayBill number. Stands in for an
 * M-PESA Express (STK push) request: the commuter confirms with their PIN on
 * the phone and the SACCO's PayBill receives the fare with the vehicle plate
 * as the account number. No network calls and no money moves.
 */
export const mpesaPaybillMock: PaymentProvider = {
  id: 'mpesa-paybill',
  name: 'M-PESA PayBill',
  async pay(req: FareRequest): Promise<Receipt> {
    await new Promise(r => setTimeout(r, 2200));
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
    const id = 'SK' + Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const receipt: Receipt = {
      transactionId: id,
      provider: 'M-PESA PayBill',
      method: 'mpesa-paybill',
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
    saveReceipt(receipt);
    return receipt;
  },
};
