import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const AuthConfirm = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const run = async () => {
      const url = new URL(window.location.href);
      const tokenHash = url.searchParams.get("token_hash");
      const type = url.searchParams.get("type");
      const code = url.searchParams.get("code");
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const hasAccessTokenInHash = !!hashParams.get("access_token");

      try {
        if (tokenHash && type) {
          await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as "signup" });
        } else if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        } else if (!hasAccessTokenInHash) {
          navigate("/auth?error=confirm", { replace: true });
          return;
        }
      } catch {
        navigate("/auth?error=confirm", { replace: true });
        return;
      }

      await supabase.auth.signOut();
      navigate("/auth?confirmed=1&tab=signin", { replace: true });
    };

    run();
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-sm text-muted-foreground">Verifying your email...</div>
    </div>
  );
};

export default AuthConfirm;

