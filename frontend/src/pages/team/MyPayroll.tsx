import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { get } from '../../shared/api/client'
import type { MyPayroll } from '../../shared/api/types'
import { date, money, monthKey, pct } from '../../shared/lib/format'
import { Card, Empty, Kicker, PageHeader, Spinner, Stat, Table } from '../../shared/ui'
import { useAuth } from '../../shared/auth/AuthProvider'
import { MyExpenses } from './Finance'
import { MonthPicker } from './Payroll'

export function MyPayrollPage() {
  const { can } = useAuth()
  const [month, setMonth] = useState(monthKey())
  const data = useQuery({ queryKey: ['payroll-me', month], queryFn: () => get<MyPayroll>('/payroll/me/', { month }) })
  const d = data.data
  return (
    <>
      <PageHeader title="Mening hisobim" subtitle="Faqat sizga ko‘rinadi: qaysi loyihadan qancha ulush tushdi." actions={<MonthPicker month={month} onChange={setMonth} />} />
      {data.isLoading && <Spinner />}
      {d && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label="Shu oy hisoblandi" value={money(Math.round(Number(d.total_uzs)))} hint={`${d.accruals.length} ta to‘lovdan`} />
          </div>
          {d.accruals.length === 0 ? <Empty title="Bu oy hali ulush yo‘q" hint="Mijoz to‘lov qilganda bu yerda ko‘rinadi." /> : (
            <Table head={['Sana', 'Mijoz', 'Lavozim', 'To‘lov', 'Foiz', 'Ulush', 'So‘mda', 'Holat']}>
              {d.accruals.map((a, i) => (
                <tr key={i}>
                  <td className="num">{date(a.accrued_on)}</td><td className="font-semibold">{a.client_name}</td><td>{a.position_name}</td>
                  <td className="num">{money(a.base_amount, a.currency)}</td><td className="num">{pct(a.percent)}</td>
                  <td className="num">{money(a.amount, a.currency)}</td><td className="num">{money(a.amount_uzs)}</td><td>{a.status_label}</td>
                </tr>
              ))}
            </Table>
          )}
          {d.adjustments.length > 0 && (
            <Card className="mt-4">
              <Kicker>Tuzatishlar</Kicker>
              {d.adjustments.map((a, i) => <div key={i} className="flex justify-between py-1"><span>{a.kind_label}: {a.reason}</span><span className="num">{money(a.amount_uzs)}</span></div>)}
            </Card>
          )}
        </>
      )}
      {can('expenses.request') && <MyExpenses />}
    </>
  )
}
