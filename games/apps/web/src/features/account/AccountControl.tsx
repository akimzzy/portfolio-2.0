import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { accountSession } from './account-session';
import { showDialogWithoutActionFocus } from '../../shared/show-dialog';
import { Button } from '../../components/Button';

const accountDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function historyFinishReason(entry: { finish_reason: string }): string | null {
  switch (entry.finish_reason) {
    case 'timeout': return 'Timed out';
    case 'disconnect': return 'Connection lost';
    case 'forfeit': return 'Forfeit';
    default: return null;
  }
}

export function AccountControl() {
  const account = useSyncExternalStore(accountSession.subscribe, accountSession.getSnapshot, accountSession.getSnapshot);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const promptedForUsername = useRef(false);
  const [username, setUsername] = useState('');
  const [showMoreHistory, setShowMoreHistory] = useState(false);

  useEffect(() => {
    if (account.status === 'signed-out') promptedForUsername.current = false;
    if (account.status === 'profile-required' && !promptedForUsername.current) {
      promptedForUsername.current = true;
      if (dialogRef.current && !dialogRef.current.open) showDialogWithoutActionFocus(dialogRef.current);
    }
  }, [account.status]);

  useEffect(() => {
    if (account.status !== 'signed-in') {
      setShowMoreHistory(false);
    }
  }, [account.status]);

  const open = () => {
    // Use the in-memory result immediately; only revalidate after it becomes stale.
    void accountSession.loadGameHistory();
    if (dialogRef.current && !dialogRef.current.open) showDialogWithoutActionFocus(dialogRef.current);
  };
  const close = () => dialogRef.current?.close();
  const submitUsername = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const claimed = await accountSession.claimUsername(username);
    if (claimed) {
      setUsername('');
      close();
    }
  };
  const buttonLabel = account.username ? `Account: @${account.username}` : 'Account and sign in';
  return <>
    <button className="account-trigger" type="button" aria-label={buttonLabel} title={buttonLabel} onClick={open}>
      {account.username ? <span aria-hidden="true">{Array.from(account.username)[0]?.toUpperCase() ?? 'A'}</span> : <svg aria-hidden="true" viewBox="0 0 20 20"><circle cx="10" cy="6.5" r="3" /><path d="M3.8 17a6.2 6.2 0 0 1 12.4 0" /></svg>}
    </button>
    <dialog className="game-dialog account-dialog" ref={dialogRef} aria-labelledby="account-title" onCancel={(event) => { event.preventDefault(); close(); }}>
      <div className="dialog-content account-content">
        <div className="online-dialog-header">
          <h2 id="account-title">{account.status === 'profile-required' ? 'Choose a username' : 'Your account'}</h2>
          <button className="dialog-close" type="button" aria-label="Close account panel" onClick={close}>
            <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15" /></svg>
          </button>
        </div>
        <div className="account-body">
          {account.status === 'unconfigured' && <p>Sign-in is not configured yet. Supabase Auth and Google sign-in need to be connected.</p>}
          {account.status === 'loading' && <p role="status">Checking your account…</p>}
          {account.status === 'signed-out' && <>
            <p>Sign in with Google to keep a unique username across devices. You can still play as a guest.</p>
            <Button variant="primary" type="button" disabled={account.busy} onClick={() => void accountSession.signInWithGoogle()}>
              {account.busy ? 'Opening Google…' : 'Continue with Google'}
            </Button>
          </>}
          {account.status === 'profile-required' && <form className="account-username-form" onSubmit={(event) => void submitUsername(event)}>
            <p>Your username is how other players can recognize and find you.</p>
            <label htmlFor="account-username">Username</label>
            <div className="account-username-input"><span aria-hidden="true">@</span><input id="account-username" name="username" value={username} onChange={(event) => setUsername(event.currentTarget.value)} autoComplete="username" maxLength={20} minLength={3} required pattern="[A-Za-z][A-Za-z0-9_]{2,19}" aria-describedby="username-hint" /></div>
            <small id="username-hint">3–20 characters. Start with a letter; use letters, numbers, or underscores.</small>
            <Button variant="primary" type="submit" disabled={account.busy}>{account.busy ? 'Saving…' : 'Save username'}</Button>
          </form>}
          {account.status === 'signed-in' && <div className="account-signed-in">
            <div className="account-identity"><span>Signed in as</span><strong>@{account.username}</strong></div>
            <div className="account-facts" aria-label="Account summary">
              {account.joinedAt && <span>Joined {accountDate.format(new Date(account.joinedAt))}</span>}
              <span>{account.historyCount} matches played</span>
            </div>
            <section className="account-history" aria-label="Recent game history">
              <div className="account-history-heading">
                <h3>Recent matches</h3>
                <button className="account-history-refresh" type="button" onClick={() => void accountSession.loadGameHistory(true)} aria-label={account.historyRefreshing ? 'Refreshing recent matches' : 'Refresh recent matches'} title={account.historyRefreshing ? 'Refreshing recent matches' : 'Refresh recent matches'} aria-busy={account.historyRefreshing} disabled={account.historyRefreshing}>
                  <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M16.2 7.1A6.6 6.6 0 1 0 16.6 11M16.2 3.8v3.8h-3.8" /></svg>
                </button>
              </div>
              {account.historyStatus === 'loading' && account.history.length === 0 ? <div className="account-history-skeleton-list" role="status" aria-label="Loading recent matches">
                {[0, 1, 2].map((item) => <div className="account-history-skeleton" key={item} aria-hidden="true">
                  <span className="account-history-skeleton-outcome" />
                  <span className="account-history-skeleton-title" />
                  <span className="account-history-skeleton-date" />
                  <span className="account-history-skeleton-detail" />
                </div>)}
              </div>
                : account.historyStatus === 'error' && account.history.length === 0 ? <div className="account-history-retry"><p className="account-history-message" role="alert">{account.historyError}</p><button type="button" onClick={() => void accountSession.loadGameHistory(true)}>Try again</button></div>
                  : account.history.length === 0 ? <p className="account-history-message">Completed results will appear here.</p>
                    : <ol className="account-history-list">{account.history.slice(0, showMoreHistory ? 20 : 4).map((entry, index) => {
                      const finishReason = historyFinishReason(entry);
                      const gameName = entry.game_id === 'connect-four' ? 'Connect Four' : entry.game_id === 'reversi' ? 'Reversi' : entry.game_id;
                      return <li key={`${entry.game_id}:${entry.completed_at}:${entry.opponent_name}:${index}`}>
                        <div className="account-history-card-heading">
                          <strong className={`account-history-outcome ${entry.result === 'win' ? 'is-win' : 'is-loss'}`}>{entry.result === 'win' ? 'Won' : 'Lost'}</strong>
                          <span className="account-history-game-name">{gameName}</span>
                          <time dateTime={entry.completed_at}>{accountDate.format(new Date(entry.completed_at))}</time>
                        </div>
                        <div className="account-history-card-detail">
                          <span className="account-history-opponent">vs. {entry.opponent_name}</span>
                          <span className="account-history-score" aria-label={`Series score: ${entry.wins} wins to ${entry.losses}`}>{entry.wins}–{entry.losses}</span>
                          {finishReason && <span className="account-history-reason">{finishReason}</span>}
                        </div>
                      </li>;
                    })}</ol>}
              {account.history.length > 4 && <button className="account-history-more" type="button" aria-expanded={showMoreHistory} onClick={() => setShowMoreHistory((value) => !value)}>
                {showMoreHistory ? 'Show fewer' : account.historyCount > account.history.length
                  ? `Show ${account.history.length} recent`
                  : `Show all ${account.history.length}`}
              </button>}
              {account.historyError && account.history.length > 0 && <p className="account-history-note">Showing saved results. Refresh when you’re back online.</p>}
            </section>
            <Button variant="secondary" type="button" disabled={account.busy} onClick={() => void accountSession.signOut()}>{account.busy ? 'Signing out…' : 'Sign out'}</Button>
          </div>}
          {account.status === 'error' && <div className="account-error-state" role="alert">
            <p>{account.error}</p>
            <Button variant="secondary" type="button" onClick={() => void accountSession.refreshProfile()}>Try again</Button>
            <Button variant="secondary" type="button" disabled={account.busy} onClick={() => void accountSession.signOut()}>Sign out</Button>
          </div>}
          {account.error && account.status !== 'error' && <p className="account-error" role="alert">{account.error}</p>}
        </div>
      </div>
    </dialog>
  </>;
}
