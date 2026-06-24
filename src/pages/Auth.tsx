import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Car } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const Auth = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const from = (location.state as { from?: string } | null)?.from || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSending, setForgotSending] = useState(false);

  useEffect(() => {
    if (user && !loading) navigate(from, { replace: true });
  }, [user, loading, from, navigate]);

  useEffect(() => {
    if (searchParams.get("confirmed") === "1") {
      toast.success("Email confirmed! You can now sign in.");
    }
    if (searchParams.get("error") === "confirm") {
      toast.error("Email confirmation failed. Please try the link again.");
    }
  }, [searchParams]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes("email not confirmed") || message.includes("not confirmed")) {
        toast.error("Please confirm your email first. Check your inbox.");
      } else {
        toast.error(error.message);
      }
    } else toast.success("Welcome back");
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setForgotSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setForgotSending(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Check your email for a reset link");
      setForgotOpen(false);
      setForgotEmail("");
    }
  };

  if (loading) return null;
  if (user) return <Navigate to={from} replace />;

  return (
    <div className="flex min-h-screen min-h-[100dvh] items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-foreground text-background">
            <Car className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-semibold text-foreground">FleetDesk</div>
            <div className="text-xs text-muted-foreground">UAE Rentals</div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4">
            <h1 className="text-xl font-bold text-foreground">Sign In</h1>
            <p className="text-sm text-muted-foreground text-balance mt-1">
              Enter your credentials to access your account
            </p>
          </div>

          <form onSubmit={handleSignIn} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="si-email">Email</Label>
              <Input id="si-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="si-password">Password</Label>
                <button
                  type="button"
                  onClick={() => { setForgotEmail(email); setForgotOpen(true); }}
                  className="min-h-11 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground hover:underline md:min-h-0"
                >
                  Forgot?
                </button>
              </div>
              <Input id="si-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            To request access, contact your administrator
          </p>
        </div>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>
              Enter your email and we'll send you a link to set a new password.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForgot} className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="fp-email">Email</Label>
              <Input
                id="fp-email"
                type="email"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setForgotOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={forgotSending}>
                {forgotSending ? "Sending..." : "Send reset link"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auth;
