/// <reference types="@cloudflare/workers-types" />
interface Env {
  TURNSTILE_SECRET_KEY: string;
}

interface TurnstileResponse {
  success: boolean;
  "error-codes"?: string[];
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = await request.json<{ token?: string }>();
    const token = body.token;

    if (!token) {
      return Response.json(
        { success: false, error: "Missing Turnstile token" },
        { status: 400 },
      );
    }

    const formData = new FormData();
    formData.append("secret", env.TURNSTILE_SECRET_KEY);
    formData.append("response", token);

    const verification = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: formData,
      },
    );

    const result =
      (await verification.json()) as TurnstileResponse;

    if (!result.success) {
      return Response.json(
  { success: false, error: "Turnstile verification failed" },
  { status: 403 },
);
    }

    return Response.json({ success: true });
  } catch {
    return Response.json(
      { success: false, error: "Invalid request" },
      { status: 400 },
    );
  }
};