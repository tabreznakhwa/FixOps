import { Header } from '@/components/layout/Header'
import { BackButton } from '@/components/ui/BackButton'
import { NewInventoryItemForm } from './NewInventoryItemForm'
import { resolveBack } from '@/lib/backNav'

export const metadata = { title: 'Add Inventory Item' }

export default async function NewInventoryItemPage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string }>
}) {
  const { return_to } = await searchParams
  const back = resolveBack(return_to, '/inventory', 'Inventory')

  return (
    <div className="animate-fade-in">
      <Header
        title="Add Inventory Item"
        subtitle="Add a new part or material to inventory"
        actions={
          <BackButton href={back.href} label={back.label} />
        }
      />
      <div className="p-6">
        <NewInventoryItemForm returnTo={back.href} />
      </div>
    </div>
  )
}
