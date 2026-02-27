'use client';

interface Props {
  message: string;
  className?: string;
  title?: string;
  children: React.ReactNode;
}

export default function ConfirmButton({ message, className, title, children }: Props) {
  return (
    <button
      type="submit"
      className={className}
      title={title}
      onClick={(e) => { if (!confirm(message)) e.preventDefault(); }}
    >
      {children}
    </button>
  );
}
