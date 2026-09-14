/// <reference types="@cloudflare/workers-types" />

import { createClient } from "@supabase/supabase-js";

interface Env {
  TURNSTILE_SECRET_KEY: string;
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
}

interface TurnstileResponse {
  success: boolean;
}

interface CreateBrickBody {
  content?: string;
  category?: string;
  turnstileToken?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({
  request,
  env,
}) => {
  try {
    const authorization = request.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json<CreateBrickBody>();
    const { content, category, turnstileToken } = body;

    if (!content || !category || !turnstileToken) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const formData = new FormData();
    formData.append("secret", env.TURNSTILE_SECRET_KEY);
    formData.append("response", turnstileToken);

    const verification = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: formData,
      },
    );

    const turnstile =
      (await verification.json()) as TurnstileResponse;

    if (!turnstile.success) {
      return Response.json(
        { error: "Turnstile verification failed" },
        { status: 403 },
      );
    }

    const supabase = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: authorization,
          },
        },
      },
    );

    const { data, error } = await supabase
      .from("bricks")
      .insert({
        content,
        category,
      })
      .select("id, content, category, created_at")
      .single();

    if (error) {
      return Response.json(
        { error: error.message },
        { status: 400 },
      );
    }

    return Response.json({
      id: data.id,
      content: data.content,
      category: data.category,
      created_at: data.created_at,
    });
  } catch {
    return Response.json(
      { error: "Invalid request" },
      { status: 400 },
    );
  }
};