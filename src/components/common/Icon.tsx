// src/components/common/Icon.tsx
//
// Thin wrapper over Phosphor Icons so every icon in the app shares one
// name/size/weight API, regardless of which underlying glyph it maps to.
import type { ComponentProps } from "react";
import {
  List,
  X,
  RocketLaunch,
  Target,
  Rocket,
  Bank,
  ArrowsClockwise,
  ArrowClockwise,
  SkipBack,
  Play,
  Pause,
  SkipForward,
  ArrowCounterClockwise,
  CaretLeft,
  CaretRight,
  Planet,
} from "@phosphor-icons/react";

export type IconName =
  | "menu"
  | "close"
  | "nav-launches"
  | "nav-pads"
  | "nav-rockets"
  | "nav-agencies"
  | "sync"
  | "refresh"
  | "timeline-prev"
  | "timeline-play"
  | "timeline-pause"
  | "timeline-next"
  | "timeline-reset"
  | "back"
  | "forward"
  | "orbit";

type PhosphorIcon = typeof List;

const COMPONENTS: Record<IconName, PhosphorIcon> = {
  menu: List,
  close: X,
  "nav-launches": RocketLaunch,
  "nav-pads": Target,
  "nav-rockets": Rocket,
  "nav-agencies": Bank,
  sync: ArrowsClockwise,
  refresh: ArrowClockwise,
  "timeline-prev": SkipBack,
  "timeline-play": Play,
  "timeline-pause": Pause,
  "timeline-next": SkipForward,
  "timeline-reset": ArrowCounterClockwise,
  back: CaretLeft,
  forward: CaretRight,
  orbit: Planet,
};

interface IconProps extends Omit<ComponentProps<PhosphorIcon>, "weight"> {
  name: IconName;
  size?: number;
  weight?: ComponentProps<PhosphorIcon>["weight"];
}

export function Icon({
  name,
  size = 20,
  weight = "regular",
  ...rest
}: IconProps) {
  const Component = COMPONENTS[name];
  return <Component size={size} weight={weight} {...rest} />;
}
