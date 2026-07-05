import React from 'react'
import Input from './Input'

interface DatePickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  error?: string
  helperText?: string
}

const DatePicker = React.forwardRef<HTMLInputElement, DatePickerProps>(
  (props, ref) => {
    return <Input type="date" ref={ref} {...props} />
  }
)

DatePicker.displayName = 'DatePicker'

export default DatePicker
