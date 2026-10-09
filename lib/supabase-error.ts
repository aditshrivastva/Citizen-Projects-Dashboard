export function getSupabaseErrorMessage(cause: unknown, fallback: string) {
  if (cause && typeof cause === "object") {
    const error = cause as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    if (error.code === "PGRST205" || error.code === "42P01") {
      return "The database table is missing or not in the schema cache. Check that the required Supabase migration has been run.";
    }
    if (error.code === "42501") {
      return "Supabase denied this save. Check the user's role, site edit permission, and that the site-access migration has been applied.";
    }
    if (typeof error.message === "string" && error.message.trim()) {
      const extra = [error.details, error.hint]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .join(" ");
      return extra ? `${error.message} ${extra}` : error.message;
    }
    const serialized = JSON.stringify(cause);
    if (serialized && serialized !== "{}") return serialized;
  }
  return cause instanceof Error ? cause.message : fallback;
}
