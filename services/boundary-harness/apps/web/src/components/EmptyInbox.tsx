export function EmptyInbox() {
  return (
    <section className="empty-inbox" aria-live="polite" data-testid="empty-inbox">
      <p className="empty-kicker">Inbox</p>
      <h2>All quiet.</h2>
      <p className="empty-copy">
        No ready gates. Nothing to decide.
      </p>
    </section>
  );
}
