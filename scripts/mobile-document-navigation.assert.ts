import assert from 'node:assert/strict'
import { shouldNavigateDocumentInCurrentWindow } from '../src/components/ui/DocumentLink'

assert.equal(shouldNavigateDocumentInCurrentWindow(() => ({ matches: true })), true)
assert.equal(shouldNavigateDocumentInCurrentWindow(() => ({ matches: false })), false)
assert.equal(shouldNavigateDocumentInCurrentWindow(undefined), false)

console.log('mobile document navigation assertions passed')
