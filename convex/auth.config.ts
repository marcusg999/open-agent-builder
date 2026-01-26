/**
 * Convex Authentication Configuration
 *
 * Configures Clerk as the authentication provider for Convex
 * The CLERK_JWT_ISSUER_DOMAIN is set via: npx convex env set
 */

const authConfig = {
  providers: [
    {
      domain: "https://closing-sculpin-49.clerk.accounts.dev", // Your Clerk issuer URL
      applicationID: "convex",
    },
  ],
};

export default authConfig;