'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Loader2 } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function DeliveryProof({
  orderId,
  currentUrl,
  canEdit,
}: {
  orderId: string
  currentUrl: string | null
  canEdit: boolean
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(currentUrl)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setErr(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/orders/${orderId}/delivery-proof`, {
        method: 'POST',
        body: fd,
      })
      const json = await res.json()
      if (!res.ok) {
        setErr(json?.error || 'error')
        return
      }
      setUrl(json.url)
      router.refresh()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'error_red')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  if (!url && !canEdit) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Comprobante de entrega
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {err && (
          <Alert variant="destructive">
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        )}

        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-md border border-border"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="Comprobante de entrega"
              className="block h-auto w-full"
            />
          </a>
        ) : (
          <div className="text-sm text-muted-foreground">
            Todavía no se subió la foto del comprobante.
          </div>
        )}

        {canEdit && (
          <div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onPick}
              className="hidden"
            />
            <Button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              variant={url ? 'outline' : 'default'}
            >
              {uploading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Subiendo…
                </>
              ) : (
                <>
                  <Camera className="size-4" />
                  {url ? 'Reemplazar foto' : 'Subir foto de entrega'}
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
