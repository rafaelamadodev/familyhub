import type { User } from "../api/client";
export function Avatar({ user, large = false }: { user: Pick<User, "name" | "photoUrl">; large?: boolean }) {
  return user.photoUrl ? (
    <img
      className={`avatar ${large ? "avatar-large" : ""}`}
      src={user.photoUrl}
      alt={`Foto de ${user.name}`}
    />
  ) : (
    <span className={`avatar ${large ? "avatar-large" : ""}`}>{user.name.charAt(0).toUpperCase()}</span>
  );
}
