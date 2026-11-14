import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import { AccountConfirmDialog } from "../../components/AccountConfirmDialog";
import { FriendMatchup } from "./FriendMatchup";
import {
  accountSession,
  type AccountSnapshot,
  type FriendLookup,
  type FriendRecord,
  type FriendRequest,
  type FriendRequestResponse,
} from "./account-session";

const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;
const SEARCH_DEBOUNCE_MS = 450;
const EMPTY_FRIENDS_PREVIEW: FriendsPreviewState = {
  incoming: [],
  outgoing: [],
  friends: [],
};
type FriendsPreviewState = {
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  friends: FriendRecord[];
};
export type FriendsView = "all" | "requests" | "sent";
type FriendConfirmation =
  | { kind: "remove"; friend: Pick<FriendRecord, "id" | "username"> }
  | { kind: "cancel-request"; request: FriendRequest };

export function FriendsPanel({
  account,
  active,
  view: friendsView,
  onViewChange,
  onPreviewIncomingCountChange,
}: {
  account: AccountSnapshot;
  active: boolean;
  view: FriendsView;
  onViewChange: (view: FriendsView) => void;
  onPreviewIncomingCountChange: (count: number | null) => void;
}) {
  const lookupRequestRef = useRef(0);
  const lastLookupRef = useRef("");
  const activeLookupRef = useRef<{ query: string; request: number } | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const [username, setUsername] = useState("");
  const [lookup, setLookup] = useState<FriendLookup | null>(null);
  const [lookupComplete, setLookupComplete] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<FriendConfirmation | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [previewState, setPreviewState] = useState<FriendsPreviewState>(EMPTY_FRIENDS_PREVIEW);

  useEffect(() => {
    if (import.meta.env.DEV)
      onPreviewIncomingCountChange(previewMode ? previewState.incoming.length : null);
  }, [onPreviewIncomingCountChange, previewMode, previewState.incoming.length]);

  useEffect(
    () => () => {
      lookupRequestRef.current += 1;
      if (debounceTimerRef.current !== null) window.clearTimeout(debounceTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (active && friendsView === "requests" && !previewMode)
      void accountSession.loadMatchInvites();
  }, [active, friendsView, previewMode]);

  const searchPlayer = useCallback(async (input: string, force = false) => {
    const query = input.trim().replace(/^@/, "");
    if (
      !USERNAME_PATTERN.test(query) ||
      activeLookupRef.current?.query === query ||
      (!force && lastLookupRef.current === query)
    )
      return;

    lastLookupRef.current = query;
    const request = ++lookupRequestRef.current;
    activeLookupRef.current = { query, request };
    setLookupBusy(true);
    setLookup(null);
    setLookupComplete(false);
    setLookupError("");
    setNotice("");
    accountSession.clearFriendsError();
    try {
      const result = await accountSession.lookupFriend(query);
      if (request !== lookupRequestRef.current) return;
      setLookup(result);
      setLookupComplete(true);
    } catch (error) {
      if (request !== lookupRequestRef.current) return;
      setLookupError(
        error instanceof Error ? error.message : "Player could not be found. Try again.",
      );
    } finally {
      if (activeLookupRef.current?.request === request) activeLookupRef.current = null;
      if (request === lookupRequestRef.current) setLookupBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    const query = username.trim().replace(/^@/, "");
    if (!USERNAME_PATTERN.test(query)) {
      lastLookupRef.current = "";
      setLookup(null);
      setLookupComplete(false);
      setLookupError("");
      return;
    }
    if (query === lastLookupRef.current) return;

    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void searchPlayer(query);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [active, username, searchPlayer]);

  const findPlayer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    void searchPlayer(username, true);
  };

  const updateUsername = (value: string) => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    lookupRequestRef.current += 1;
    activeLookupRef.current = null;
    lastLookupRef.current = "";
    setLookupBusy(false);
    setUsername(value);
    setLookup(null);
    setLookupComplete(false);
    setLookupError("");
    setNotice("");
  };

  const togglePreview = async () => {
    if (previewMode) {
      setPreviewMode(false);
      setPreviewState(EMPTY_FRIENDS_PREVIEW);
      onViewChange("all");
      setNotice("");
      return;
    }
    if (import.meta.env.DEV) {
      const { FRIENDS_PREVIEW_INITIAL } = await import("./friends-preview");
      setPreviewState(FRIENDS_PREVIEW_INITIAL);
      setPreviewMode(true);
      onViewChange("all");
      setNotice("");
    }
  };

  const sendRequest = async () => {
    if (!lookup) return;
    const sent = await accountSession.sendFriendRequest(lookup.username);
    if (sent) {
      setLookup({ ...lookup, status: "pending", requestedByYou: true });
    }
  };

  const updateLookupRelationship = (
    targetUsername: string,
    status: FriendLookup["status"],
    requestedByYou: boolean | null,
  ) => {
    setLookup((current) =>
      current?.username.toLocaleLowerCase() === targetUsername.toLocaleLowerCase()
        ? { ...current, status, requestedByYou }
        : current,
    );
  };

  const respond = async (
    request: FriendRequest,
    response: Extract<FriendRequestResponse, "accept" | "decline">,
  ) => {
    if (previewMode) {
      setPreviewState((current) => {
        const incoming = current.incoming.filter((item) => item.id !== request.id);
        const outgoing = current.outgoing.filter((item) => item.id !== request.id);
        return {
          incoming,
          outgoing,
          friends:
            response === "accept"
              ? [
                  ...current.friends,
                  {
                    id: request.id,
                    username: request.username,
                    since: new Date().toISOString(),
                    seriesPlayed: 0,
                    wins: 0,
                    losses: 0,
                  },
                ]
              : current.friends,
        };
      });
      if (response === "accept") updateLookupRelationship(request.username, "accepted", false);
      else updateLookupRelationship(request.username, "declined", false);
      return;
    }
    const changed = await accountSession.respondToFriendRequest(request.id, response);
    if (changed)
      updateLookupRelationship(
        request.username,
        response === "accept" ? "accepted" : "declined",
        false,
      );
  };

  const askToRemove = (friend: Pick<FriendRecord, "id" | "username">) => {
    accountSession.clearFriendsError();
    setConfirmation({ kind: "remove", friend });
  };

  const askToCancelRequest = (request: FriendRequest) => {
    accountSession.clearFriendsError();
    setConfirmation({ kind: "cancel-request", request });
  };

  const openMatchInvite = (invite: AccountSnapshot["incomingMatchInvites"][number]) => {
    const link = new URL(window.location.href);
    link.search = "";
    link.searchParams.set("match", invite.matchId);
    link.hash = `invite=${encodeURIComponent(invite.inviteToken)}`;
    window.location.assign(link.href);
  };

  const renderMatchInvite = (invite: AccountSnapshot["incomingMatchInvites"][number]) => (
    <li className="account-match-invite" key={invite.id}>
      <div className="account-match-invite-copy">
        <strong>@{invite.senderUsername}</strong>
        <span>
          {invite.gameId === "reversi" ? "Reversi" : "Connect Four"} ·
          {invite.seriesTarget === 1 ? " One game" : ` First to ${invite.seriesTarget}`}
        </span>
      </div>
      <div className="account-match-invite-actions">
        <button
          className="account-match-invite-join"
          type="button"
          onClick={() => openMatchInvite(invite)}
        >
          Join
        </button>
        <button
          className="account-match-invite-dismiss"
          type="button"
          disabled={account.matchInvitesBusyId === invite.id}
          onClick={() => void accountSession.dismissMatchInvite(invite.id)}
        >
          {account.matchInvitesBusyId === invite.id ? "…" : "Dismiss"}
        </button>
      </div>
    </li>
  );

  const cancelConfirmation = () => setConfirmation(null);

  const confirmRelationshipAction = async () => {
    if (!confirmation) return;
    if (previewMode) {
      if (confirmation.kind === "remove") {
        setPreviewState((current) => ({
          ...current,
          friends: current.friends.filter((friend) => friend.id !== confirmation.friend.id),
        }));
        setNotice(`@${confirmation.friend.username} was removed from your friends.`);
        updateLookupRelationship(confirmation.friend.username, "removed", null);
      } else {
        setPreviewState((current) => ({
          ...current,
          outgoing: current.outgoing.filter((request) => request.id !== confirmation.request.id),
        }));
        updateLookupRelationship(confirmation.request.username, "cancelled", true);
      }
      cancelConfirmation();
      return;
    }
    const changed =
      confirmation.kind === "remove"
        ? await accountSession.removeFriend(confirmation.friend.id)
        : await accountSession.respondToFriendRequest(confirmation.request.id, "cancel");
    if (!changed) return;
    if (confirmation.kind === "remove") {
      setNotice(`@${confirmation.friend.username} was removed from your friends.`);
      updateLookupRelationship(confirmation.friend.username, "removed", null);
    } else {
      updateLookupRelationship(confirmation.request.username, "cancelled", true);
    }
    cancelConfirmation();
  };

  const requestState = (result: FriendLookup) => {
    if (result.status === "accepted") return "Already on your friends list.";
    if (result.status === "pending" && result.requestedByYou)
      return "Your request is waiting for them.";
    if (result.status === "pending")
      return "They’ve already sent you a request. Open Requests to respond.";
    return null;
  };

  const renderRequest = (request: FriendRequest, kind: "incoming" | "outgoing") => (
    <li className="account-friend-row" key={request.id}>
      <div className="account-friend-identity">
        <strong>@{request.username}</strong>
        <span>{kind === "incoming" ? "Wants to connect" : "Waiting for acceptance"}</span>
      </div>
      {kind === "incoming" ? (
        <div className="account-friend-actions">
          <button
            className="account-friend-action is-primary"
            type="button"
            disabled={!previewMode && account.friendsActionBusy}
            onClick={() => void respond(request, "accept")}
          >
            Accept
          </button>
          <button
            className="account-friend-action"
            type="button"
            disabled={!previewMode && account.friendsActionBusy}
            onClick={() => void respond(request, "decline")}
          >
            Decline
          </button>
        </div>
      ) : (
        <button
          className="account-friend-action"
          type="button"
          disabled={!previewMode && account.friendsActionBusy}
          onClick={() => askToCancelRequest(request)}
        >
          Cancel
        </button>
      )}
    </li>
  );

  const incomingRequests = previewMode ? previewState.incoming : account.incomingFriendRequests;
  const outgoingRequests = previewMode ? previewState.outgoing : account.outgoingFriendRequests;
  const friends = previewMode ? previewState.friends : account.friends;
  const lookupStatus = lookup ? requestState(lookup) : null;

  return (
    <section className="account-friends" aria-label="Friends">
      {import.meta.env.DEV && (
        <div className="account-friends-preview-tools">
          {previewMode && (
            <p className="account-friends-message" role="status">
              Preview only, including the header badge. Nothing is saved.
            </p>
          )}
          <button
            className="account-friends-preview-toggle"
            type="button"
            aria-pressed={previewMode}
            onClick={() => void togglePreview()}
          >
            {previewMode ? "Exit preview" : "Preview friend states"}
          </button>
        </div>
      )}
      <form
        className="account-friend-search"
        aria-busy={lookupBusy || undefined}
        onSubmit={(event) => void findPlayer(event)}
      >
        <div className="account-friend-input">
          <span aria-hidden="true">@</span>
          <input
            id="account-friend-username"
            value={username}
            onChange={(event) => updateUsername(event.currentTarget.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={20}
            minLength={3}
            pattern="[A-Za-z][A-Za-z0-9_]{2,19}"
            placeholder="Add friend by username"
            aria-label="Add a friend by exact username"
          />
          {lookupBusy && (
            <span className="account-friend-search-status" role="status">
              Searching…
            </span>
          )}
        </div>
      </form>
      <div className="account-friends-view-switcher" role="group" aria-label="Friend lists">
        <button
          type="button"
          className="account-friends-view-button"
          aria-pressed={friendsView === "all"}
          onClick={() => onViewChange("all")}
        >
          All
        </button>
        <button
          type="button"
          className="account-friends-view-button"
          aria-pressed={friendsView === "requests"}
          onClick={() => onViewChange("requests")}
        >
          Requests <span>{incomingRequests.length + account.incomingMatchInvites.length}</span>
        </button>
        <button
          type="button"
          className="account-friends-view-button"
          aria-pressed={friendsView === "sent"}
          onClick={() => onViewChange("sent")}
        >
          Sent <span>{outgoingRequests.length}</span>
        </button>
      </div>
      {lookupError && (
        <div className="account-friend-search-error">
          <p className="account-friends-message is-error" role="alert">
            {lookupError}
          </p>
          <button
            className="account-friends-retry"
            type="button"
            disabled={lookupBusy}
            onClick={() => void searchPlayer(username, true)}
          >
            Try again
          </button>
        </div>
      )}
      {lookupComplete && !lookup && !lookupError && (
        <p className="account-friends-message" role="status">
          No player found with that username.
        </p>
      )}
      {lookup && (
        <div className="account-friend-lookup-result" aria-live="polite">
          <strong>@{lookup.username}</strong>
          {lookupStatus ? (
            <span>{lookupStatus}</span>
          ) : (
            <Button
              variant="secondary"
              type="button"
              disabled={account.friendsActionBusy}
              onClick={() => void sendRequest()}
            >
              Send request
            </Button>
          )}
        </div>
      )}

      {!previewMode && account.friendsError && (
        <p className="account-friends-message is-error" role="alert">
          {account.friendsError}
        </p>
      )}
      {notice && (
        <p className="account-friends-message" role="status">
          {notice}
        </p>
      )}

      {!previewMode && (account.friendsStatus === "loading" || account.friendsStatus === "idle") ? (
        <p className="account-friends-message" role="status">
          Loading friends…
        </p>
      ) : !previewMode && account.friendsStatus === "error" ? (
        <button
          className="account-friends-retry"
          type="button"
          onClick={() => void accountSession.loadFriends(true)}
        >
          Try again
        </button>
      ) : null}

      {(previewMode ||
        (account.friendsStatus !== "loading" &&
          account.friendsStatus !== "idle" &&
          account.friendsStatus !== "error") ||
        (friendsView === "requests" && account.matchInvitesStatus === "ready")) && (
        <div className="account-friends-lists" aria-live="polite">
          {friendsView === "all" ? (
            <>
              {friends.length > 0 && (
                <section className="account-friend-group" aria-labelledby="friends-list-title">
                  <h4 id="friends-list-title">Friends</h4>
                  <ul className="account-friend-list">
                    {friends.map((friend) => (
                      <FriendMatchup
                        account={account}
                        friend={friend}
                        disabled={!previewMode && account.friendsActionBusy}
                        key={friend.id}
                        onRemove={() => askToRemove(friend)}
                      />
                    ))}
                  </ul>
                </section>
              )}
              {incomingRequests.length > 0 && (
                <section className="account-friend-group" aria-labelledby="friend-requests-title">
                  <h4 id="friend-requests-title">Requests</h4>
                  <ul className="account-friend-list">
                    {incomingRequests.map((request) => renderRequest(request, "incoming"))}
                  </ul>
                </section>
              )}
              {outgoingRequests.length > 0 && (
                <section className="account-friend-group" aria-labelledby="sent-requests-title">
                  <h4 id="sent-requests-title">Sent</h4>
                  <ul className="account-friend-list">
                    {outgoingRequests.map((request) => renderRequest(request, "outgoing"))}
                  </ul>
                </section>
              )}
              {friends.length === 0 &&
                incomingRequests.length === 0 &&
                outgoingRequests.length === 0 && (
                  <p className="account-friends-message">No friends yet.</p>
                )}
            </>
          ) : friendsView === "requests" ? (
            <>
              {account.matchInvitesStatus === "loading" && !account.incomingMatchInvites.length && (
                <p className="account-friends-message" role="status">
                  Loading requests…
                </p>
              )}
              {account.matchInvitesError && (
                <div className="account-friend-search-error" role="alert">
                  <p className="account-friends-message is-error">{account.matchInvitesError}</p>
                  <button
                    className="account-friends-retry"
                    type="button"
                    onClick={() => void accountSession.loadMatchInvites(true)}
                  >
                    Try again
                  </button>
                </div>
              )}
              {incomingRequests.length > 0 && (
                <section className="account-friend-group" aria-label="Friend requests">
                  <ul className="account-friend-list">
                    {incomingRequests.map((request) => renderRequest(request, "incoming"))}
                  </ul>
                </section>
              )}
              {!previewMode && account.incomingMatchInvites.length > 0 && (
                <section className="account-friend-group" aria-label="Game invites">
                  <h4>Game invites</h4>
                  <ul className="account-match-invite-list">
                    {account.incomingMatchInvites.map(renderMatchInvite)}
                  </ul>
                </section>
              )}
              {incomingRequests.length === 0 &&
                (previewMode ||
                  (account.matchInvitesStatus === "ready" &&
                    account.incomingMatchInvites.length === 0)) && (
                  <p className="account-friends-message">No requests.</p>
                )}
            </>
          ) : outgoingRequests.length === 0 ? (
            <p className="account-friends-message">No sent requests.</p>
          ) : (
            <section className="account-friend-group" aria-label="Sent requests">
              <ul className="account-friend-list">
                {outgoingRequests.map((request) => renderRequest(request, "outgoing"))}
              </ul>
            </section>
          )}
        </div>
      )}

      <AccountConfirmDialog
        open={confirmation !== null}
        title={confirmation?.kind === "remove" ? "Remove friend?" : "Cancel request?"}
        description={
          confirmation?.kind === "remove"
            ? `@${confirmation.friend.username} will be removed from your friends list.`
            : `Your friend request to @${confirmation?.kind === "cancel-request" ? confirmation.request.username : ""} will be withdrawn.`
        }
        confirmLabel={confirmation?.kind === "remove" ? "Remove" : "Cancel request"}
        cancelLabel={confirmation?.kind === "remove" ? "Keep friend" : "Keep request"}
        busy={!previewMode && account.friendsActionBusy}
        error={!previewMode ? account.friendsError : ""}
        onCancel={cancelConfirmation}
        onConfirm={() => void confirmRelationshipAction()}
      />
    </section>
  );
}
