import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export default function Input({ className = '', ...props }: InputProps) {
  return (
    <input
      className={`px-3 py-2 border border-gray-700/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500/50 ${className}`}
      {...props}
    />
  );
}
