import { useEffect, useState } from "react";
import { getMe, type Me } from "../lib/session";

export default function SessionNav() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  useEffect(() => {
    const refresh = () => { getMe()
      .then(setMe)
      .catch(() => setMe(null)); };
    refresh();
    window.addEventListener("profile-updated", refresh);
    return () => window.removeEventListener("profile-updated", refresh);
  }, []);
  return (
    <span className="session-nav">
      {me ? (
        <a href="/settings" className="handle-link">
          @{me.handle}
        </a>
      ) : (
        <a href="/signin" aria-label="Sign in">
          Sign in
        </a>
      )}
      <a href="/post" className="post-link">
        <img src="/icons/plus.svg" width="18" height="18" alt="" />
        Post
      </a>
    </span>
  );
}
