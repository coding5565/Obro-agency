import { useQuery } from '@tanstack/react-query'
import { get } from '../../shared/api/client'
import type { CashAccount } from '../../shared/api/types'
import { Field, Select } from '../../shared/ui'

export function useCashAccounts(enabled = true) {
  return useQuery({ queryKey: ['cash-accounts'], queryFn: () => get<CashAccount[]>('/finance/accounts/'), enabled })
}

export function AccountField({ accounts, currency, value, onChange, label }: { accounts?: CashAccount[]; currency: string; value: string; onChange: (e: { target: { value: string } }) => void; label: string }) {
  const options = accounts?.filter((a) => a.is_active && a.currency === currency) ?? []
  if (options.length === 0) return null
  return (
    <Field label={label}>
      <Select value={value} onChange={onChange}>
        <option value="">Belgilanmagan</option>
        {options.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </Select>
    </Field>
  )
}
