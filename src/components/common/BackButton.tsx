// src/components/common/BackButton.tsx
import { Icon } from "./Icon";

interface BackButtonProps {
  onClick: () => void;
}

export function BackButton({ onClick }: BackButtonProps) {
  return (
    <button type="button" className="back-btn" onClick={onClick}>
      <Icon name="back" size={22} />
    </button>
  );
}
