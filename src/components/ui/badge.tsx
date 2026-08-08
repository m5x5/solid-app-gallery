import { cn } from "@/lib/utils";

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground",
        className
      )}
      {...props}
    />
  );
}
