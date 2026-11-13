import { useQuery } from '@tanstack/react-query'
import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { get } from '../../shared/api/client'
import type { Tariff } from '../../shared/api/types'
import { useAuth } from '../../shared/auth/AuthProvider'
import { money } from '../../shared/lib/format'
import { Badge, Button, cn, Modal, Spinner } from '../../shared/ui'

// Potensial mijoz bilan gaplashish skripti: qo'ng'iroq, savollar, tarif taklifi, e'tirozlar, qayta aloqa.
// Halol ishontirish usullari (SPIN, Cialdini, Voss) asosida; yolg'on va bosim yo'q.

type Tab = 'prep' | 'call' | 'offer' | 'objections' | 'close' | 'follow'
const TABS: [Tab, string][] = [
  ['prep', 'Tayyorgarlik'], ['call', 'Qo‘ng‘iroq'], ['offer', 'Taklif'], ['objections', 'E’tirozlar'], ['close', 'Yopish'], ['follow', 'Qayta aloqa'],
]
const RECOMMENDED = 'standard'

function Say({ children, copy }: { children: ReactNode; copy?: string }) {
  const [done, setDone] = useState(false)
  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(copy ?? '')
      setDone(true)
      window.setTimeout(() => setDone(false), 1500)
    } catch { /* nusxa olish taqiqlangan bo'lsa, matnni qo'lda belgilash mumkin */ }
  }
  return (
    <div className="relative rounded-xl border-l-[3px] border-gold-deep bg-gold-soft/60 px-3 py-2.5 text-[14px] leading-relaxed text-ink">
      <div className={copy ? 'pr-10' : ''}>{children}</div>
      {copy && (
        <button type="button" onClick={doCopy} aria-label="Nusxa olish" title="Nusxa olish"
          className="absolute top-1.5 right-1.5 grid h-8 w-8 place-items-center rounded-lg text-gold-ink hover:bg-white">
          {done ? <Check size={15} /> : <Copy size={15} />}
        </button>
      )}
    </div>
  )
}

function Step({ n, title, children }: { n?: number; title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-[14px] font-bold">
        {n !== undefined && <span className="num grid h-6 w-6 place-items-center rounded-full bg-ink text-[11px] text-ivory">{n}</span>}
        {title}
      </h3>
      <div className="space-y-2 text-[13.5px] leading-relaxed text-text-2">{children}</div>
    </section>
  )
}

function Tip({ children }: { children: ReactNode }) {
  return <p className="text-[12.5px] text-muted">💡 {children}</p>
}

function Bullets({ items }: { items: ReactNode[] }) {
  return <ul className="list-disc space-y-1 pl-5">{items.map((item, i) => <li key={i}>{item}</li>)}</ul>
}

function limitOf(tariff: Tariff, kind: string) {
  return tariff.current_version?.limits.find((l) => l.content_kind === kind)?.quantity ?? 0
}

function OfferTable() {
  const tariffs = useQuery({ queryKey: ['tariffs'], queryFn: () => get<Tariff[]>('/catalog/tariffs/'), retry: false })
  if (tariffs.isLoading) return <Spinner />
  const rows = (tariffs.data ?? []).filter((t) => t.is_active && t.current_version)
    // Valyuta bo'yicha guruhlab, ichida qimmatdan arzonga (Premium birinchi ko'rinsin).
    .sort((a, b) => a.current_version!.currency.localeCompare(b.current_version!.currency)
      || Number(b.current_version!.price) - Number(a.current_version!.price))
  if (!rows.length) return <p className="text-[13px] text-muted">Tariflar ro‘yxatini ochib bo‘lmadi. «Tariflar» bo‘limiga qarang.</p>
  const basic = rows.find((t) => t.code === 'basic')
  const standard = rows.find((t) => t.code === RECOMMENDED)
  const units = (t: Tariff) => limitOf(t, 'reels') + limitOf(t, 'post')
  const hasStudio = (t?: Tariff) => !!t && /studiya/i.test(t.description)
  // «Basic → Standard» farqi: faqat ikkalasi bir valyutada bo'lsa va Standard'da haqiqatan ko'proq narsa bo'lsa.
  let upgrade = ''
  const b = basic?.current_version
  const st = standard?.current_version
  if (basic && standard && b && st && b.currency === st.currency) {
    const diff = (Math.round(Number(st.price) * 100) - Math.round(Number(b.price) * 100)) / 100
    const extras = [
      limitOf(standard, 'reels') > limitOf(basic, 'reels') && `${limitOf(standard, 'reels') - limitOf(basic, 'reels')} ta Reels`,
      limitOf(standard, 'post') > limitOf(basic, 'post') && `${limitOf(standard, 'post') - limitOf(basic, 'post')} ta post`,
      limitOf(standard, 'stories') > limitOf(basic, 'stories') && `${limitOf(standard, 'stories') - limitOf(basic, 'stories')} ta stories`,
      hasStudio(standard) && !hasStudio(basic) && 'studiya bonusi',
    ].filter(Boolean) as string[]
    if (diff > 0 && extras.length) {
      const list = extras.length > 1 ? `${extras.slice(0, -1).join(', ')} va ${extras[extras.length - 1]}` : extras[0]
      upgrade = `Basic ${money(b.price, b.currency)}, Standard ${money(st.price, st.currency)}. Farqi ${money(diff.toFixed(2), st.currency)}: bunga yana ${list} qo‘shiladi.`
    }
  }
  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-line-soft">
        <table className="w-full min-w-[460px] text-[13px]">
          <thead className="bg-ivory text-left text-[11.5px] text-muted">
            <tr><th className="px-3 py-2">Tarif</th><th className="px-2">Narx</th><th className="px-2">Reels</th><th className="px-2">Post</th><th className="px-2">Stories</th><th className="px-2 whitespace-nowrap">Jami Reels+Post</th></tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const v = t.current_version!
              return (
                <tr key={t.id} className={t.code === RECOMMENDED ? 'bg-gold-soft/50 font-semibold' : 'border-t border-line-soft'}>
                  <td className="px-3 py-2">
                    {t.name} {t.code === RECOMMENDED && <Badge tone="warn">Tavsiya</Badge>}
                    {t.description && <div className="max-w-[200px] text-[11.5px] font-normal text-muted">{t.description}</div>}
                  </td>
                  <td className="num px-2 whitespace-nowrap">{money(v.price, v.currency)}</td>
                  <td className="num px-2">{limitOf(t, 'reels')}</td>
                  <td className="num px-2">{limitOf(t, 'post')}</td>
                  <td className="num px-2">{limitOf(t, 'stories')}</td>
                  <td className="num px-2">{units(t)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-muted">Hamma tarifda mijoz kabineti (CRM) bor. Jadval «Tariflar» bo‘limidan olinadi, narx o‘zgarsa bu yerda ham o‘zgaradi.</p>
      {upgrade && <Say copy={upgrade}>«{upgrade}»</Say>}
    </>
  )
}

export function SalesScriptModal({ contactName, business, source, onClose }: { contactName?: string; business?: string; source?: string; onClose: () => void }) {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('call')
  const top = useRef<HTMLDivElement>(null)
  const ism = contactName?.trim().split(' ')[0] || '[Ism]'
  const men = user?.full_name.split(' ')[0] || '[Ismingiz]'
  const from = source?.trim() ? `«${source.trim()}» orqali so‘rov qoldirgan edingiz.` : 'So‘rovingiz bo‘yicha qo‘ng‘iroq qilyapman.'
  const afterCall = `${ism}, suhbat uchun rahmat! Kelishganimizdek, [kun, soat]da ko‘rishamiz. Manzil yoki Zoom havolasi: [manzil / havola]. Ungacha ishlarimizdan namunalar: [portfolio havolasi]. Hurmat bilan, ${men}, OBRO Agency.`
  // Bo'lim almashganda boshiga qaytadi (qo'ng'iroq paytida kerakli joyni tez topish uchun).
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    top.current?.scrollIntoView({ block: 'start' })
  }, [tab])
  return (
    <Modal title={business ? `Sotuv skripti · ${business}` : 'Sotuv skripti'} onClose={onClose} wide>
      <div className="space-y-4">
        <div ref={top} aria-hidden="true" className="h-0 scroll-mt-24" />
        <div className="sticky top-0 z-10 -mx-6 !mt-0 bg-white px-6 py-2">
          <div role="tablist" aria-label="Skript bo‘limlari" className="grid grid-cols-3 gap-1 rounded-xl border border-line-soft bg-ivory p-1 sm:grid-cols-6">
            {TABS.map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                className={cn('min-h-10 rounded-lg px-1 text-[12.5px] font-semibold', tab === key ? 'bg-ink text-ivory' : 'text-text-2 hover:bg-white')}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'prep' && (
          <div className="space-y-4">
            <Step n={1} title="Tez bog‘laning">
              <p>Lid kelgan kunning o‘zida, iloji bo‘lsa 1 soat ichida qo‘ng‘iroq qiling. Kechiksangiz, u boshqa agentlikka yozib qo‘ygan bo‘ladi.</p>
            </Step>
            <Step n={2} title="Instagram sahifasini 2 daqiqa o‘rganing">
              <Bullets items={['Nima sotadi, kimga sotadi', 'Oxirgi post va Reels qachon chiqqan', 'Eng ko‘zga tashlanadigan 1 ta kamchilik: Reels yo‘q, bio tushunarsiz, narx yoki manzil yozilmagan']} />
            </Step>
            <Step n={3} title="Maqsadni biling">
              <p>Birinchi qo‘ng‘iroqda sotmaysiz. Maqsad: <b>bepul auditga yoki uchrashuvga</b> yozdirish.</p>
            </Step>
            <Step n={4} title="Har suhbatdan keyin yozib qo‘ying">
              <p>Mijoz kartasidagi izohga: nima dedi, qaysi tarif qiziqtirdi, keyingi aloqa sanasi. Oy oxirida qaysi gap ishlaganini ko‘rasiz.</p>
            </Step>
          </div>
        )}

        {tab === 'call' && (
          <div className="space-y-4">
            <Step n={1} title="Ochilish (birinchi 15 soniya)">
              <Say>«Assalomu alaykum, {ism}! Men {men}, OBRO Agency’dan. {from} 3–4 daqiqa gaplashsak bo‘ladimi?»</Say>
              <p>Agar «bandman» desa:</p>
              <Say>«Tushunarli. Bugun kechqurun yoki ertaga ertalab, qaysi biri qulay?»</Say>
              <Tip>Ikkita aniq variant bering. «Qachon qulay?» deb ochiq so‘ramang.</Tip>
            </Step>
            <Step n={2} title="Siz ularni o‘rgangansiz">
              <Say>«Sahifangizni ko‘rib chiqdim. [Mahsulot]ingiz zo‘r ekan, ayniqsa [aniq bir narsa]. Lekin bir narsa e’tiborimni tortdi: [kamchilik, masalan: oxirgi Reels 3 hafta oldin chiqqan].»</Say>
            </Step>
            <Step n={3} title="Savollar (SPIN): ko‘proq u gapirsin">
              <Say>Vaziyat: «Hozir Instagram’ni kim yuritadi? Mijozlaringiz asosan qayerdan keladi?»</Say>
              <Say>Muammo: «Instagram’dan oyiga taxminan nechta mijoz kelyapti? Bundan qoniqasizmi?»</Say>
              <Say>Oqibat: «Shu holat yana 6 oy davom etsa, biznesingizga qanday ta’sir qiladi? Raqobatchilaringizda qanday?»</Say>
              <Say>Ehtiyoj: «Agar Instagram’dan oyiga 2 barobar ko‘p murojaat kelsa, bu siz uchun nimani o‘zgartiradi?»</Say>
              <Tip>Eng kuchlisi «Oqibat» savoli: odam muammoni o‘z og‘zi bilan aytadi va o‘zi aytganiga ishonadi.</Tip>
            </Step>
            <Step n={4} title="Kichik sovg‘a: bitta bepul maslahat">
              <Say>«Bepul bitta maslahat beray: [masalan: bio’ga narx va manzilni yozing; Reels’da birinchi 2 soniyada natijani ko‘rsating].»</Say>
            </Step>
            <Step n={5} title="Keyingi qadam: bepul audit">
              <Say>«Sahifangiz bo‘yicha 20 daqiqalik bepul audit qilib beraman: nima ishlayapti, nima ishlamayapti, nima qilish kerak. Ofisimizda ko‘rishamizmi yoki Zoom’da? [kun, soat] yoki [kun, soat], qaysi biri qulay?»</Say>
            </Step>
            <Step n={6} title="Qo‘ng‘iroqdan keyin Telegram’ga xabar">
              <Say copy={afterCall}>{afterCall}</Say>
            </Step>
          </div>
        )}

        {tab === 'offer' && (
          <div className="space-y-4">
            <Step title="Avval muammo, keyin narx">
              <p>Auditni ko‘rsating: «mana bu 3 ta narsa sizdan mijoz olib ketyapti». Narxni eng oxirida ayting.</p>
            </Step>
            <Step title="Tariflarni yuqoridan pastga ko‘rsating">
              <p>Premium’ni birinchi ko‘rgan odamga Standard «o‘rtacha» bo‘lib ko‘rinadi. Standard’ni tavsiya qiling va nega aynan u mos kelishini mijozning o‘z javoblari bilan tushuntiring.</p>
              <OfferTable />
            </Step>
            <Step title="Narxni foyda bilan solishtiring">
              <Say>«Bitta yangi mijoz sizga taxminan [o‘rtacha chek] olib keladi. Tarif oyiga [tarif narxi]. Demak, oyiga [N] ta qo‘shimcha mijoz kelsa, tarif o‘zini oqlaydi.»</Say>
              <Tip>Bitta kontent narxini hisoblab ko‘rsatmang: qimmat tarifda u qimmatroq chiqadi. Dalil — qo‘shimcha mijozlar.</Tip>
            </Step>
            <Step title="Eng kuchli farqimiz: mijoz kabineti (CRM)">
              <Say>«Boshqa agentliklarda nima bo‘layotganini bilmaysiz. Bizda telefoningizda kabinet bor: kontent kalendari, har bir videoni o‘zingiz tasdiqlaysiz, lidlar va natijalar ko‘rinib turadi.»</Say>
              <Tip>Kabinetni telefoningizda jonli ko‘rsating: bu juda ta’sir qiladi.</Tip>
            </Step>
            <Step title="Halol bo‘ling">
              <Bullets items={['Mijoz nomini aytishdan oldin undan ruxsat oling', 'Natija raqamlarini to‘qimang, bo‘lmasa portfolio va jarayonni ko‘rsating', 'Studiya kabi bonusning narxini aytsangiz, aniq raqamni biling']} />
            </Step>
          </div>
        )}

        {tab === 'objections' && (
          <div className="space-y-4">
            <Step title="«Qimmat»">
              <Say>«Tushunaman. Qimmat nimaga nisbatan: boshqa taklifgami yoki byudjetgami?»</Say>
              <Say>«Hozir Instagram’dan oyiga nechta mijoz kelyapti? Bitta mijoz sizga qancha foyda keltiradi? Oyiga bir necha qo‘shimcha mijoz kelsa, tarif o‘zini oqlaydi.»</Say>
              <Tip>Byudjet haqiqatan kam bo‘lsa: «Unda Lite’dan boshlaymiz, natijani ko‘rgach oshiramiz.» Eshik ochiq qoladi.</Tip>
            </Step>
            <Step title="«O‘ylab ko‘raman»">
              <Say>«Albatta. Aniq nima haqida o‘ylamoqchisiz: narx, natija yoki boshqa narsa?»</Say>
              <Tip>Haqiqiy sabab chiqadi. Javob bering va aniq sana belgilang: «Juma kuni qo‘ng‘iroq qilsam bo‘ladimi?»</Tip>
            </Step>
            <Step title="«O‘zimizning SMMchimiz bor»">
              <Say>«Zo‘r! U qancha natija beryapti? Biz uning o‘rniga emas, unga yordam bera olamiz: videolar, target, strategiya.»</Say>
            </Step>
            <Step title="«Natijaga kafolat berasizmi?»">
              <Say>«Sotuv soniga kafolat bera olmayman, buni kim bersa, aldaydi. Lekin kelishilgan kontent soni va sifati kafolatlanadi, hammasini kabinetingizda har kuni ko‘rib turasiz. Birinchi oy natijasini birga tahlil qilamiz.»</Say>
            </Step>
            <Step title="«Telegram’ga tashlab qo‘ying»">
              <Say>«Tashlayman. Lekin sizga mos tarifni aniq aytishim uchun 2 ta savol berib olay…»</Say>
              <Tip>Suhbatni davom ettiring, savollar bo‘limiga qayting.</Tip>
            </Step>
          </div>
        )}

        {tab === 'close' && (
          <div className="space-y-4">
            <Step title="«Olasizmi?» emas, «qachon?»">
              <Say>«Unda Standard’dan boshlaymiz. Shartnomani dushanbaga tayyorlaymi yoki ertaga?»</Say>
            </Step>
            <Step title="Kichik «ha»lar">
              <p>Suhbat davomida «To‘g‘rimi? Muhimmi?» deb so‘rang. Kichik «ha»lar oxirgi «ha»ni osonlashtiradi.</p>
            </Step>
            <Step title="Cheklovni faqat rost bo‘lsa ayting">
              <Say>«Bu oy faqat 2 ta yangi mijoz olamiz, chunki jamoa band.»</Say>
              <Tip>Soxta shoshiltirish ishonchni buzadi: Farg‘onada hamma bir-birini taniydi.</Tip>
            </Step>
            <Step title="Gapirish uslubi">
              <Bullets items={[
                'Kamroq gapiring: suhbatning 70 foizida u gapirsin',
                'Ko‘zgu usuli: oxirgi 2–3 so‘zini savol ohangida takrorlang («Mijoz kam kelyaptimi?»)',
                'His-tuyg‘uni nomlang: «Avvalgi agentlikdan ko‘nglingiz qolganga o‘xshaydi»',
                'Narxni aytganda uzr so‘ramang, «faqat», «bor-yo‘g‘i» demang. Ayting va jim turing',
              ]} />
            </Step>
          </div>
        )}

        {tab === 'follow' && (
          <div className="space-y-4">
            <Step n={0} title="Shu kuni: qo‘ng‘iroq, javob bo‘lmasa xabar">
              <Say copy={`Assalomu alaykum, ${ism}! Men ${men}, OBRO Agency’dan. So‘rovingiz bo‘yicha bog‘landim. Qachon gaplashsak qulay?`}>
                «Assalomu alaykum, {ism}! Men {men}, OBRO Agency’dan. So‘rovingiz bo‘yicha bog‘landim. Qachon gaplashsak qulay?»
              </Say>
            </Step>
            <Step n={1} title="Ertasi kuni: ikkinchi qo‘ng‘iroq, boshqa soatda" ><p>Ertalab qo‘ng‘iroq qilgan bo‘lsangiz, endi kechqurun qiling.</p></Step>
            <Step n={3} title="3-kun: 30 soniyalik ovozli xabar">
              <p>Sahifasi haqida bitta foydali maslahat bering. Ovozli xabar matndan ko‘ra ishonchliroq eshitiladi.</p>
            </Step>
            <Step n={7} title="7-kun: namuna">
              <Say copy={`${ism}, sizga o‘xshash biznes uchun qilgan ishimizdan namuna: [havola]. Sizga ham shunga o‘xshash reja tuzib bera olamiz.`}>
                «{ism}, sizga o‘xshash biznes uchun qilgan ishimizdan namuna: [havola]. Sizga ham shunga o‘xshash reja tuzib bera olamiz.»
              </Say>
            </Step>
            <Step n={14} title="14-kun: oxirgi xabar">
              <Say copy={`${ism}, hozir bu masala dolzarb emasmi? Keyinroq yozsam bo‘ladimi?`}>«{ism}, hozir bu masala dolzarb emasmi? Keyinroq yozsam bo‘ladimi?»</Say>
              <Tip>Ko‘pchilik 3–5-aloqadan keyin javob beradi, lekin ko‘p sotuvchilar 1-qo‘ng‘iroqdan keyin to‘xtab qoladi.</Tip>
            </Step>
          </div>
        )}

        <div className="flex justify-end border-t border-line-soft pt-3">
          <Button variant="ghost" onClick={onClose}>Yopish</Button>
        </div>
      </div>
    </Modal>
  )
}
