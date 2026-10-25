import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { post } from '../../shared/api/client'
import { Button, Card, ErrorBox, Field, PageHeader, Textarea } from '../../shared/ui'

export function PortalRequest() {
  const [text, setText] = useState('')
  const send = useMutation({ mutationFn: () => post('/portal/requests/', { text }), onSuccess: () => setText('') })
  return (
    <>
      <PageHeader title="So‘rov yuborish" subtitle="Yangi aksiya, tezkor post yoki savol — SMM menejeringizga vazifa bo‘lib boradi." />
      <Card className="max-w-xl">
        {send.isSuccess && <div className="mb-3 rounded-lg bg-ok-soft px-3 py-2 text-ok">So‘rovingiz yuborildi. SMM menejer tez orada javob beradi.</div>}
        <form onSubmit={(e) => { e.preventDefault(); send.mutate() }} className="space-y-3">
          <Field label="Nima kerak?"><Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Masalan: 1-dekabrdan 20% chegirma aksiyasi bo‘yicha post va stories kerak" required /></Field>
          <ErrorBox error={send.error} />
          <Button type="submit" disabled={send.isPending}>Yuborish</Button>
        </form>
      </Card>
    </>
  )
}
