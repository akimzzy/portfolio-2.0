import type { FriendRecord, FriendRequest } from "./account-session";

export const FRIENDS_PREVIEW_INITIAL = {
  incoming: [{ id: "preview-incoming", username: "Ayo", requestedAt: "2026-11-09T09:00:00Z" }],
  outgoing: [{ id: "preview-outgoing", username: "Deji", requestedAt: "2026-11-09T09:15:00Z" }],
  friends: [
    {
      id: "preview-friend",
      username: "Chichi",
      since: "2026-11-09T09:30:00Z",
      seriesPlayed: 0,
      wins: 0,
      losses: 0,
    },
  ],
} satisfies {
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  friends: FriendRecord[];
};
