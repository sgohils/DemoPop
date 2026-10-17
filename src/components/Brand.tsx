import Link from "next/link";
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="DemoPop home">
      <span className="brand-mark">
        <i />
        <i />
        <i />
      </span>
      DemoPop<span className="beta">BETA</span>
    </Link>
  );
}
