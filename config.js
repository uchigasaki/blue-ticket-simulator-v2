window.APP_CONFIG = {
  // Google Apps Script Web App URL.
  // Example: "https://script.google.com/macros/s/XXXX/exec"
  GOOGLE_SCRIPT_URL: "",

  // Public URL for the one-week follow-up survey.
  // Recommended: Google Form prefilled URL with placeholders:
  // "https://docs.google.com/forms/d/e/.../viewform?usp=pp_url&entry.111={participantId}&entry.222={sessionId}"
  // Fallback: "https://uchigasaki.github.io/blue-ticket-simulator/followup.html"
  FOLLOW_UP_URL: "",

  // Optional aggregate stats for a Moral Machine-like comparison panel.
  // Replace these values manually or from an exported sheet summary.
  GROUP_STATS: null
  // Example:
  // GROUP_STATS: {
  //   participantCount: 42,
  //   averageScore: 8.4,
  //   categoryAverages: {
  //     road_position: 72,
  //     pedestrian_priority: 68,
  //     hazard_prediction: 75,
  //     system_process: 61
  //   }
  // }
};
