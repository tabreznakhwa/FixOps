import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { BackButton } from '@/components/ui/BackButton'
import { NewInventoryItemForm } from './NewInventoryItemForm'

export const metadata = { title: 'Add Inventory Item' }

export default function NewInventoryItemPage() {
  return (
    <div className="animate-fade-in">
      <Header
        title="Add Inventory Item"
        subtitle="Add a new part or material to inventory"
        actions={
          <BackButton fallbackHref="/inventory" label="Back" />
        }
      />
      <div className="p-6">
        <NewInventoryItemForm />
      </div>
    </div>
  )
}
