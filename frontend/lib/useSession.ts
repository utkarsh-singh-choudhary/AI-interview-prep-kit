"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";

/** Client-side route guard: redirects to /login if the session cookie is missing/expired. */
export function useSession() {
  const router = useRouter();
  const [email, setEmail] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.me()
      .then((r) => { if (active) setEmail(r.user.email); })
      .catch(() => router.replace("/login"))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router]);

  return { email, loading };
}
