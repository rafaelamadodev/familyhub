export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <a className={`brand ${inverse ? "brand-inverse" : ""}`} href="#">
      <i>✦</i>
      <span>
        Family<span>Hub</span>
      </span>
    </a>
  );
}
