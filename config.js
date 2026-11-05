// ============================================================================
// SURYAVIN VEEDU - CONFIGURATION
// ============================================================================
// Optional: Paste your deployed Google Apps Script Web App URL below so all 4
// friends (Saravanan, Surya, Ram, Sathish) automatically connect to the same
// Google Drive sheet on Vercel without needing to paste it on their phones!
// You can also set or change this URL anytime inside the app's "Drive Sync" button.

window.SURYAVIN_VEEDU_CONFIG = {
  HOUSE_NAME: "Suryavin Veedu",
  CURRENCY: "₹",
  MEMBERS: [
    { name: "Saravanan", color: "#6366f1", bg: "rgba(99, 102, 241, 0.14)", border: "rgba(99, 102, 241, 0.4)", short: "SA" },
    { name: "Surya",     color: "#10b981", bg: "rgba(16, 185, 129, 0.14)", border: "rgba(16, 185, 129, 0.4)", short: "SU" },
    { name: "Ram",       color: "#f59e0b", bg: "rgba(245, 158, 11, 0.14)",  border: "rgba(245, 158, 11, 0.4)",  short: "RA" },
    { name: "Sathish",   color: "#ec4899", bg: "rgba(236, 72, 153, 0.14)",  border: "rgba(236, 72, 153, 0.4)",  short: "ST" }
  ],
  // Paste your Google Drive Apps Script Web App URL here if desired:
  DEFAULT_DRIVE_WEB_APP_URL: "https://script.google.com/macros/s/AKfycbxHZR93lESu_2JSyJqywaSFR0N6KEuzVPCpED5Nu0wS1f86Ou02rwYsazGG7YG_Am1_/exec"
};

