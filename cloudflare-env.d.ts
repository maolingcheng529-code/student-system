declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    AUTH_PEPPER?: string;
    ADMIN_PASSWORD_HASH?: string;
    TEXTBOOK_IMAGE_KEY?: string;
  }
}
