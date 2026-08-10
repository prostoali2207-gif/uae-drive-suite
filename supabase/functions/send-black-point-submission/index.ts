import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.1";
import { encodeBase64 } from "jsr:@std/encoding/base64";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("BLACK_POINT_FROM_EMAIL");
  const authHeader = req.headers.get("Authorization");

  if (!supabaseUrl || !anonKey || !authHeader) return json({ error: "Unauthorized" }, 401);
  if (!resendKey || !fromEmail) {
    return json({ error: "Email sending is not configured. RESEND_API_KEY and BLACK_POINT_FROM_EMAIL are required." }, 503);
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return json({ error: "Unauthorized" }, 401);

  let body: { submissionId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!body.submissionId) return json({ error: "submissionId is required" }, 400);

  const { data: submission, error: submissionError } = await supabase
    .from("external_form_submissions")
    .select("id, recipient_email, email_subject, status, package_storage_path, package_file_name, sent_at")
    .eq("id", body.submissionId)
    .maybeSingle();

  if (submissionError) return json({ error: submissionError.message }, 400);
  if (!submission) return json({ error: "Submission not found" }, 404);
  if (submission.status === "sent") return json({ ok: true, alreadySent: true, sentAt: submission.sent_at });

  const { data: claimed, error: claimError } = await supabase
    .from("external_form_submissions")
    .update({ status: "sending", last_error: null, updated_at: new Date().toISOString() })
    .eq("id", submission.id)
    .in("status", ["ready", "failed"])
    .select("id")
    .maybeSingle();

  if (claimError) return json({ error: claimError.message }, 400);
  if (!claimed) return json({ error: "Submission is already being sent" }, 409);

  try {
    const { data: fileData, error: fileError } = await supabase.storage
      .from("external-form-submissions")
      .download(submission.package_storage_path);
    if (fileError || !fileData) throw new Error(fileError?.message ?? "Submission PDF could not be loaded");

    if (fileData.size > 18 * 1024 * 1024) throw new Error("Submission PDF is too large for email. Keep it under 18 MB.");
    const attachment = encodeBase64(new Uint8Array(await fileData.arrayBuffer()));

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [submission.recipient_email],
        subject: submission.email_subject,
        text: "Dear Sharjah Police Traffic Department,\n\nPlease find attached the documents for the black points transfer request.\n\nRegards,\nFleetDesk",
        attachments: [{ filename: submission.package_file_name, content: attachment }],
      }),
    });

    const resendBody = await resendResponse.json().catch(() => ({}));
    if (!resendResponse.ok) {
      const message = typeof resendBody?.message === "string" ? resendBody.message : `Email provider returned ${resendResponse.status}`;
      throw new Error(message);
    }

    const sentAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("external_form_submissions")
      .update({
        status: "sent",
        sent_at: sentAt,
        provider_message_id: typeof resendBody?.id === "string" ? resendBody.id : null,
        last_error: null,
        updated_at: sentAt,
      })
      .eq("id", submission.id);
    if (updateError) throw new Error(updateError.message);

    return json({ ok: true, sentAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email could not be sent";
    await supabase
      .from("external_form_submissions")
      .update({ status: "failed", last_error: message, updated_at: new Date().toISOString() })
      .eq("id", submission.id);
    return json({ error: message }, 502);
  }
});
