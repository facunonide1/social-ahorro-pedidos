'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker } from 'react-day-picker'

import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'relative flex flex-col gap-4 sm:flex-row',
        month: 'w-full space-y-4',
        month_caption: 'flex h-7 items-center justify-center',
        caption_label: 'text-sm font-medium',
        nav: 'absolute inset-x-0 top-0 flex items-center justify-between',
        button_previous: cn(
          buttonVariants({ variant: 'outline' }),
          'size-7 bg-transparent p-0 opacity-50 hover:opacity-100',
        ),
        button_next: cn(
          buttonVariants({ variant: 'outline' }),
          'size-7 bg-transparent p-0 opacity-50 hover:opacity-100',
        ),
        month_grid: 'mt-4 w-full border-collapse space-y-1',
        weekdays: 'flex',
        weekday: 'w-8 rounded-md text-[0.8rem] font-normal text-muted-foreground',
        week: 'mt-2 flex w-full',
        day: 'relative flex size-8 flex-1 items-center justify-center p-0 text-sm focus-within:relative focus-within:z-20',
        day_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'size-8 rounded-md p-0 font-normal aria-selected:opacity-100',
        ),
        range_start:  'day-range-start rounded-s-md',
        range_end:    'day-range-end rounded-e-md',
        range_middle: 'rounded-none aria-selected:bg-accent aria-selected:text-accent-foreground',
        selected:     'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground rounded-md',
        today:        'bg-accent text-accent-foreground rounded-md',
        outside:      'day-outside text-muted-foreground aria-selected:text-muted-foreground',
        disabled:     'text-muted-foreground opacity-50',
        hidden:       'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: cClass, ...iconProps }) => {
          const Icon = orientation === 'left' ? ChevronLeft : ChevronRight
          return <Icon className={cn('size-4', cClass)} {...iconProps} />
        },
      }}
      {...props}
    />
  )
}

export { Calendar }
