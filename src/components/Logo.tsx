import type { ComponentPropsWithoutRef } from "react";
import logo from "../assets/growvibe-logo.png";

export type LogoProps = ComponentPropsWithoutRef<"img">;

export function Logo({ className = "h-12 w-auto", ...props }: LogoProps) {
  return <img src={logo} alt="GrowVibe Ads Solution" className={className} {...props} />;
}

export function LogoMark({ className = "h-12 w-auto", ...props }: LogoProps) {
  return <img src={logo} alt="GrowVibe mark" className={className} {...props} />;
}

export default Logo;