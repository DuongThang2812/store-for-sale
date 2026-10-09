-- Supabase's postgres migration user is not a superuser. Permit only that
-- trusted maintenance role to provision/test the two capability roles.
grant bin_auth_api,bin_catalog_api to postgres;
