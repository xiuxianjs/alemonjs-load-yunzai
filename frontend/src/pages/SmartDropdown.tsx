import { Dropdown } from '@alemonjs/react-ui';
import { useRef, useState, type ComponentProps, type ReactNode } from 'react';

export function SmartDropdown({ children, buttons }: { children: ReactNode; buttons: ComponentProps<typeof Dropdown>['buttons'] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<'bottomRight' | 'topRight'>('bottomRight');

  return (
    <div
      ref={ref}
      onPointerDown={() => {
        if (ref.current) {
          const rect = ref.current.getBoundingClientRect();
          const spaceBelow = window.innerHeight - rect.bottom;

          setPlacement(spaceBelow < 160 ? 'topRight' : 'bottomRight');
        }
      }}
    >
      <Dropdown placement={placement} buttons={buttons}>
        {children}
      </Dropdown>
    </div>
  );
}
