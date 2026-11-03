import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "accent-outline";
  size?: "default" | "compact";
};

/** Shared button foundation for game actions with intentionally distinct roles. */
export function Button({
  className = "",
  size = "default",
  type = "button",
  variant = "secondary",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={`game-button game-button--${variant} game-button--${size} ${className}`.trim()}
      type={type}
    />
  );
}
