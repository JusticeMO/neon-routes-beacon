/**
 * Payment is an optional layer on top of tracking. Every provider (Jipay,
 * M-PESA, SasaPay) sits behind this interface; the UI never talks to a
 * provider directly. Tracking never requires payment and cash keeps working.
 */
export interface FareRequest {
  routeNumber: string;
  routeName: string;
  vehiclePlate: string;
  vehicleId: string;
  boardingStage: string;
  amountKsh: number;
  phone: string;
}

export type PaymentMethod = 'jipay' | 'mpesa-paybill';

export interface Receipt {
  transactionId: string;
  provider: string;
  method?: PaymentMethod;
  /** M-PESA PayBill business number and account number, when paid by PayBill. */
  paybill?: string;
  accountRef?: string;
  routeNumber: string;
  routeName: string;
  vehiclePlate: string;
  vehicleId: string;
  boardingStage: string;
  amountKsh: number;
  phoneMasked: string;
  paidAt: string;
  status: 'confirmed' | 'failed';
  /** True for the mocked provider: no money moved. */
  demo: boolean;
}

export interface PaymentProvider {
  id: string;
  name: string;
  pay(req: FareRequest): Promise<Receipt>;
}

export function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  return d.length < 7 ? phone : `${d.slice(0, 4)}•••${d.slice(-3)}`;
}
