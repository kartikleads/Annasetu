/**
 * AnnaSetu — Real-Time Hybrid Backend & Synchronization Service
 * src/services/backendService.js
 */

import { applySafetyExpiry } from "./matchingEngine.js";

const STORAGE_KEY = "annasetu-foods-v3";
const REQUISITIONS_KEY = "annasetu-requisitions-v3";
const CHANNEL_NAME = "annasetu_realtime_channel";
const TAB_ID =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "tab-" + Math.random().toString(36).slice(2);

let broadcastChannel = null;
try {
  if (typeof window !== "undefined" && "BroadcastChannel" in window) {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
  }
} catch {
  // Graceful fallback
}

export function normalizeFoodItem(item) {
  const quantity = Number(item.quantity) || 10;
  const unit = item.unit || "meals";
  const estimatedWeightKg =
    Number(item.estimatedWeightKg) ||
    (unit === "kg" ? quantity : Number((quantity * 0.4).toFixed(1)));

  const donorEmail = item.donorEmail
    ? String(item.donorEmail).trim().toLowerCase()
    : "";

  return {
    ...item,
    id: item.id ?? Date.now(),
    donorId: item.donorId ? String(item.donorId).trim() : "",
    name: item.name || "Surplus Food",
    category: item.category || "Vegetarian",
    quantity,
    remainingQuantity: Number(item.remainingQuantity ?? quantity),
    portionClaimed: Number(item.portionClaimed || 0),
    unit,
    estimatedWeightKg,
    packaging: item.packaging || "Sealed Food Containers",
    dietary: Array.isArray(item.dietary) ? item.dietary : ["100% Pure Veg"],
    prepTime: item.prepTime || "Prepared recently",
    storageConditions: item.storageConditions || "Ambient (Room Temp)",
    handlingInstructions:
      item.handlingInstructions || "Standard hygienic covered transport",
    dockInstructions: item.dockInstructions || "",
    targetNgo: item.targetNgo || "All",
    frequency: item.frequency || "One-Time Surplus",
    pickup: item.pickup || new Date(Date.now() + 2 * 3600000).toISOString().slice(0, 16),
    address: item.address || "Main Street",
    pincode: String(item.pincode || "240494").trim(),
    donor: (item.donor || "Commercial Donor").trim(),
    donorEmail,
    donorCoords: item.donorCoords || { lat: 28.4721, lng: 77.5054 },
    status: item.status || "Available",
    claimedBy: item.claimedBy || "",
    pickupStage:
      item.pickupStage ||
      (item.status === "Requested"
        ? "PendingApproval"
        : item.status === "Accepted"
        ? "Approved"
        : item.status === "Collected"
        ? "HandedOver"
        : "None"),
    pickupCode: item.pickupCode || "",
    requestDetails: item.requestDetails || null,
    collectionConfirmedByNgo: Boolean(item.collectionConfirmedByNgo),
    collectedAt: item.collectedAt || "",
    unavailableReason: item.unavailableReason || "",
    rejectedHistory: Array.isArray(item.rejectedHistory)
      ? item.rejectedHistory
      : [],
    donorRating: item.donorRating || null,
    ngoRating: item.ngoRating || null,
    rating: item.rating || null,
  };
}

export function checkDonorOwnership(food, user) {
  if (!food || !user) return false;

  const userId = String(user.id || "").trim();
  const userEmail = String(user.email || "").trim().toLowerCase();

  const foodDonorId = String(food.donorId || "").trim();
  const foodDonorEmail = String(food.donorEmail || "").trim().toLowerCase();

  // 1. Strict match on unique donorId
  if (foodDonorId && userId && foodDonorId === userId) {
    return true;
  }

  // 2. Strict match on unique donorEmail
  if (foodDonorEmail && userEmail && foodDonorEmail === userEmail) {
    return true;
  }

  return false;
}

export function normalizeRequisition(req) {
  return {
    id: req.id ?? `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    ngoName: req.ngoName || "Feeding India Charity Trust",
    ngoEmail: req.ngoEmail || "rescue@feedingindia.org",
    pincode: String(req.pincode || "240494").trim(),
    address: req.address || "Shelter Center, Sector 18",
    title: req.title || "Surplus Meal Requisition for Shelter",
    beneficiaryType: req.beneficiaryType || "Night Shelter",
    mealsNeeded: Number(req.mealsNeeded) || 40,
    categoryPreferred: req.categoryPreferred || "Cooked Vegetarian Meals",
    urgency: req.urgency || "Tonight's Dinner",
    deliveryPreference: req.deliveryPreference || "NGO Volunteer Pickup",
    contactPerson: req.contactPerson || "Aarav Sharma",
    contactPhone: req.contactPhone || "9876543210",
    note: req.note || "Insulated food vehicle on standby.",
    status: req.status || "Open", // Open | Pledged | Fulfilled
    pledgedBy: req.pledgedBy || "",
    pledgedAt: req.pledgedAt || "",
    createdAt: req.createdAt || new Date().toISOString(),
  };
}

export function loadFoods() {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.removeItem("annasetu-foods");
      localStorage.removeItem("annasetu-foods-v2");
    }

    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return [];
    }
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const cleaned = parsed.filter((item) => {
        const donor = (item.donor || "").toLowerCase();
        // Only purge legacy template mock test users, never user food listings
        if (donor.includes("green leaf") || donor.includes("fresh basket")) {
          return false;
        }
        return true;
      });
      return applySafetyExpiry(cleaned.map(normalizeFoodItem));
    }
    return [];
  } catch {
    return [];
  }
}

export async function fetchFoodsFromCloud() {
  try {
    const res = await fetch("/api/foods");
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.foods)) {
        const normalized = data.foods.map(normalizeFoodItem);
        saveFoodsToStorage(normalized);
        return applySafetyExpiry(normalized);
      }
    }
  } catch (err) {
    console.warn("[backendService] Cloud foods sync error:", err.message);
  }
  return loadFoods();
}

export function saveFoodsToStorage(foods) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(foods));
  } catch (err) {
    console.warn("[backendService] localStorage save error:", err.message);
  }
}

export function loadRequisitions() {
  try {
    const saved = localStorage.getItem(REQUISITIONS_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed)) {
      return parsed.map(normalizeRequisition);
    }
    return [];
  } catch {
    return [];
  }
}

export async function fetchRequisitionsFromCloud() {
  try {
    const res = await fetch("/api/requisitions");
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.requisitions)) {
        const normalized = data.requisitions.map(normalizeRequisition);
        saveRequisitionsToStorage(normalized);
        return normalized;
      }
    }
  } catch (err) {
    console.warn("[backendService] Cloud requisitions sync error:", err.message);
  }
  return loadRequisitions();
}

export function saveRequisitionsToStorage(reqs) {
  try {
    localStorage.setItem(REQUISITIONS_KEY, JSON.stringify(reqs));
  } catch (err) {
    console.warn("[backendService] saveRequisitions error:", err.message);
  }
}

export function resetToCleanData() {
  try {
    localStorage.removeItem("annasetu-foods");
    localStorage.removeItem("annasetu-foods-v2");
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(REQUISITIONS_KEY);
    fetch("/api/foods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ foods: [] }),
    }).catch(() => {});
    fetch("/api/requisitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requisitions: [] }),
    }).catch(() => {});
  } catch {
    // ignore
  }
  return [];
}

export function broadcastFoodMutation(foods, actionType = "UPDATE_FOODS") {
  if (typeof window !== "undefined") {
    saveFoodsToStorage(foods);
    if (broadcastChannel) {
      broadcastChannel.postMessage({
        senderTabId: TAB_ID,
        actionType,
        foods,
        timestamp: Date.now(),
      });
    }
    // Asynchronously sync to Cloudflare KV / Edge
    fetch("/api/foods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ foods }),
    }).catch((err) => {
      console.warn("[backendService] Food cloud persistence warning:", err.message);
    });
  }
}

export function broadcastRequisitionMutation(requisitions, actionType = "UPDATE_REQS") {
  if (typeof window !== "undefined") {
    saveRequisitionsToStorage(requisitions);
    if (broadcastChannel) {
      broadcastChannel.postMessage({
        senderTabId: TAB_ID,
        actionType,
        requisitions,
        timestamp: Date.now(),
      });
    }
    // Asynchronously sync to Cloudflare KV / Edge
    fetch("/api/requisitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requisitions }),
    }).catch((err) => {
      console.warn("[backendService] Requisition cloud persistence warning:", err.message);
    });
  }
}

export function subscribeToCrossTabEvents(onFoodUpdate, onRequisitionUpdate) {
  if (!broadcastChannel) return () => {};

  const handleMessage = (event) => {
    const data = event.data;
    if (!data || data.senderTabId === TAB_ID) return;
    if (Array.isArray(data.foods) && onFoodUpdate) {
      onFoodUpdate(data.foods.map(normalizeFoodItem));
    }
    if (Array.isArray(data.requisitions) && onRequisitionUpdate) {
      onRequisitionUpdate(data.requisitions.map(normalizeRequisition));
    }
  };

  broadcastChannel.addEventListener("message", handleMessage);
  return () => {
    broadcastChannel.removeEventListener("message", handleMessage);
  };
}
