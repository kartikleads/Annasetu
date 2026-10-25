/**
 * AnnaSetu — Subscription, Quality Control, and Verification Service
 * src/services/subscriptionService.js
 */

const UPI_STORAGE_KEY = "annasetu-admin-upi-v1";
const SUBSCRIPTIONS_STORAGE_KEY = "annasetu-subscriptions-v1";
const RATINGS_STORAGE_KEY = "annasetu-donor-ratings-v1";
const CHANNEL_NAME = "annasetu_realtime_channel";

export const DEFAULT_ADMIN_UPI = "annasetu.admin@okhdfcbank";

// Sample Receipt SVG Data URL for instant realistic mock screenshot
export const SAMPLE_RECEIPT_IMAGE =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="360" height="480" viewBox="0 0 360 480" fill="#0f172a">
  <rect width="360" height="480" rx="16" fill="#0f172a" stroke="#22c55e" stroke-width="2"/>
  <rect x="20" y="20" width="320" height="70" rx="12" fill="#1e293b"/>
  <circle cx="55" cy="55" r="22" fill="#22c55e"/>
  <path d="M47 55 l6 6 l12 -12" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
  <text x="90" y="47" fill="#ffffff" font-family="sans-serif" font-size="16" font-weight="bold">Payment Successful</text>
  <text x="90" y="67" fill="#94a3b8" font-family="sans-serif" font-size="12">AnnaSetu Regulatory Network</text>
  
  <text x="180" y="140" text-anchor="middle" fill="#22c55e" font-family="sans-serif" font-size="34" font-weight="900">₹1,500.00</text>
  <text x="180" y="165" text-anchor="middle" fill="#94a3b8" font-family="sans-serif" font-size="13">UPI Autopay / Verified Transaction</text>

  <line x1="30" y1="190" x2="330" y2="190" stroke="#334155" stroke-dasharray="4"/>

  <text x="35" y="225" fill="#94a3b8" font-family="sans-serif" font-size="12">To</text>
  <text x="325" y="225" text-anchor="end" fill="#f8fafc" font-family="sans-serif" font-size="13" font-weight="bold">AnnaSetu Central Escrow</text>

  <text x="35" y="260" fill="#94a3b8" font-family="sans-serif" font-size="12">Receiving UPI ID</text>
  <text x="325" y="260" text-anchor="end" fill="#38bdf8" font-family="sans-serif" font-size="12">annasetu.admin@okhdfcbank</text>

  <text x="35" y="295" fill="#94a3b8" font-family="sans-serif" font-size="12">UPI Ref / UTR No.</text>
  <text x="325" y="295" text-anchor="end" fill="#f8fafc" font-family="sans-serif" font-size="13" font-weight="600">429104829104</text>

  <text x="35" y="330" fill="#94a3b8" font-family="sans-serif" font-size="12">Date &amp; Time</text>
  <text x="325" y="330" text-anchor="end" fill="#f8fafc" font-family="sans-serif" font-size="12">Today, Verified Instant</text>

  <text x="35" y="365" fill="#94a3b8" font-family="sans-serif" font-size="12">Verification Hash</text>
  <text x="325" y="365" text-anchor="end" fill="#a855f7" font-family="sans-serif" font-size="11">0x8f2a...c91d [FSSAI-SEC]</text>

  <rect x="30" y="395" width="300" height="50" rx="8" fill="#14532d" stroke="#22c55e" stroke-width="1"/>
  <text x="180" y="425" text-anchor="middle" fill="#86efac" font-family="sans-serif" font-size="12" font-weight="bold">✓ SCREENSHOT VERIFIED BY BANK</text>
</svg>
`);

// Initial Default Submissions for immediate presentation realism in Admin Panel
const DEFAULT_SUBMISSIONS = [
  {
    id: "sub-seed-1",
    userId: "usr-demo-donor",
    userEmail: "mcdonalds@cprl.in",
    userName: "McDonald's",
    role: "donor",
    planId: "donor-monthly",
    planName: "Donor Plan: ₹1500 / month",
    amount: "₹1,500",
    status: "Pending", // "Pending" | "Approved" | "Rejected"
    utr: "429104829104",
    screenshotUrl: SAMPLE_RECEIPT_IMAGE,
    submittedAt: "10 mins ago",
    timestamp: Date.now() - 600000,
    adminNotes: "",
  },
  {
    id: "sub-seed-2",
    userId: "usr-demo-ngo",
    userEmail: "contact@feedingindia.org",
    userName: "Feeding India (Zomato Giving)",
    role: "ngo",
    planId: "ngo-quarterly",
    planName: "NGO Plan: ₹1500 / 3 months",
    amount: "₹1,500",
    status: "Approved",
    utr: "301928471920",
    screenshotUrl: SAMPLE_RECEIPT_IMAGE,
    submittedAt: "Yesterday",
    timestamp: Date.now() - 86400000,
    adminNotes: "FSSAI Partner NGO Verification Confirmed",
  },
  {
    id: "sub-seed-3",
    userId: "usr-haldiram",
    userEmail: "surplus@haldirams.com",
    userName: "Haldiram Foods Int.",
    role: "donor",
    planId: "donor-monthly",
    planName: "Donor Plan: ₹1500 / month",
    amount: "₹1,500",
    status: "Rejected",
    utr: "102938475610",
    screenshotUrl: SAMPLE_RECEIPT_IMAGE,
    submittedAt: "2 days ago",
    timestamp: Date.now() - 172800000,
    adminNotes: "UTR mismatch on bank reconciliation. Please re-upload clear statement screenshot.",
  },
];

let broadcastChannel = null;
try {
  if (typeof window !== "undefined" && "BroadcastChannel" in window) {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
  }
} catch {
  // Graceful fallback
}

export function getAdminUpiId() {
  try {
    if (typeof window === "undefined") return DEFAULT_ADMIN_UPI;
    const stored = localStorage.getItem(UPI_STORAGE_KEY);
    return (stored && stored.trim()) ? stored.trim() : DEFAULT_ADMIN_UPI;
  } catch {
    return DEFAULT_ADMIN_UPI;
  }
}

export function saveAdminUpiId(newUpi) {
  try {
    const cleaned = (newUpi || "").trim() || DEFAULT_ADMIN_UPI;
    if (typeof window !== "undefined") {
      localStorage.setItem(UPI_STORAGE_KEY, cleaned);
      if (broadcastChannel) {
        broadcastChannel.postMessage({
          actionType: "UPDATE_ADMIN_UPI",
          adminUpiId: cleaned,
          timestamp: Date.now(),
        });
      }
    }
    return cleaned;
  } catch {
    return newUpi;
  }
}

export function getSubscriptions() {
  try {
    if (typeof window === "undefined") return DEFAULT_SUBMISSIONS;
    const raw = localStorage.getItem(SUBSCRIPTIONS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(SUBSCRIPTIONS_STORAGE_KEY, JSON.stringify(DEFAULT_SUBMISSIONS));
      return DEFAULT_SUBMISSIONS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_SUBMISSIONS;
  } catch {
    return DEFAULT_SUBMISSIONS;
  }
}

export function saveSubscriptions(list) {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(SUBSCRIPTIONS_STORAGE_KEY, JSON.stringify(list));
      if (broadcastChannel) {
        broadcastChannel.postMessage({
          actionType: "UPDATE_SUBSCRIPTIONS",
          subscriptions: list,
          timestamp: Date.now(),
        });
      }
    }
  } catch (err) {
    console.warn("[subscriptionService] Failed to save subscriptions:", err);
  }
}

export function getUserSubscription(userEmail) {
  const normEmail = (userEmail || "").trim().toLowerCase();
  const all = getSubscriptions();
  // Find latest entry for this user
  const found = all
    .filter((s) => (s.userEmail || "").trim().toLowerCase() === normEmail)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];

  return found || null;
}

export function submitPaymentProof({
  userId,
  userEmail,
  userName,
  role,
  planId,
  planName,
  amount,
  screenshotUrl,
  utr,
}) {
  const all = getSubscriptions();
  const normEmail = (userEmail || "").trim().toLowerCase();

  const newEntry = {
    id: "sub-" + Date.now(),
    userId: userId || ("usr-" + Math.random().toString(36).slice(2)),
    userEmail: normEmail,
    userName: userName || "AnnaSetu Member",
    role: role || "donor",
    planId: planId || (role === "ngo" ? "ngo-quarterly" : "donor-monthly"),
    planName:
      planName ||
      (role === "ngo"
        ? "NGO Plan: ₹1500 / 3 months"
        : "Donor Plan: ₹1500 / month"),
    amount: amount || "₹1,500",
    status: "Pending", // "Pending" | "Approved" | "Rejected"
    utr: utr ? utr.trim() : "UPI" + Math.floor(100000000000 + Math.random() * 900000000000),
    screenshotUrl: screenshotUrl || SAMPLE_RECEIPT_IMAGE,
    submittedAt: "Just now",
    timestamp: Date.now(),
    adminNotes: "",
  };

  // Replace or prepend
  const updated = [newEntry, ...all.filter((s) => (s.userEmail || "").trim().toLowerCase() !== normEmail)];
  saveSubscriptions(updated);
  return newEntry;
}

export function approveSubscription(subscriptionId, adminNotes = "") {
  const all = getSubscriptions();
  const updated = all.map((sub) => {
    if (sub.id === subscriptionId) {
      return {
        ...sub,
        status: "Approved",
        adminNotes: adminNotes || "Approved by Central Regulatory Admin",
        approvedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        timestamp: Date.now(),
      };
    }
    return sub;
  });
  saveSubscriptions(updated);
  return updated;
}

export function rejectSubscription(subscriptionId, rejectionReason = "") {
  const all = getSubscriptions();
  const updated = all.map((sub) => {
    if (sub.id === subscriptionId) {
      return {
        ...sub,
        status: "Rejected",
        adminNotes: rejectionReason || "Screenshot could not be verified with bank UTR. Please upload a clear receipt.",
        rejectedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        timestamp: Date.now(),
      };
    }
    return sub;
  });
  saveSubscriptions(updated);
  return updated;
}

export function setDemoSubscriptionState(userEmail, mockStatus, options = {}) {
  const all = getSubscriptions();
  const normEmail = (userEmail || "").trim().toLowerCase();

  let existing = all.find((s) => (s.userEmail || "").trim().toLowerCase() === normEmail);
  if (!existing) {
    existing = {
      id: "sub-" + Date.now(),
      userId: options.userId || "usr-current",
      userEmail: normEmail,
      userName: options.userName || "AnnaSetu Member",
      role: options.role || "donor",
      planId: options.role === "ngo" ? "ngo-quarterly" : "donor-monthly",
      planName: options.role === "ngo" ? "NGO Plan: ₹1500 / 3 months" : "Donor Plan: ₹1500 / month",
      amount: "₹1,500",
      status: mockStatus,
      utr: "429104829104",
      screenshotUrl: SAMPLE_RECEIPT_IMAGE,
      submittedAt: "Just now",
      timestamp: Date.now(),
      adminNotes: options.adminNotes || "",
    };
    saveSubscriptions([existing, ...all]);
    return existing;
  }

  const updated = all.map((s) => {
    if ((s.userEmail || "").trim().toLowerCase() === normEmail) {
      return {
        ...s,
        status: mockStatus,
        adminNotes: options.adminNotes !== undefined ? options.adminNotes : s.adminNotes,
        timestamp: Date.now(),
      };
    }
    return s;
  });
  saveSubscriptions(updated);
  return updated.find((s) => (s.userEmail || "").trim().toLowerCase() === normEmail);
}

// Donor Quality Gamification Rating (Default: 4.6)
export function getDonorQualityRating(donorIdOrEmail) {
  try {
    if (typeof window === "undefined") return 4.6;
    const raw = localStorage.getItem(RATINGS_STORAGE_KEY);
    if (!raw) return 4.6;
    const parsed = JSON.parse(raw);
    const key = (donorIdOrEmail || "default").trim().toLowerCase();
    return parsed[key] !== undefined ? Number(parsed[key]) : 4.6;
  } catch {
    return 4.6;
  }
}

export function saveDonorQualityRating(donorIdOrEmail, rating) {
  try {
    const key = (donorIdOrEmail || "default").trim().toLowerCase();
    const val = Number(rating);
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem(RATINGS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed[key] = val;
      localStorage.setItem(RATINGS_STORAGE_KEY, JSON.stringify(parsed));
      if (broadcastChannel) {
        broadcastChannel.postMessage({
          actionType: "UPDATE_DONOR_RATING",
          donorKey: key,
          rating: val,
          timestamp: Date.now(),
        });
      }
    }
    return val;
  } catch {
    return rating;
  }
}
