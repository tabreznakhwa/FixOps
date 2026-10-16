import { Header } from '@/components/layout/Header'
import { BackButton } from '@/components/ui/BackButton'
import { NewSupplierForm } from './NewSupplierForm'
import { resolveBack } from '@/lib/backNav'

export const metadata = { title: 'New Supplier' }

export default async function NewSupplierPage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string }>
}) {
  const { return_to } = await searchParams
  const back = resolveBack(return_to, '/suppliers', 'Suppliers')

  return (
    <div className="animate-fade-in">
      <Header
        title="New Supplier"
        subtitle="Add a new supplier to your directory"
        actions={
          <BackButton href={back.href} label={back.label} />
        }
      />
      <div className="p-6">
        <NewSupplierForm returnTo={back.href} />
      </div>
    </div>
  )
}
