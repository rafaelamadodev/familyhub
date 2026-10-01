export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: string;
}) {
  return (
    <section className="empty-state">
      <span>✦</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action && <button className="button button-primary">＋ {action}</button>}
    </section>
  );
}
