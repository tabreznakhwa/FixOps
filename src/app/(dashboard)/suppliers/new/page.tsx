import { Header } from '@/components/layout/Header'
import Link from 'next/link'
import { BackButton } from '@/components/ui/BackButton'
import { NewSupplierForm } from './NewSupplierForm'

export const metadata = { title: 'New Supplier' }

export default function NewSupplierPage() {
  return (
    <div className="animate-fade-in">
      <Header
        title="New Supplier"
        subtitle="Add a new supplier to your directory"
        actions={
          <BackButton fallbackHref="/suppliers" label="Back" />
        }
      />
      <div className="p-6">
        <NewSupplierForm />
      </div>
    </div>
  )
}
