export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <a className={`brand ${inverse ? "brand-inverse" : ""}`} href="#">
      <img src="/familyhub-mark.svg" alt="" aria-hidden="true" />
      <span className="brand-wordmark">
        Family<span>Hub</span>
      </span>
    </a>
  );
}
