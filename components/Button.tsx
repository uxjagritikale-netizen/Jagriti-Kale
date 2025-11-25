import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  className = '', 
  ...props 
}) => {
  const baseStyles = "px-6 py-3 rounded-full font-medium transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm";
  
  const variants = {
    primary: "bg-slate-800 text-white hover:bg-slate-700 active:scale-95",
    secondary: "bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 active:scale-95",
    danger: "bg-rose-500 text-white hover:bg-rose-600 active:scale-95",
    outline: "border-2 border-slate-800 text-slate-800 hover:bg-slate-50 active:scale-95"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className}`} 
      {...props}
    >
      {children}
    </button>
  );
};