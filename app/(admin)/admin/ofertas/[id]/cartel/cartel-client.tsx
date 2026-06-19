'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function CartelPrint({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex justify-center print:hidden">
        <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="size-4" /> Imprimir / PDF</Button>
      </div>
      {children}
    </div>
  )
}
