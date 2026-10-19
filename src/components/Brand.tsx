import Link from "next/link";
import { BrandMark } from "./BrandMark";
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="DemoPop home">
      <BrandMark className="brand-mark" />
      DemoPop<span className="beta">BETA</span>
    </Link>
  );
}
