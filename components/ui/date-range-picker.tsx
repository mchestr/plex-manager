"use client"

import { StyledDropdown, DropdownOption } from "./select"

interface MonthDayPickerProps {
  month: string // "01" to "12"
  day: string // "01" to "31"
  onMonthChange: (month: string) => void
  onDayChange: (day: string) => void
  disabled?: boolean
  className?: string
  label?: string
}

function MonthDayPicker({
  month,
  day,
  onMonthChange,
  onDayChange,
  disabled,
  className = "",
  label,
}: MonthDayPickerProps) {
  const months: DropdownOption[] = [
    { value: "01", label: "January" },
    { value: "02", label: "February" },
    { value: "03", label: "March" },
    { value: "04", label: "April" },
    { value: "05", label: "May" },
    { value: "06", label: "June" },
    { value: "07", label: "July" },
    { value: "08", label: "August" },
    { value: "09", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" },
  ]

  // Get days in month (handles leap years for February)
  const getDaysInMonth = (monthValue: string): number => {
    if (!monthValue) return 31
    const monthNum = parseInt(monthValue, 10)
    if (monthNum === 2) return 29 // February - allow up to 29 for leap years
    if ([4, 6, 9, 11].includes(monthNum)) return 30
    return 31
  }

  const daysInMonth = getDaysInMonth(month)
  const days: DropdownOption[] = Array.from({ length: daysInMonth }, (_, i) => {
    const dayNum = i + 1
    return {
      value: String(dayNum).padStart(2, "0"),
      label: String(dayNum),
    }
  })

  // Reset day if it's invalid for the selected month
  const handleMonthChange = (newMonth: string) => {
    onMonthChange(newMonth)
    const maxDay = getDaysInMonth(newMonth)
    if (day && parseInt(day, 10) > maxDay) {
      onDayChange(String(maxDay).padStart(2, "0"))
    }
  }

  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-medium text-slate-400 mb-1">
          {label}
        </label>
      )}
      <div className="flex items-center gap-2">
        <StyledDropdown
          value={month}
          onChange={handleMonthChange}
          options={months}
          placeholder="Month"
          disabled={disabled}
          size="md"
          className="flex-1"
        />
        <StyledDropdown
          value={day}
          onChange={onDayChange}
          options={days}
          placeholder="Day"
          disabled={disabled}
          size="md"
          className="flex-1"
        />
      </div>
    </div>
  )
}

interface DateRangePickerProps {
  startMonth: string
  startDay: string
  endMonth: string
  endDay: string
  onStartMonthChange: (month: string) => void
  onStartDayChange: (day: string) => void
  onEndMonthChange: (month: string) => void
  onEndDayChange: (day: string) => void
  disabled?: boolean
  className?: string
}

export function DateRangePicker({
  startMonth,
  startDay,
  endMonth,
  endDay,
  onStartMonthChange,
  onStartDayChange,
  onEndMonthChange,
  onEndDayChange,
  disabled,
  className = "",
}: DateRangePickerProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      <MonthDayPicker
        month={startMonth}
        day={startDay}
        onMonthChange={onStartMonthChange}
        onDayChange={onStartDayChange}
        disabled={disabled}
        label="Start Date"
      />
      <div className="flex items-center justify-center">
        <span className="text-slate-400 text-sm">to</span>
      </div>
      <MonthDayPicker
        month={endMonth}
        day={endDay}
        onMonthChange={onEndMonthChange}
        onDayChange={onEndDayChange}
        disabled={disabled}
        label="End Date"
      />
    </div>
  )
}

