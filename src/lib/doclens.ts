export type DocLensResult = {
  schemaVersion: string
  document: {
    type: string
    number: string
    issuingCountry: string
    issueDate: string
    expiryDate: string
  }
  holder: {
    fullName: string
    surname: string
    givenNames: string
    nationality: string
    dateOfBirth: string
    sex: string
  }
  extraction: {
    confidence: number | null
    rawText: string
  }
}

export type RegistrationAutofill = {
  documentType: string
  fullName: string
  nationality: string
  dateOfBirth: string
  documentNumber: string
  expiryDate: string
  clientType: 'Resident' | 'Tourist' | null
  target: 'emirates_id' | 'passport' | 'license' | 'unknown'
  confidence: number | null
}

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the document'))
    reader.onload = () => {
      const value = String(reader.result || '')
      resolve(value.slice(value.indexOf(',') + 1))
    }
    reader.readAsDataURL(file)
  })
}

function getTarget(type: string): RegistrationAutofill['target'] {
  const value = type.toLowerCase()
  if (value.includes('emirates') || value.includes('identity') || value.includes('id card')) return 'emirates_id'
  if (value.includes('passport')) return 'passport'
  if (value.includes('driving') || value.includes('driver') || value.includes('licence') || value.includes('license')) return 'license'
  return 'unknown'
}

function formatEmiratesId(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 15 || !digits.startsWith('784')) return value
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 14)}-${digits.slice(14)}`
}

export async function recognizeClientDocument(file: Blob): Promise<RegistrationAutofill> {
  const mimeType = file.type || 'image/jpeg'
  if (!/^image\/(jpeg|png|webp)$/i.test(mimeType)) {
    throw new Error('AI autofill currently supports JPG, PNG and WebP images')
  }

  const response = await fetch('/api/doclens-recognize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: await fileToBase64(file),
      mimeType,
      requestId: crypto.randomUUID(),
    }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error || 'Document recognition failed')

  const result = payload?.result as DocLensResult | undefined
  if (!result) throw new Error('DocLens returned an empty result')

  const target = getTarget(result.document.type)
  const rawNumber = result.document.number || ''
  return {
    documentType: result.document.type || '',
    fullName: result.holder.fullName || [result.holder.givenNames, result.holder.surname].filter(Boolean).join(' '),
    nationality: result.holder.nationality || result.document.issuingCountry || '',
    dateOfBirth: result.holder.dateOfBirth || '',
    documentNumber: target === 'emirates_id' ? formatEmiratesId(rawNumber) : rawNumber,
    expiryDate: result.document.expiryDate || '',
    clientType: target === 'emirates_id' ? 'Resident' : target === 'passport' ? 'Tourist' : null,
    target,
    confidence: result.extraction.confidence,
  }
}
