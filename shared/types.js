"use strict";
// ============================================
// Biopulse — Shared Types
// ============================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLAN_LIMITS = void 0;
// --- Freemium ---
exports.PLAN_LIMITS = {
    free: {
        uploads_per_month: 3,
        max_profiles: 2,
        export_pdf: false,
        priority_parsing: false,
    },
    pro: {
        uploads_per_month: Infinity,
        max_profiles: 10,
        export_pdf: true,
        priority_parsing: true,
    },
    lifetime: {
        uploads_per_month: Infinity,
        max_profiles: 20,
        export_pdf: true,
        priority_parsing: true,
    },
};
