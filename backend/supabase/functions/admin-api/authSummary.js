function timestamp(value) {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Never return the provider User object (metadata, identities, factors, tokens).
// An unavailable Auth read is separate from a successful metadata DB read.
export async function readAuthenticationSummary(readUser, targetId) {
  try {
    const { data, error } = await readUser(targetId);
    if (error || data?.user?.id !== targetId) return { available: false };
    return { available: true, email_confirmed_at: timestamp(data.user.email_confirmed_at),
      last_sign_in_at: timestamp(data.user.last_sign_in_at) };
  } catch { return { available: false }; }
}
