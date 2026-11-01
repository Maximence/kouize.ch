/** Shared with proxy.ts, which can't import the server-only session code. */
export const SESSION_COOKIE = "kouize_session";
/** Holds a student's account session on the online copy (apart from the admin's, so both can be logged in). */
export const USER_COOKIE = "kouize_user";
/** Holds a player's recovery code on the online copy (players made before accounts). */
export const PLAYER_COOKIE = "kouize_player";
