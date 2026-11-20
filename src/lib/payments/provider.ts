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
  /** Account number the commuter entered (Jipay PayBill). Defaults to the vehicle plate. */
  accountRef?: string;
}

/**
 * 'prize': a Beacon Tap win; the round's sponsor pays the fare.
 * 'points': Beacon points earned by watching ads; advertisers fund the fare.
 * Both pay the SACCO's PayBill in full, so the crew is paid as for any fare.
 */
export type PaymentMethod = 'jipay' | 'mpesa-paybill' | 'prize' | 'points';

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
