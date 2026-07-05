import React from 'react'
import Input from './Input'

interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  error?: string
  helperText?: string
  allowDecimals?: boolean
}

const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ allowDecimals = true, ...props }, ref) => {
    // Intercept and prevent non-numeric inputs
    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
      const allowed = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Backspace', 'ArrowLeft', 'ArrowRight', 'Tab', 'Delete']
      if (allowDecimals) {
        allowed.push('.')
      }
      if (!allowed.includes(e.key) && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
      }
    }

    return (
      <Input
        type="text"
        inputMode={allowDecimals ? 'decimal' : 'numeric'}
        onKeyDown={handleKeyPress}
        ref={ref}
        {...props}
      />
    )
  }
)

NumberInput.displayName = 'NumberInput'

export default NumberInput
