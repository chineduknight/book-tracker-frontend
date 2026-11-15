'use client';

import { useState, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';

type PasswordInputProps = Omit<ComponentProps<typeof Input>, 'type' | 'trailing'>;

/** A password field with a show/hide toggle, so long passphrases can be checked on a phone. */
export function PasswordInput(props: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);
  return (
    <Input
      {...props}
      type={isVisible ? 'text' : 'password'}
      spellCheck={false}
      autoCapitalize="none"
      trailing={
        <button
          type="button"
          aria-label={isVisible ? 'Hide password' : 'Show password'}
          onClick={() => setIsVisible((visible) => !visible)}
          className="min-h-9 min-w-14 rounded-md px-2 text-sm font-medium text-accent hover:bg-accent-soft"
        >
          {isVisible ? 'Hide' : 'Show'}
        </button>
      }
    />
  );
}
