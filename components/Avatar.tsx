const palette = ["#ff9d8e", "#9ed9c0", "#bca8ed", "#91cde9", "#f4c66b", "#f3b4cf"];
export function Avatar({ value, name, size = "md" }: { value: string; name: string; size?: "sm" | "md" | "lg" }) {
  const color = palette[name.split("").reduce((sum, c) => sum + c.charCodeAt(0), 0) % palette.length];
  if (value.startsWith("data:image/")) return <img className={`avatar avatar-${size}`} src={value} alt={`${name} avatar`} />;
  return <span className={`avatar avatar-${size}`} style={{ background: color }} aria-label={`${name} avatar`}><span className="avatar-face"><i /><i /></span><b>{value.slice(0, 2).toUpperCase()}</b></span>;
}
