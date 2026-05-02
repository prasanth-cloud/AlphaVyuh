'use client'

import { EmptyState } from '@/components/ui'

export default function UploadPage() {
  return (
    <div style={{ padding: 32, maxWidth: 720, margin: '0 auto' }}>
      <h1 className="heading-page">Upload trade report</h1>
      <p className="body-secondary" style={{ marginTop: 8, marginBottom: 32 }}>
        Import your trades from broker contract notes, CSV exports, or screenshots.
        AlphaVyuh parses your history and runs analytics on your actual performance.
      </p>
      <EmptyState
        title="Coming soon"
        description="CSV import for Zerodha, Upstox, and Groww. Contract note PDF parsing. Screenshot OCR. Building now."
      />
    </div>
  )
}
