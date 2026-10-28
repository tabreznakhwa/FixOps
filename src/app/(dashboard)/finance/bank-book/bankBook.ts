export const BANK_MODES = ['bank_transfer', 'cheque', 'pos', 'online', 'card', 'knet'] as const

export const MODE_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer', cheque: 'Cheque', pos: 'POS',
  online: 'Online', card: 'Card', knet: 'KNET',
}

const CATEGORY_LABELS: Record<string, string> = {
  rent: 'Rent', electricity: 'Electricity', water: 'Water', phone: 'Phone / Mobile',
  internet: 'Internet', stationery: 'Stationery & Office', fuel: 'Fuel & Transport',
  vehicle_maintenance: 'Vehicle Maintenance', tools_equipment: 'Tools & Equipment',
  marketing: 'Marketing', bank_charges: 'Bank Charges', insurance: 'Insurance',
  professional_services: 'Professional Services', food_entertainment: 'Food & Refreshments',
  travel: 'Travel Expense', asset_purchase: 'Capital Asset Purchase', other: 'Miscellaneous',
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

type Receipt = { id: string; payment_date: string; payment_number: string; amount_received: number; payment_mode: string; reference_number: string | null; customers: { full_name: string } | null }
type SupplierPay = { id: string; payment_date: string; amount_paid: number; payment_mode: string; reference_number: string | null; suppliers: { supplier_name: string } | null }
type SupplierAdvance = { id: string; advance_date: string; amount: number; payment_mode: string; reference_number: string | null; suppliers: { supplier_name: string } | null }
type Expense = { id: string; expense_date: string; expense_number: string; category: string; description: string; amount: number; payment_method: string; reference_number: string | null }
type Salary = { id: string; payment_date: string; net_salary: number; payment_mode: string; staff: { full_name: string } | null; salary_runs: { salary_month: number; salary_year: number } | null }
type AdvancePay = { id: string; issued_date: string; type: string; amount: number; payment_method: string; notes: string | null; settlement_recovery_amount: number | null; staff: { full_name: string } | null }
type RepaymentPay = { id: string; repayment_date: string; amount: number; notes: string | null; staff: { full_name: string } | null }
type AmcPay = { id: string; payment_date: string; amount: number; payment_mode: string; reference_number: string | null; amc_contracts: { contract_number: string; customers: { full_name: string } | null } | null }
type Transfer = { id: string; transfer_date: string; from_account: string; to_account: string; amount: number; reference_number: string | null; notes: string | null }
type Withdrawal = { id: string; withdrawal_date: string; amount: number; payment_mode: string; purpose: string | null; notes: string | null }
type Bonus = { id: string; bonus_date: string; amount: number; payment_mode: string; notes: string | null; staff: { full_name: string } | null }
type AssetDisposal = { id: string; disposal_date: string; disposal_proceeds: number; disposal_payment_method: string; disposal_reference: string | null; asset_code: string; asset_name: string }

export type BankBookSources = {
  receipts: Receipt[]
  supplierPayments: SupplierPay[]
  supplierAdvances: SupplierAdvance[]
  expenses: Expense[]
  salaries: Salary[]
  advances: AdvancePay[]
  repayments: RepaymentPay[]
  amcPayments: AmcPay[]
  transfers: Transfer[]
  withdrawals: Withdrawal[]
  bonuses: Bonus[]
  assetDisposals: AssetDisposal[]
}

export type BankBookEntry = {
  id: string
  date: string
  narration: string
  mode: string
  receipts: number
  payments: number
  ref: string
}

export function buildBankBook(
  sources: BankBookSources,
  options: {
    openingBank: number
    openingDate: string | null
    from: string
    to: string
    allTime: boolean
  },
) {
  const {
    receipts, supplierPayments, supplierAdvances, expenses, salaries, advances,
    repayments, amcPayments, transfers, withdrawals, bonuses, assetDisposals,
  } = sources
  const { openingBank, openingDate, from, to, allTime } = options
  const bankTransfersIn = transfers.filter((transfer) => transfer.to_account === 'bank')
  const bankTransfersOut = transfers.filter((transfer) => transfer.from_account === 'bank')

  const totalBankIn = receipts.reduce((sum, row) => sum + row.amount_received, 0)
    + amcPayments.reduce((sum, row) => sum + row.amount, 0)
    + bankTransfersIn.reduce((sum, row) => sum + row.amount, 0)
    + repayments.reduce((sum, row) => sum + row.amount, 0)
    + assetDisposals.reduce((sum, row) => sum + Number(row.disposal_proceeds), 0)
  const totalBankOut = supplierPayments.reduce((sum, row) => sum + row.amount_paid, 0)
    + supplierAdvances.reduce((sum, row) => sum + row.amount, 0)
    + expenses.reduce((sum, row) => sum + row.amount, 0)
    + salaries.reduce((sum, row) => sum + row.net_salary, 0)
    + advances.reduce((sum, row) => sum + row.amount, 0)
    + bankTransfersOut.reduce((sum, row) => sum + row.amount, 0)
    + withdrawals.reduce((sum, row) => sum + row.amount, 0)
    + bonuses.reduce((sum, row) => sum + row.amount, 0)
  const closingBalance = openingBank + totalBankIn - totalBankOut

  const prePeriodIn = allTime ? 0 : (
    receipts.filter((row) => row.payment_date < from).reduce((sum, row) => sum + row.amount_received, 0)
    + amcPayments.filter((row) => row.payment_date < from).reduce((sum, row) => sum + row.amount, 0)
    + bankTransfersIn.filter((row) => row.transfer_date < from).reduce((sum, row) => sum + row.amount, 0)
    + repayments.filter((row) => row.repayment_date < from).reduce((sum, row) => sum + row.amount, 0)
    + assetDisposals.filter((row) => row.disposal_date < from).reduce((sum, row) => sum + Number(row.disposal_proceeds), 0)
  )
  const prePeriodOut = allTime ? 0 : (
    supplierPayments.filter((row) => row.payment_date < from).reduce((sum, row) => sum + row.amount_paid, 0)
    + supplierAdvances.filter((row) => row.advance_date < from).reduce((sum, row) => sum + row.amount, 0)
    + expenses.filter((row) => row.expense_date < from).reduce((sum, row) => sum + row.amount, 0)
    + salaries.filter((row) => row.payment_date < from).reduce((sum, row) => sum + row.net_salary, 0)
    + advances.filter((row) => row.issued_date < from).reduce((sum, row) => sum + row.amount, 0)
    + bankTransfersOut.filter((row) => row.transfer_date < from).reduce((sum, row) => sum + row.amount, 0)
    + withdrawals.filter((row) => row.withdrawal_date < from).reduce((sum, row) => sum + row.amount, 0)
    + bonuses.filter((row) => row.bonus_date < from).reduce((sum, row) => sum + row.amount, 0)
  )
  const periodOpeningBalance = openingBank + prePeriodIn - prePeriodOut
  const periodOpeningDate = allTime ? openingDate : (() => {
    const date = new Date(`${from}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() - 1)
    return date.toISOString().slice(0, 10)
  })()
  const inPeriod = (date: string) => allTime || (date >= from && date <= to)

  const entries: BankBookEntry[] = [
    ...receipts.filter((row) => inPeriod(row.payment_date)).map((row) => ({
      id: `receipt-${row.id}`, date: row.payment_date,
      narration: `Receipt — ${row.customers?.full_name ?? 'Customer'} (${row.payment_number})`,
      mode: MODE_LABELS[row.payment_mode] ?? row.payment_mode,
      receipts: row.amount_received, payments: 0, ref: row.reference_number ?? '—',
    })),
    ...supplierPayments.filter((row) => inPeriod(row.payment_date)).map((row) => ({
      id: `supplier-payment-${row.id}`, date: row.payment_date,
      narration: `Payment — ${row.suppliers?.supplier_name ?? 'Supplier'}`,
      mode: MODE_LABELS[row.payment_mode] ?? row.payment_mode,
      receipts: 0, payments: row.amount_paid, ref: row.reference_number ?? '—',
    })),
    ...supplierAdvances.filter((row) => inPeriod(row.advance_date)).map((row) => ({
      id: `supplier-advance-${row.id}`, date: row.advance_date,
      narration: `Supplier Advance — ${row.suppliers?.supplier_name ?? 'Supplier'}`,
      mode: MODE_LABELS[row.payment_mode] ?? row.payment_mode,
      receipts: 0, payments: row.amount, ref: row.reference_number ?? '—',
    })),
    ...salaries.filter((row) => inPeriod(row.payment_date)).map((row) => {
      const run = row.salary_runs
      const period = run ? `${MONTHS[run.salary_month - 1]} ${run.salary_year}` : ''
      return {
        id: `salary-${row.id}`, date: row.payment_date,
        narration: `Salary — ${row.staff?.full_name ?? 'Staff'}${period ? ` (${period})` : ''}`,
        mode: MODE_LABELS[row.payment_mode] ?? row.payment_mode,
        receipts: 0, payments: row.net_salary, ref: '—',
      }
    }),
    ...expenses.filter((row) => inPeriod(row.expense_date)).map((row) => ({
      id: `expense-${row.id}`, date: row.expense_date,
      narration: `Expense — ${CATEGORY_LABELS[row.category] ?? row.category}: ${row.description}`,
      mode: row.payment_method === 'cheque' ? 'Cheque' : 'Bank Transfer',
      receipts: 0, payments: row.amount, ref: row.reference_number ?? row.expense_number,
    })),
    ...advances.filter((row) => inPeriod(row.issued_date)).map((row) => ({
      id: `staff-advance-${row.id}`, date: row.issued_date,
      narration: `${row.settlement_recovery_amount !== null ? 'Leave Settlement' : row.type === 'loan' ? 'Loan' : 'Salary Advance'} — ${row.staff?.full_name ?? 'Staff'}${row.notes ? ` (${row.notes})` : ''}`,
      mode: MODE_LABELS[row.payment_method] ?? (row.payment_method === 'bank' ? 'Bank Transfer' : row.payment_method),
      receipts: 0, payments: row.amount, ref: '—',
    })),
    ...repayments.filter((row) => inPeriod(row.repayment_date)).map((row) => ({
      id: `staff-repayment-${row.id}`, date: row.repayment_date,
      narration: `Loan/Advance Repayment — ${row.staff?.full_name ?? 'Staff'}${row.notes ? ` (${row.notes})` : ''}`,
      mode: 'Bank Transfer', receipts: row.amount, payments: 0, ref: '—',
    })),
    ...amcPayments.filter((row) => inPeriod(row.payment_date)).map((row) => ({
      id: `amc-payment-${row.id}`, date: row.payment_date,
      narration: `AMC Payment — ${row.amc_contracts?.contract_number ?? ''}${row.amc_contracts?.customers?.full_name ? ` (${row.amc_contracts.customers.full_name})` : ''}`,
      mode: MODE_LABELS[row.payment_mode] ?? row.payment_mode,
      receipts: row.amount, payments: 0, ref: row.reference_number ?? '—',
    })),
    ...assetDisposals.filter((row) => inPeriod(row.disposal_date)).map((row) => ({
      id: `asset-disposal-${row.id}`, date: row.disposal_date,
      narration: `Asset Disposal — ${row.asset_code}: ${row.asset_name}`,
      mode: MODE_LABELS[row.disposal_payment_method] ?? row.disposal_payment_method,
      receipts: Number(row.disposal_proceeds), payments: 0,
      ref: row.disposal_reference ?? row.asset_code,
    })),
    ...bankTransfersIn.filter((row) => inPeriod(row.transfer_date)).map((row) => ({
      id: `transfer-in-${row.id}`, date: row.transfer_date,
      narration: `Transfer — Cash → Bank${row.notes ? ` (${row.notes})` : ''}`,
      mode: 'Transfer', receipts: row.amount, payments: 0, ref: row.reference_number ?? '—',
    })),
    ...bankTransfersOut.filter((row) => inPeriod(row.transfer_date)).map((row) => ({
      id: `transfer-out-${row.id}`, date: row.transfer_date,
      narration: `Transfer — Bank → Cash${row.notes ? ` (${row.notes})` : ''}`,
      mode: 'Transfer', receipts: 0, payments: row.amount, ref: row.reference_number ?? '—',
    })),
    ...withdrawals.filter((row) => inPeriod(row.withdrawal_date)).map((row) => ({
      id: `withdrawal-${row.id}`, date: row.withdrawal_date,
      narration: `Owner Withdrawal${row.purpose ? ` — ${row.purpose}` : ''}`,
      mode: MODE_LABELS[row.payment_mode] ?? row.payment_mode,
      receipts: 0, payments: row.amount, ref: '—',
    })),
    ...bonuses.filter((row) => inPeriod(row.bonus_date)).map((row) => ({
      id: `bonus-${row.id}`, date: row.bonus_date,
      narration: `Bonus — ${row.staff?.full_name ?? 'Staff'}${row.notes ? ` (${row.notes})` : ''}`,
      mode: MODE_LABELS[row.payment_mode] ?? row.payment_mode,
      receipts: 0, payments: row.amount, ref: '—',
    })),
  ].sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))

  return {
    entries,
    totalBankIn,
    totalBankOut,
    closingBalance,
    periodOpeningBalance,
    periodOpeningDate,
    periodReceipts: entries.reduce((sum, entry) => sum + entry.receipts, 0),
    periodPayments: entries.reduce((sum, entry) => sum + entry.payments, 0),
  }
}
