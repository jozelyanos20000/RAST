/** Base URL for API requests. Empty string when served same-origin (production)
 *  or when Vite proxy handles forwarding (development). */
export const API_BASE = import.meta.env.VITE_API_URL || '';
